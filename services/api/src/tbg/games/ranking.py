"""Deterministic lottery ranking — ZERO randomness.

Users ranked by best_difficulty DESC, then by earliest timestamp ASC,
then by total_shares DESC as the final tiebreaker.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from tbg.games.week_utils import calculate_percentile


def determine_xp_tier(rank: int) -> int:
    """Determine XP reward based on lottery rank.

    Top 10  → 100 XP
    Top 50  → 50 XP
    Top 100 → 25 XP
    101+    → 10 XP (participation)
    """
    if rank <= 10:
        return 100
    elif rank <= 50:
        return 50
    elif rank <= 100:
        return 25
    else:
        return 10


def rank_participants(
    participants: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Rank participants deterministically by best difficulty.

    Input: list of dicts with at least:
        - user_id: int
        - best_difficulty: float
        - best_diff_time: datetime (optional, for tiebreaking)
        - total_shares: int (optional, for tiebreaking)

    Output: same list sorted and augmented with:
        - rank: int (1-indexed)
        - percentile: float
        - xp_awarded: int
    """
    if not participants:
        return []

    # Sort: best_difficulty DESC, best_diff_time ASC (earlier wins), total_shares DESC
    _far_future = datetime(2099, 12, 31, 23, 59, 59)

    def sort_key(p: dict[str, Any]) -> tuple[float, datetime, int]:
        return (
            -p.get("best_difficulty", 0),
            p.get("best_diff_time", _far_future),
            -p.get("total_shares", 0),
        )

    sorted_p = sorted(participants, key=sort_key)
    total = len(sorted_p)

    for idx, p in enumerate(sorted_p):
        rank = idx + 1
        p["rank"] = rank
        p["percentile"] = calculate_percentile(rank, total)
        p["xp_awarded"] = determine_xp_tier(rank)

    return sorted_p
