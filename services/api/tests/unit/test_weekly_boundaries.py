"""Unit tests for week boundary computation."""

from datetime import date, datetime, time, timezone

from tbg.games.week_utils import (
    calculate_percentile,
    get_current_week_iso,
    get_last_week_iso,
    get_monday,
    get_week_boundaries,
    get_week_iso,
    iso_week_to_dates,
)


class TestWeeklyBoundaries:
    """Test week boundary computation for games."""

    def test_monday_is_start_of_week(self):
        dt = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)  # Monday
        start, end = get_week_boundaries(dt)
        assert start.weekday() == 0  # Monday
        assert start.hour == 0
        assert start.minute == 0
        assert start.second == 0

    def test_sunday_is_end_of_week(self):
        dt = datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc)  # Sunday
        start, end = get_week_boundaries(dt)
        assert end.weekday() == 6  # Sunday
        assert end.hour == 23
        assert end.minute == 59
        assert end.second == 59

    def test_friday_belongs_to_current_week(self):
        """A share on Friday should be in the same week as Monday."""
        mon = datetime(2026, 2, 23, 10, 0, 0, tzinfo=timezone.utc)
        fri = datetime(2026, 2, 27, 10, 0, 0, tzinfo=timezone.utc)
        assert get_week_iso(mon) == get_week_iso(fri)

    def test_saturday_belongs_to_current_week(self):
        mon = datetime(2026, 2, 23, 10, 0, 0, tzinfo=timezone.utc)
        sat = datetime(2026, 2, 28, 10, 0, 0, tzinfo=timezone.utc)
        assert get_week_iso(mon) == get_week_iso(sat)

    def test_sunday_belongs_to_current_week(self):
        mon = datetime(2026, 2, 23, 10, 0, 0, tzinfo=timezone.utc)
        sun = datetime(2026, 3, 1, 10, 0, 0, tzinfo=timezone.utc)
        assert get_week_iso(mon) == get_week_iso(sun)

    def test_next_monday_is_new_week(self):
        sun = datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc)
        next_mon = datetime(2026, 3, 2, 0, 0, 0, tzinfo=timezone.utc)
        assert get_week_iso(sun) != get_week_iso(next_mon)

    def test_week_boundaries_span_7_days(self):
        dt = datetime(2026, 2, 25, 12, 0, 0, tzinfo=timezone.utc)  # Wednesday
        start, end = get_week_boundaries(dt)
        diff = (end - start).total_seconds()
        # 6 days + 23:59:59 = 604799 seconds
        assert diff == 6 * 86400 + 23 * 3600 + 59 * 60 + 59


class TestGetMonday:
    """Test Monday computation."""

    def test_monday_returns_itself(self):
        mon = datetime(2026, 2, 23, 15, 30, 0, tzinfo=timezone.utc)
        assert get_monday(mon) == date(2026, 2, 23)

    def test_wednesday_returns_monday(self):
        wed = datetime(2026, 2, 25, 8, 0, 0, tzinfo=timezone.utc)
        assert get_monday(wed) == date(2026, 2, 23)

    def test_sunday_returns_monday(self):
        sun = datetime(2026, 3, 1, 23, 0, 0, tzinfo=timezone.utc)
        assert get_monday(sun) == date(2026, 2, 23)

    def test_date_input(self):
        d = date(2026, 2, 27)  # Friday
        assert get_monday(d) == date(2026, 2, 23)


class TestWeekISO:
    """Test ISO week string generation."""

    def test_week_iso_format(self):
        dt = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        iso = get_week_iso(dt)
        assert iso == "2026-W09"

    def test_current_and_last_week(self):
        now = datetime(2026, 2, 25, 12, 0, 0, tzinfo=timezone.utc)
        current = get_current_week_iso(now)
        last = get_last_week_iso(now)
        assert current == "2026-W09"
        assert last == "2026-W08"

    def test_year_boundary(self):
        """Dec 31 2025 could be ISO week 1 of 2026 depending on day."""
        dt = datetime(2025, 12, 29, 0, 0, 0, tzinfo=timezone.utc)  # Monday
        iso = get_week_iso(dt)
        assert iso == "2026-W01"


class TestISOWeekToDates:
    """Test ISO week string to date conversion."""

    def test_week_09_2026(self):
        monday, sunday = iso_week_to_dates("2026-W09")
        assert monday == date(2026, 2, 23)
        assert sunday == date(2026, 3, 1)

    def test_week_01_2026(self):
        monday, sunday = iso_week_to_dates("2026-W01")
        assert monday == date(2025, 12, 29)
        assert sunday == date(2026, 1, 4)
        assert monday.weekday() == 0  # Monday
        assert sunday.weekday() == 6  # Sunday

    def test_round_trip(self):
        """iso_week_to_dates → get_week_iso should be consistent."""
        dt = datetime(2026, 2, 23, 0, 0, 0, tzinfo=timezone.utc)
        week_iso = get_week_iso(dt)
        monday, sunday = iso_week_to_dates(week_iso)
        assert monday == date(2026, 2, 23)
