"""Week boundary utilities for games and lottery.

Reuses core logic from streak_service but adds date-range helpers
specific to the game data aggregation layer.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone


def get_week_iso(dt: datetime) -> str:
    """Get ISO week string e.g. '2026-W09'. Uses %G-W%V (ISO year + ISO week)."""
    return dt.strftime("%G-W%V")


def get_monday(dt: datetime | date) -> date:
    """Get the Monday of the ISO week containing dt."""
    d = dt.date() if isinstance(dt, datetime) else dt
    return d - timedelta(days=d.weekday())


def get_current_week_iso(now: datetime | None = None) -> str:
    """Get the ISO week string for the current week."""
    if now is None:
        now = datetime.now(timezone.utc)
    return get_week_iso(now)


def get_last_week_iso(now: datetime | None = None) -> str:
    """Get the ISO week string for the week that just ended."""
    if now is None:
        now = datetime.now(timezone.utc)
    return get_week_iso(now - timedelta(weeks=1))


def get_week_boundaries(dt: datetime | None = None) -> tuple[datetime, datetime]:
    """Get (Monday 00:00 UTC, Sunday 23:59:59 UTC) for the ISO week containing dt."""
    if dt is None:
        dt = datetime.now(timezone.utc)
    monday = get_monday(dt)
    sunday = monday + timedelta(days=6)
    start = datetime.combine(monday, time.min, tzinfo=timezone.utc)
    end = datetime.combine(sunday, time(23, 59, 59), tzinfo=timezone.utc)
    return start, end


def get_current_week_boundaries() -> tuple[datetime, datetime]:
    """Get boundaries for the current ISO week."""
    return get_week_boundaries(datetime.now(timezone.utc))


def iso_week_to_dates(week_iso: str) -> tuple[date, date]:
    """Convert '2026-W09' to (Monday date, Sunday date).

    Uses ISO 8601: Monday is day 1 of the ISO week.
    """
    # Parse "YYYY-WNN" → Monday of that ISO week
    monday = datetime.strptime(week_iso + "-1", "%G-W%V-%u").date()
    sunday = monday + timedelta(days=6)
    return monday, sunday


def calculate_percentile(rank: int, total: int) -> float:
    """Calculate percentile from rank and total participants.

    Rank 1 out of 100 → 99.0 (top 1%)
    Rank 50 out of 100 → 50.0 (median)
    Rank 100 out of 100 → 0.0 (bottom)
    """
    if total <= 0 or rank <= 0:
        return 0.0
    return round(100 - (rank / total * 100), 2)
