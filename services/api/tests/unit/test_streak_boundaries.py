"""Streak boundary tests — week boundaries in UTC."""

from datetime import datetime, timezone

import pytest

from tbg.gamification.streak_service import get_current_week_iso, get_last_week_iso, get_monday, get_week_iso


class TestWeekISO:
    """Test ISO week string generation."""

    def test_monday_00_00_is_new_week(self):
        """Monday 00:00:00 UTC belongs to the new week."""
        dt = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)  # Monday
        assert get_week_iso(dt) == "2026-W09"

    def test_sunday_23_59_is_same_week(self):
        """Sunday 23:59:59 UTC belongs to the same week as the preceding Monday."""
        dt = datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc)  # Sunday
        assert get_week_iso(dt) == "2026-W09"

    def test_sunday_to_monday_boundary(self):
        """Sun 23:59:59 and Mon 00:00:00 are different weeks."""
        sun = datetime(2026, 2, 22, 23, 59, 59, tzinfo=timezone.utc)  # Sunday
        mon = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)  # Monday
        assert get_week_iso(sun) != get_week_iso(mon)
        assert get_week_iso(sun) == "2026-W08"
        assert get_week_iso(mon) == "2026-W09"

    def test_year_boundary_week(self):
        """Verify ISO week at year boundary (Dec 29, 2025 is W01 of 2026)."""
        dt = datetime(2025, 12, 29, 12, 0, 0, tzinfo=timezone.utc)  # Monday
        assert get_week_iso(dt) == "2026-W01"

    def test_regular_midweek(self):
        """Wednesday belongs to same week as Monday."""
        dt = datetime(2026, 2, 25, 14, 30, 0, tzinfo=timezone.utc)  # Wednesday
        assert get_week_iso(dt) == "2026-W09"

    def test_friday_same_week(self):
        """Friday belongs to same week as Monday."""
        dt = datetime(2026, 2, 27, 22, 0, 0, tzinfo=timezone.utc)  # Friday
        assert get_week_iso(dt) == "2026-W09"


class TestGetMonday:
    """Test Monday calculation."""

    def test_monday_returns_itself(self):
        dt = datetime(2026, 2, 23, 12, 0, 0, tzinfo=timezone.utc)
        assert get_monday(dt).isoformat() == "2026-02-23"

    def test_sunday_returns_previous_monday(self):
        dt = datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)
        assert get_monday(dt).isoformat() == "2026-02-23"

    def test_wednesday_returns_monday(self):
        dt = datetime(2026, 2, 25, 12, 0, 0, tzinfo=timezone.utc)
        assert get_monday(dt).isoformat() == "2026-02-23"


class TestLastWeekISO:
    """Test last week calculation."""

    def test_last_week_from_monday(self):
        now = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        assert get_last_week_iso(now) == "2026-W08"

    def test_last_week_from_mid_week(self):
        now = datetime(2026, 2, 25, 12, 0, 0, tzinfo=timezone.utc)
        assert get_last_week_iso(now) == "2026-W08"


class TestCurrentWeekISO:
    """Test current week calculation."""

    def test_current_week(self):
        now = datetime(2026, 2, 23, 12, 0, 0, tzinfo=timezone.utc)
        assert get_current_week_iso(now) == "2026-W09"
