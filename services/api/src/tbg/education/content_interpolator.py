"""Replace dynamic placeholders in lesson Markdown with user-specific data."""

from __future__ import annotations

import re

PLACEHOLDER_PATTERN = re.compile(r"\{(\w+)\}")


def interpolate_content(
    markdown: str,
    user_data: dict[str, str],
) -> str:
    """Replace {placeholder} tokens in Markdown with user-specific data.

    Unknown placeholders are left as-is (no error).
    """

    def replacer(match: re.Match) -> str:
        key = match.group(1)
        return user_data.get(key, match.group(0))

    return PLACEHOLDER_PATTERN.sub(replacer, markdown)


def format_number(value: float) -> str:
    """Format a number with T/G/M/K suffixes for display."""
    if value >= 1_000_000_000_000:
        return f"{value / 1_000_000_000_000:.1f}T"
    if value >= 1_000_000_000:
        return f"{value / 1_000_000_000:.1f}G"
    if value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    if value >= 1_000:
        return f"{value:,.0f}"
    return f"{value:.2f}"


async def get_user_interpolation_data(
    user_id: int,
    redis_client: object,
) -> dict[str, str]:
    """Build interpolation data dict for a specific user.

    Falls back to sensible defaults if Redis keys are missing.
    """
    # Get latest hashrate from Redis
    hashrate_raw = await redis_client.get(f"user:hashrate:{user_id}")  # type: ignore[union-attr]
    hashrate = float(hashrate_raw) if hashrate_raw else 500_000_000_000  # 500 GH/s

    # Get share difficulty
    share_diff_raw = await redis_client.get(f"user:share_diff:{user_id}")  # type: ignore[union-attr]
    share_diff = float(share_diff_raw) if share_diff_raw else 65536.0

    # Get network difficulty
    net_diff_raw = await redis_client.get("network:difficulty")  # type: ignore[union-attr]
    net_diff = float(net_diff_raw) if net_diff_raw else 86_388_558_925_171.0

    ratio = net_diff / share_diff if share_diff > 0 else 0

    return {
        "hashrate": f"{format_number(hashrate)} H/s",
        "shareDiff": format_number(share_diff),
        "networkDiff": format_number(net_diff),
        "ratio": format_number(ratio),
    }
