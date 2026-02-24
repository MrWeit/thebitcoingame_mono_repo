"""Education service — track/lesson management and completion tracking."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    EducationLesson,
    EducationTrack,
    UserLessonCompletion,
    UserTrackCompletion,
)
from tbg.education.content_interpolator import (
    get_user_interpolation_data,
    interpolate_content,
)

logger = logging.getLogger(__name__)

LESSON_XP = 25
TRACK_BONUS_XP = 50
RABBIT_HOLE_BADGE_SLUG = "rabbit_hole_complete"


class EducationService:
    """Education engine: content delivery, completion tracking, XP awards."""

    def __init__(
        self,
        db: AsyncSession,
        redis: object | None = None,
    ) -> None:
        self.db = db
        self.redis = redis

    # --- Public Content (no auth) ---

    async def list_tracks(self) -> list[EducationTrack]:
        """List all published education tracks ordered by position."""
        result = await self.db.execute(
            select(EducationTrack)
            .where(EducationTrack.is_published.is_(True))
            .order_by(EducationTrack.order)
        )
        return list(result.scalars().all())

    async def get_track(self, track_id: str) -> EducationTrack | None:
        """Get a track by ID."""
        return await self.db.get(EducationTrack, track_id)

    async def get_lesson_content(
        self,
        track_id: str,
        lesson_id: str,
        user_id: int | None = None,
    ) -> dict | None:
        """Get lesson content, interpolated with user data if authenticated."""
        result = await self.db.execute(
            select(EducationLesson).where(
                EducationLesson.id == lesson_id,
                EducationLesson.track_id == track_id,
            )
        )
        lesson = result.scalar_one_or_none()
        if not lesson:
            return None

        content = lesson.content

        # Interpolate with user data if authenticated and Redis available
        if user_id is not None and self.redis is not None:
            try:
                user_data = await get_user_interpolation_data(user_id, self.redis)
                content = interpolate_content(content, user_data)
            except Exception:
                logger.warning("Content interpolation failed", exc_info=True)

        return {
            "id": lesson.id,
            "track_id": lesson.track_id,
            "order": lesson.order,
            "title": lesson.title,
            "estimated_minutes": lesson.estimated_minutes,
            "content": content,
        }

    # --- Completion Tracking (auth required) ---

    async def complete_lesson(
        self,
        user_id: int,
        track_id: str,
        lesson_id: str,
    ) -> dict:
        """Mark a lesson as complete. Awards XP, checks track completion, triggers badge."""
        # Verify lesson exists
        result = await self.db.execute(
            select(EducationLesson).where(
                EducationLesson.id == lesson_id,
                EducationLesson.track_id == track_id,
            )
        )
        lesson = result.scalar_one_or_none()
        if not lesson:
            raise ValueError("Lesson not found")

        # Check if already completed (idempotent)
        existing = await self.db.execute(
            select(UserLessonCompletion).where(
                UserLessonCompletion.user_id == user_id,
                UserLessonCompletion.lesson_id == lesson_id,
            )
        )
        if existing.scalar_one_or_none():
            return {
                "completed": True,
                "already_completed": True,
                "xp_awarded": 0,
                "track_completed": False,
                "badge_earned": None,
            }

        now = datetime.now(timezone.utc)

        # Mark lesson complete
        completion = UserLessonCompletion(
            id=str(uuid4()),
            user_id=user_id,
            track_id=track_id,
            lesson_id=lesson_id,
            completed_at=now,
        )
        self.db.add(completion)

        # Award lesson XP
        xp_awarded = LESSON_XP
        await self._grant_xp(
            user_id=user_id,
            amount=LESSON_XP,
            source_id=lesson_id,
            description=f"Completed: {lesson.title}",
            idempotency_key=f"lesson:{lesson_id}:{user_id}",
        )

        # Record activity
        await self._record_activity(
            user_id=user_id,
            activity_type="lesson_completed",
            title=f"Completed lesson: {lesson.title}",
        )

        badge_earned = None
        track_completed = False

        # Check if track is now complete
        if await self._check_track_completion(user_id, track_id):
            track_completed = True
            xp_awarded += TRACK_BONUS_XP

            # Check for Rabbit Hole badge (first track ever)
            badge = await self._check_rabbit_hole_badge(user_id)
            if badge:
                badge_earned = RABBIT_HOLE_BADGE_SLUG

        await self.db.flush()

        # Send notification
        await self._notify(
            user_id=user_id,
            subtype="lesson_complete",
            title=f"Lesson Complete! +{LESSON_XP} XP",
            description=f'You completed "{lesson.title}".',
            action_url=f"/education/{track_id}",
        )

        return {
            "completed": True,
            "already_completed": False,
            "xp_awarded": xp_awarded,
            "track_completed": track_completed,
            "badge_earned": badge_earned,
        }

    async def _check_track_completion(self, user_id: int, track_id: str) -> bool:
        """Check if all lessons in a track are completed by this user."""
        total_result = await self.db.execute(
            select(func.count(EducationLesson.id)).where(
                EducationLesson.track_id == track_id
            )
        )
        total_lessons = total_result.scalar() or 0

        completed_result = await self.db.execute(
            select(func.count(UserLessonCompletion.id)).where(
                UserLessonCompletion.user_id == user_id,
                UserLessonCompletion.track_id == track_id,
            )
        )
        completed_lessons = completed_result.scalar() or 0

        if completed_lessons < total_lessons:
            return False

        # Check if already recorded
        existing = await self.db.execute(
            select(UserTrackCompletion).where(
                UserTrackCompletion.user_id == user_id,
                UserTrackCompletion.track_id == track_id,
            )
        )
        if existing.scalar_one_or_none():
            return False  # Already recorded

        # Record track completion
        tc = UserTrackCompletion(
            id=str(uuid4()),
            user_id=user_id,
            track_id=track_id,
            completed_at=datetime.now(timezone.utc),
        )
        self.db.add(tc)

        # Award track bonus XP
        track = await self.db.get(EducationTrack, track_id)
        track_title = track.title if track else track_id
        await self._grant_xp(
            user_id=user_id,
            amount=TRACK_BONUS_XP,
            source_id=track_id,
            description=f"Track Complete: {track_title}",
            idempotency_key=f"track:{track_id}:{user_id}",
        )

        # Record activity
        await self._record_activity(
            user_id=user_id,
            activity_type="track_completed",
            title=f"Completed track: {track_title}",
        )

        # Send notification
        await self._notify(
            user_id=user_id,
            subtype="track_complete",
            title=f"Track Complete! +{TRACK_BONUS_XP} XP",
            description=f'You finished the entire "{track_title}" track!',
            action_url=f"/education/{track_id}",
        )

        return True

    async def _check_rabbit_hole_badge(self, user_id: int) -> bool:
        """Award 'Rabbit Hole Complete' badge on first track completion."""
        count_result = await self.db.execute(
            select(func.count(UserTrackCompletion.id)).where(
                UserTrackCompletion.user_id == user_id
            )
        )
        track_count = count_result.scalar() or 0

        if track_count == 1:  # Just completed first track
            try:
                from tbg.gamification.badge_service import award_badge

                awarded = await award_badge(
                    db=self.db,
                    redis=self.redis,
                    user_id=user_id,
                    badge_slug=RABBIT_HOLE_BADGE_SLUG,
                    event_id="education_track_complete",
                )
                return awarded
            except Exception:
                logger.warning("Badge award failed", exc_info=True)
                return False
        return False

    # --- Progress & Recommendations ---

    async def get_progress(self, user_id: int) -> dict:
        """Get user's education progress across all tracks."""
        tracks = await self.list_tracks()
        progress = []

        for track in tracks:
            total_result = await self.db.execute(
                select(func.count(EducationLesson.id)).where(
                    EducationLesson.track_id == track.id
                )
            )
            total_lessons = total_result.scalar() or 0

            completed_result = await self.db.execute(
                select(func.count(UserLessonCompletion.id)).where(
                    UserLessonCompletion.user_id == user_id,
                    UserLessonCompletion.track_id == track.id,
                )
            )
            completed_lessons = completed_result.scalar() or 0

            completed_ids_result = await self.db.execute(
                select(UserLessonCompletion.lesson_id).where(
                    UserLessonCompletion.user_id == user_id,
                    UserLessonCompletion.track_id == track.id,
                )
            )

            track_complete_result = await self.db.execute(
                select(UserTrackCompletion).where(
                    UserTrackCompletion.user_id == user_id,
                    UserTrackCompletion.track_id == track.id,
                )
            )

            progress.append({
                "track_id": track.id,
                "track_title": track.title,
                "total_lessons": total_lessons,
                "completed_lessons": completed_lessons,
                "completed_lesson_ids": list(completed_ids_result.scalars().all()),
                "percent": round(completed_lessons / total_lessons * 100) if total_lessons > 0 else 0,
                "track_completed": track_complete_result.scalar_one_or_none() is not None,
            })

        return {
            "tracks": progress,
            "total_lessons": sum(t["total_lessons"] for t in progress),
            "total_completed": sum(t["completed_lessons"] for t in progress),
            "tracks_completed": sum(1 for t in progress if t["track_completed"]),
        }

    async def get_recommendations(self, user_id: int) -> list[dict]:
        """Recommend next lessons based on user progress.

        Strategy:
        1. In-progress tracks: next uncompleted lesson
        2. Not-started tracks: first lesson
        3. Sort by: in-progress first (by highest completion %), then not-started
        """
        progress = await self.get_progress(user_id)
        recommendations = []

        for track in progress["tracks"]:
            if track["track_completed"]:
                continue

            # Find next uncompleted lesson in this track
            lessons_result = await self.db.execute(
                select(EducationLesson)
                .where(EducationLesson.track_id == track["track_id"])
                .order_by(EducationLesson.order)
            )

            for lesson in lessons_result.scalars().all():
                if lesson.id not in track["completed_lesson_ids"]:
                    recommendations.append({
                        "track_id": track["track_id"],
                        "track_title": track["track_title"],
                        "lesson_id": lesson.id,
                        "lesson_title": lesson.title,
                        "estimated_minutes": lesson.estimated_minutes,
                        "track_progress": track["percent"],
                        "reason": "in_progress" if track["percent"] > 0 else "not_started",
                    })
                    break

        # Sort: in-progress first (by highest completion %), then not-started
        recommendations.sort(
            key=lambda r: (0 if r["reason"] == "in_progress" else 1, -r["track_progress"])
        )

        return recommendations

    # --- Integration Helpers ---

    async def _grant_xp(
        self,
        user_id: int,
        amount: int,
        source_id: str,
        description: str,
        idempotency_key: str,
    ) -> None:
        """Grant XP via the gamification engine."""
        try:
            from tbg.gamification.xp_service import grant_xp

            await grant_xp(
                db=self.db,
                redis=self.redis,
                user_id=user_id,
                amount=amount,
                source="education",
                source_id=source_id,
                description=description,
                idempotency_key=idempotency_key,
            )
        except Exception:
            logger.warning("XP grant failed for user %s", user_id, exc_info=True)

    async def _record_activity(
        self,
        user_id: int,
        activity_type: str,
        title: str,
    ) -> None:
        """Record activity via the social activity service."""
        try:
            from tbg.social.activity_service import record_activity

            await record_activity(
                db=self.db,
                user_id=user_id,
                activity_type=activity_type,
                title=title,
            )
        except Exception:
            logger.warning("Activity recording failed", exc_info=True)

    async def _notify(
        self,
        user_id: int,
        subtype: str,
        title: str,
        description: str,
        action_url: str | None = None,
    ) -> None:
        """Send notification via the notification service."""
        try:
            from tbg.social.notification_service import create_notification

            await create_notification(
                db=self.db,
                user_id=user_id,
                type_="gamification",
                subtype=subtype,
                title=title,
                description=description,
                action_url=action_url,
                action_label="Continue Learning",
                redis=self.redis,
            )
        except Exception:
            logger.warning("Notification failed", exc_info=True)
