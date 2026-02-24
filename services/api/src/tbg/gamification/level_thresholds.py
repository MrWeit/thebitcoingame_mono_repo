"""Level thresholds and computation.

These values MUST match the frontend exactly:
  dashboard/src/stores/userStore.ts (lines 31-47)
"""

from __future__ import annotations

LEVEL_THRESHOLDS: list[dict] = [
    {"level": 1, "title": "Nocoiner", "xp_required": 0, "cumulative": 0},
    {"level": 2, "title": "Curious Cat", "xp_required": 100, "cumulative": 100},
    {"level": 3, "title": "Hash Pupil", "xp_required": 500, "cumulative": 600},
    {"level": 4, "title": "Solo Miner", "xp_required": 1000, "cumulative": 1600},
    {"level": 5, "title": "Difficulty Hunter", "xp_required": 2500, "cumulative": 4100},
    {"level": 6, "title": "Share Collector", "xp_required": 3000, "cumulative": 7100},
    {"level": 7, "title": "Hash Veteran", "xp_required": 3500, "cumulative": 10600},
    {"level": 8, "title": "Block Chaser", "xp_required": 4000, "cumulative": 14600},
    {"level": 9, "title": "Nonce Grinder", "xp_required": 5000, "cumulative": 19600},
    {"level": 10, "title": "Hashrate Warrior", "xp_required": 10000, "cumulative": 29600},
    {"level": 15, "title": "Diff Hunter", "xp_required": 25000, "cumulative": 79600},
    {"level": 20, "title": "Mining Veteran", "xp_required": 50000, "cumulative": 179600},
    {"level": 25, "title": "Satoshi's Apprentice", "xp_required": 100000, "cumulative": 429600},
    {"level": 30, "title": "Cypherpunk", "xp_required": 250000, "cumulative": 929600},
    {"level": 50, "title": "Timechain Guardian", "xp_required": 1000000, "cumulative": 4929600},
]


def compute_level(total_xp: int) -> dict:
    """Compute level info from total XP.

    Must match frontend getLevelInfo() exactly.
    """
    current = LEVEL_THRESHOLDS[0]
    next_level = LEVEL_THRESHOLDS[1]

    for i in range(len(LEVEL_THRESHOLDS) - 1):
        if total_xp >= LEVEL_THRESHOLDS[i]["cumulative"]:
            current = LEVEL_THRESHOLDS[i]
            next_level = LEVEL_THRESHOLDS[i + 1]

    # Handle XP beyond max level
    if total_xp >= LEVEL_THRESHOLDS[-1]["cumulative"]:
        current = LEVEL_THRESHOLDS[-1]
        next_level = LEVEL_THRESHOLDS[-1]

    xp_into_level = total_xp - current["cumulative"]
    xp_for_level = next_level["cumulative"] - current["cumulative"]

    # At max level, avoid division by zero
    if xp_for_level == 0:
        xp_for_level = 1

    return {
        "level": current["level"],
        "title": current["title"],
        "xp_into_level": xp_into_level,
        "xp_for_level": xp_for_level,
        "next_level": next_level["level"],
        "next_title": next_level["title"],
    }
