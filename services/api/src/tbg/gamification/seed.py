"""Badge seed data — 20 badges matching dashboard/src/mocks/badges.ts exactly."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import BadgeDefinition, BadgeStats

logger = logging.getLogger(__name__)

BADGE_SEED_DATA: list[dict] = [
    # Mining Milestones
    {
        "slug": "first_share",
        "name": "First Hash",
        "description": "Submit your very first share to the pool",
        "category": "mining",
        "rarity": "common",
        "xp_reward": 50,
        "trigger_type": "share_count",
        "trigger_config": {"threshold": 1},
        "sort_order": 1,
    },
    {
        "slug": "shares_1k",
        "name": "Hash Thousand",
        "description": "Submit 1,000 shares \u2014 you're getting the hang of this",
        "category": "mining",
        "rarity": "common",
        "xp_reward": 100,
        "trigger_type": "share_count",
        "trigger_config": {"threshold": 1000},
        "sort_order": 2,
    },
    {
        "slug": "shares_1m",
        "name": "Megahash",
        "description": "One million shares submitted. A true mining machine.",
        "category": "mining",
        "rarity": "rare",
        "xp_reward": 200,
        "trigger_type": "share_count",
        "trigger_config": {"threshold": 1_000_000},
        "sort_order": 3,
    },
    {
        "slug": "block_finder",
        "name": "Block Finder",
        "description": "Find a Bitcoin block solo. The ultimate achievement.",
        "category": "mining",
        "rarity": "legendary",
        "xp_reward": 500,
        "trigger_type": "block_found",
        "trigger_config": {"required": True},
        "sort_order": 4,
    },
    # Difficulty Records
    {
        "slug": "diff_1e6",
        "name": "Million Club",
        "description": "Achieve a best difficulty above 1,000,000",
        "category": "mining",
        "rarity": "common",
        "xp_reward": 50,
        "trigger_type": "best_diff",
        "trigger_config": {"threshold": 1_000_000},
        "sort_order": 5,
    },
    {
        "slug": "diff_1e9",
        "name": "Billion Club",
        "description": "Achieve a best difficulty above 1,000,000,000",
        "category": "mining",
        "rarity": "rare",
        "xp_reward": 100,
        "trigger_type": "best_diff",
        "trigger_config": {"threshold": 1_000_000_000},
        "sort_order": 6,
    },
    {
        "slug": "diff_1e12",
        "name": "Trillion Club",
        "description": "Achieve a best difficulty above 1,000,000,000,000",
        "category": "mining",
        "rarity": "epic",
        "xp_reward": 200,
        "trigger_type": "best_diff",
        "trigger_config": {"threshold": 1_000_000_000_000},
        "sort_order": 7,
    },
    {
        "slug": "weekly_diff_champion",
        "name": "Diff Champion",
        "description": "Achieve the highest difficulty of the week globally",
        "category": "mining",
        "rarity": "epic",
        "xp_reward": 300,
        "trigger_type": "event",
        "trigger_config": {"event": "weekly_diff_champion"},
        "sort_order": 8,
    },
    # Streaks
    {
        "slug": "streak_4",
        "name": "Month Strong",
        "description": "Maintain a 4-week consecutive mining streak",
        "category": "streak",
        "rarity": "common",
        "xp_reward": 100,
        "trigger_type": "streak",
        "trigger_config": {"threshold": 4},
        "sort_order": 9,
    },
    {
        "slug": "streak_12",
        "name": "Quarter Master",
        "description": "Maintain a 12-week consecutive mining streak",
        "category": "streak",
        "rarity": "rare",
        "xp_reward": 200,
        "trigger_type": "streak",
        "trigger_config": {"threshold": 12},
        "sort_order": 10,
    },
    {
        "slug": "streak_52",
        "name": "Year of Mining",
        "description": "Mine every single week for an entire year",
        "category": "streak",
        "rarity": "legendary",
        "xp_reward": 500,
        "trigger_type": "streak",
        "trigger_config": {"threshold": 52},
        "sort_order": 11,
    },
    # Node Operator
    {
        "slug": "node_runner",
        "name": "Node Runner",
        "description": "Verified running a Bitcoin full node",
        "category": "node",
        "rarity": "rare",
        "xp_reward": 150,
        "trigger_type": "event",
        "trigger_config": {"event": "node_verified_full"},
        "sort_order": 12,
    },
    {
        "slug": "node_pruned",
        "name": "Pruned but Proud",
        "description": "Running a pruned Bitcoin node \u2014 still counts!",
        "category": "node",
        "rarity": "common",
        "xp_reward": 100,
        "trigger_type": "event",
        "trigger_config": {"event": "node_verified_pruned"},
        "sort_order": 13,
    },
    {
        "slug": "node_archival",
        "name": "Archival Node",
        "description": "Running a full archival Bitcoin node",
        "category": "node",
        "rarity": "epic",
        "xp_reward": 250,
        "trigger_type": "event",
        "trigger_config": {"event": "node_verified_archival"},
        "sort_order": 14,
    },
    # Competition
    {
        "slug": "world_cup_participant",
        "name": "World Cup Miner",
        "description": "Participate in any Bitcoin Mining World Cup event",
        "category": "competition",
        "rarity": "rare",
        "xp_reward": 200,
        "trigger_type": "event",
        "trigger_config": {"event": "world_cup_participate"},
        "sort_order": 15,
    },
    {
        "slug": "world_cup_winner",
        "name": "World Champion",
        "description": "Your country wins the Bitcoin Mining World Cup",
        "category": "competition",
        "rarity": "legendary",
        "xp_reward": 500,
        "trigger_type": "event",
        "trigger_config": {"event": "world_cup_win"},
        "sort_order": 16,
    },
    # Social / Education
    {
        "slug": "orange_piller",
        "name": "Orange Piller",
        "description": "Gift a Bitaxe to a nocoiner and bring them into Bitcoin",
        "category": "social",
        "rarity": "rare",
        "xp_reward": 200,
        "trigger_type": "event",
        "trigger_config": {"event": "gift_bitaxe"},
        "sort_order": 17,
    },
    {
        "slug": "rabbit_hole_complete",
        "name": "Down the Rabbit Hole",
        "description": "Complete an entire education track",
        "category": "social",
        "rarity": "common",
        "xp_reward": 150,
        "trigger_type": "event",
        "trigger_config": {"event": "track_complete"},
        "sort_order": 18,
    },
    {
        "slug": "coop_founder",
        "name": "Cooperative Founder",
        "description": "Create a mining cooperative and rally other miners",
        "category": "social",
        "rarity": "rare",
        "xp_reward": 150,
        "trigger_type": "event",
        "trigger_config": {"event": "coop_created"},
        "sort_order": 19,
    },
    {
        "slug": "coop_block",
        "name": "Team Block",
        "description": "Your cooperative finds a Bitcoin block together",
        "category": "social",
        "rarity": "legendary",
        "xp_reward": 500,
        "trigger_type": "event",
        "trigger_config": {"event": "coop_block_found"},
        "sort_order": 20,
    },
]


async def seed_badges(db: AsyncSession) -> int:
    """Upsert all 20 badge definitions. Returns number of badges seeded."""
    seeded = 0
    for badge_data in BADGE_SEED_DATA:
        stmt = pg_insert(BadgeDefinition).values(**badge_data)
        stmt = stmt.on_conflict_do_update(
            index_elements=["slug"],
            set_={
                "name": stmt.excluded.name,
                "description": stmt.excluded.description,
                "category": stmt.excluded.category,
                "rarity": stmt.excluded.rarity,
                "xp_reward": stmt.excluded.xp_reward,
                "trigger_type": stmt.excluded.trigger_type,
                "trigger_config": stmt.excluded.trigger_config,
                "sort_order": stmt.excluded.sort_order,
            },
        )
        await db.execute(stmt)
        seeded += 1

    # Ensure badge_stats rows exist for all badges
    badges = (await db.execute(select(BadgeDefinition))).scalars().all()
    for badge in badges:
        stats_stmt = pg_insert(BadgeStats).values(badge_id=badge.id)
        stats_stmt = stats_stmt.on_conflict_do_nothing(index_elements=["badge_id"])
        await db.execute(stats_stmt)

    await db.commit()
    logger.info("Seeded %d badge definitions", seeded)
    return seeded
