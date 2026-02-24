"""Education API endpoints — 6 routes for tracks, lessons, and progress."""

from __future__ import annotations

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.auth.jwt import verify_token
from tbg.auth.service import get_user_by_id
from tbg.database import get_session
from tbg.db.models import EducationLesson, User, UserLessonCompletion
from tbg.education.education_service import EducationService
from tbg.redis_client import get_redis

router = APIRouter(prefix="/api/v1/education", tags=["Education"])

_bearer_optional = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_optional),
    db: AsyncSession = Depends(get_session),
) -> User | None:
    """Extract user from JWT if present, return None otherwise."""
    if credentials is None:
        return None
    try:
        payload = verify_token(credentials.credentials, expected_type="access")
    except (jwt.InvalidTokenError, Exception):
        return None
    user = await get_user_by_id(db, int(payload["sub"]))
    if user is None or user.is_banned:
        return None
    return user


# ---- Endpoint 1: List tracks ----


@router.get("/tracks")
async def list_tracks(
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """List all education tracks. Public for SEO; enriched with progress if auth'd."""
    svc = EducationService(db, redis=get_redis())
    tracks = await svc.list_tracks()

    result = []
    progress_map: dict[str, dict] | None = None
    if user:
        progress = await svc.get_progress(user.id)
        progress_map = {t["track_id"]: t for t in progress["tracks"]}

    for track in tracks:
        track_data: dict = {
            "id": track.id,
            "title": track.title,
            "description": track.description,
            "lesson_count": track.lesson_count,
            "estimated_minutes": track.estimated_minutes,
        }
        if progress_map and track.id in progress_map:
            tp = progress_map[track.id]
            track_data["completed_lessons"] = tp["completed_lessons"]
            track_data["percent"] = tp["percent"]
            track_data["track_completed"] = tp["track_completed"]

        result.append(track_data)

    return {"tracks": result}


# ---- Endpoint 2: Track detail ----


@router.get("/tracks/{track_id}")
async def get_track(
    track_id: str,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Track detail with lesson list."""
    svc = EducationService(db, redis=get_redis())
    track = await svc.get_track(track_id)
    if not track:
        raise HTTPException(404, "Track not found")

    lessons_result = await db.execute(
        select(EducationLesson)
        .where(EducationLesson.track_id == track_id)
        .order_by(EducationLesson.order)
    )

    lesson_list = []
    for lesson in lessons_result.scalars().all():
        lesson_data: dict = {
            "id": lesson.id,
            "order": lesson.order,
            "title": lesson.title,
            "estimated_minutes": lesson.estimated_minutes,
        }
        if user:
            completed = await db.execute(
                select(UserLessonCompletion).where(
                    UserLessonCompletion.user_id == user.id,
                    UserLessonCompletion.lesson_id == lesson.id,
                )
            )
            lesson_data["completed"] = completed.scalar_one_or_none() is not None
        lesson_list.append(lesson_data)

    return {
        "id": track.id,
        "title": track.title,
        "description": track.description,
        "lesson_count": track.lesson_count,
        "estimated_minutes": track.estimated_minutes,
        "lessons": lesson_list,
    }


# ---- Endpoint 3: Lesson content ----


@router.get("/tracks/{track_id}/lessons/{lesson_id}")
async def get_lesson(
    track_id: str,
    lesson_id: str,
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Lesson content with dynamic interpolation. Public for SEO."""
    redis = get_redis()
    svc = EducationService(db, redis=redis)
    content = await svc.get_lesson_content(
        track_id, lesson_id, user_id=user.id if user else None
    )
    if not content:
        raise HTTPException(404, "Lesson not found")
    return content


# ---- Endpoint 4: Complete lesson ----


@router.post("/lessons/{lesson_id}/complete")
async def complete_lesson(
    lesson_id: str,
    user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Mark a lesson as complete. Requires authentication. Awards 25 XP."""
    if user is None:
        raise HTTPException(401, "Authentication required")

    # Find the lesson to get track_id
    lesson_result = await db.execute(
        select(EducationLesson).where(EducationLesson.id == lesson_id)
    )
    lesson = lesson_result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(404, "Lesson not found")

    redis = get_redis()
    svc = EducationService(db, redis=redis)
    result = await svc.complete_lesson(user.id, lesson.track_id, lesson_id)
    await db.commit()
    return result


# ---- Endpoint 5: Progress ----


@router.get("/progress")
async def get_progress(
    user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Get user's education progress across all tracks. Requires authentication."""
    if user is None:
        raise HTTPException(401, "Authentication required")

    svc = EducationService(db)
    return await svc.get_progress(user.id)


# ---- Endpoint 6: Recommendations ----


@router.get("/recommendations")
async def get_recommendations(
    user: User = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_session),
) -> dict:
    """Get recommended next lessons based on user's progress. Requires authentication."""
    if user is None:
        raise HTTPException(401, "Authentication required")

    svc = EducationService(db)
    recs = await svc.get_recommendations(user.id)
    return {"recommendations": recs}
