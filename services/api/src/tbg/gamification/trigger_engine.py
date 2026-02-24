"""Badge trigger engine — evaluates mining events against badge criteria."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import BadgeDefinition, User, UserGamification
from tbg.gamification.badge_service import award_badge, has_badge
from tbg.gamification.streak_service import update_streak_calendar
from tbg.gamification.xp_service import get_or_create_gamification

logger = logging.getLogger(__name__)


class TriggerEngine:
    """Evaluates badge triggers for mining events."""

    def __init__(self, db: AsyncSession, redis: object) -> None:
        self.db = db
        self.redis = redis
        self._badge_cache: dict[str, BadgeDefinition] | None = None

    async def _load_badges(self) -> dict[str, BadgeDefinition]:
        """Load and cache all badge definitions."""
        if self._badge_cache is None:
            result = await self.db.execute(
                select(BadgeDefinition).where(BadgeDefinition.is_active.is_(True))
            )
            self._badge_cache = {b.slug: b for b in result.scalars()}
        return self._badge_cache

    async def _resolve_user(self, data: dict) -> User | None:
        """Resolve user from event data (btc_address or user_id)."""
        btc_address = data.get("user", "")
        if not btc_address:
            return None

        result = await self.db.execute(
            select(User).where(User.btc_address == btc_address)
        )
        return result.scalar_one_or_none()

    async def evaluate(self, stream: str, event_id: str, data: dict) -> list[str]:
        """Evaluate all applicable triggers for an event.

        Returns list of badge slugs awarded (may be empty).
        """
        user = await self._resolve_user(data)
        if not user:
            return []

        awarded: list[str] = []

        # Update denormalized counters first
        await self._update_counters(user.id, stream, data)

        # Evaluate triggers based on event type
        if stream == "mining:share_submitted":
            awarded += await self._check_share_count_triggers(user.id)
            # Update streak calendar
            share_time = datetime.now(timezone.utc)
            share_diff = float(data.get("sdiff", data.get("diff", 0)))
            await update_streak_calendar(self.db, user.id, share_time, share_diff)

        elif stream == "mining:share_best_diff":
            awarded += await self._check_best_diff_triggers(user.id, data)

        elif stream == "mining:block_found":
            awarded += await self._check_block_found_triggers(user.id, data)

        await self.db.commit()
        return awarded

    async def _update_counters(self, user_id: int, stream: str, data: dict) -> None:
        """Update denormalized counters on user_gamification."""
        gam = await get_or_create_gamification(self.db, user_id)
        now = datetime.now(timezone.utc)

        if stream == "mining:share_submitted":
            gam.total_shares += 1
            gam.updated_at = now

        elif stream == "mining:share_best_diff":
            new_diff = float(data.get("diff", data.get("new_best", 0)))
            if new_diff > gam.best_difficulty:
                gam.best_difficulty = new_diff
                gam.updated_at = now

        elif stream == "mining:block_found":
            gam.blocks_found += 1
            gam.updated_at = now

        await self.db.flush()

    async def _check_share_count_triggers(self, user_id: int) -> list[str]:
        """Check share_count badge triggers."""
        gam = await get_or_create_gamification(self.db, user_id)
        badges = await self._load_badges()
        awarded = []

        share_count_badges = [
            ("first_share", 1),
            ("shares_1k", 1000),
            ("shares_1m", 1_000_000),
        ]

        for slug, threshold in share_count_badges:
            if gam.total_shares >= threshold and slug in badges:
                if await award_badge(self.db, self.redis, user_id, slug):
                    awarded.append(slug)

        return awarded

    async def _check_best_diff_triggers(self, user_id: int, data: dict) -> list[str]:
        """Check best_diff badge triggers."""
        share_diff = float(data.get("diff", data.get("share_diff", data.get("new_best", 0))))
        badges = await self._load_badges()
        awarded = []

        diff_badges = [
            ("diff_1e6", 1_000_000),
            ("diff_1e9", 1_000_000_000),
            ("diff_1e12", 1_000_000_000_000),
        ]

        for slug, threshold in diff_badges:
            if share_diff >= threshold and slug in badges:
                if await award_badge(
                    self.db, self.redis, user_id, slug,
                    metadata={"difficulty": str(share_diff)},
                ):
                    awarded.append(slug)

        return awarded

    async def _check_block_found_triggers(self, user_id: int, data: dict) -> list[str]:
        """Check block_found badge trigger."""
        awarded = []
        if await award_badge(
            self.db, self.redis, user_id, "block_finder",
            metadata={
                "height": str(data.get("height", "")),
                "reward": str(data.get("reward", "")),
            },
        ):
            awarded.append("block_finder")
        return awarded

    async def check_event_trigger(self, user_id: int, event_type: str) -> list[str]:
        """Check event-based badge triggers (called by feature APIs).

        event_type examples: world_cup_participate, coop_created, track_complete, etc.
        """
        badges = await self._load_badges()
        awarded = []

        for slug, badge in badges.items():
            if badge.trigger_type != "event":
                continue
            config = badge.trigger_config or {}
            if config.get("event") == event_type:
                if await award_badge(
                    self.db, self.redis, user_id, slug,
                    metadata={"event": event_type},
                ):
                    awarded.append(slug)

        if awarded:
            await self.db.commit()
        return awarded
