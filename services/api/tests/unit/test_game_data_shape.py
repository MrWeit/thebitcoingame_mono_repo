"""Unit tests for game data response shape validation."""

from datetime import datetime, timezone

from tbg.games.schemas import BlockFoundDataResponse, WeeklyGameDataResponse


class TestGameDataShape:
    """Ensure game data response matches frontend WeeklyGameData interface."""

    def test_daily_diffs_has_all_7_days(self):
        data = WeeklyGameDataResponse(
            week_start=datetime(2026, 2, 23, tzinfo=timezone.utc),
            week_end=datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc),
            best_difficulty=5_000_000_000,
            best_difficulty_time=datetime.now(timezone.utc),
            best_hash="0000000abc",
            network_difficulty=100_000_000_000_000,
            progress_ratio=5e9 / 1e14,
            daily_best_diffs={"mon": 1e9, "tue": 2e9, "wed": 3e9, "thu": 4e9, "fri": 5e9, "sat": 2e9, "sun": 3e9},
            total_shares=47_832,
            weekly_rank=12,
            percentile=94.0,
            block_found=False,
            user_name="SatoshiHunter",
        )
        assert set(data.daily_best_diffs.keys()) == {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

    def test_progress_ratio_calculation(self):
        best_diff = 5_000_000_000.0
        network_diff = 100_000_000_000_000.0
        expected = best_diff / network_diff

        data = WeeklyGameDataResponse(
            week_start=datetime(2026, 2, 23, tzinfo=timezone.utc),
            week_end=datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc),
            best_difficulty=best_diff,
            best_difficulty_time=None,
            best_hash="",
            network_difficulty=network_diff,
            progress_ratio=expected,
            daily_best_diffs={"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0},
            total_shares=0,
            weekly_rank=0,
            percentile=0.0,
            block_found=False,
            user_name="test",
        )
        assert abs(data.progress_ratio - expected) < 1e-20

    def test_zero_shares_returns_zero_data(self):
        data = WeeklyGameDataResponse(
            week_start=datetime(2026, 2, 23, tzinfo=timezone.utc),
            week_end=datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc),
            best_difficulty=0,
            best_difficulty_time=None,
            best_hash="",
            network_difficulty=100_000_000_000_000,
            progress_ratio=0,
            daily_best_diffs={"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0},
            total_shares=0,
            weekly_rank=0,
            percentile=0.0,
            block_found=False,
            user_name="test",
        )
        assert data.best_difficulty == 0
        assert data.total_shares == 0
        assert data.weekly_rank == 0
        assert all(v == 0 for v in data.daily_best_diffs.values())

    def test_block_found_data(self):
        block_data = BlockFoundDataResponse(
            height=879_412,
            reward=3.125,
            hash="0000000000000000000234abc891def456789abcdef0123456789abcdef01234",
        )
        data = WeeklyGameDataResponse(
            week_start=datetime(2026, 2, 23, tzinfo=timezone.utc),
            week_end=datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc),
            best_difficulty=5_000_000_000,
            best_difficulty_time=datetime.now(timezone.utc),
            best_hash="0000000abc",
            network_difficulty=100_000_000_000_000,
            progress_ratio=5e-5,
            daily_best_diffs={"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0},
            total_shares=100,
            weekly_rank=1,
            percentile=100.0,
            block_found=True,
            block_data=block_data,
            user_name="LuckyMiner",
        )
        assert data.block_found is True
        assert data.block_data is not None
        assert data.block_data.height == 879_412
        assert data.block_data.reward == 3.125

    def test_no_block_data_when_not_found(self):
        data = WeeklyGameDataResponse(
            week_start=datetime(2026, 2, 23, tzinfo=timezone.utc),
            week_end=datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc),
            best_difficulty=1_000,
            best_difficulty_time=None,
            best_hash="",
            network_difficulty=1e14,
            progress_ratio=0.0,
            daily_best_diffs={"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0},
            total_shares=5,
            weekly_rank=99,
            percentile=1.0,
            block_found=False,
            user_name="test",
        )
        assert data.block_found is False
        assert data.block_data is None

    def test_all_fields_present(self):
        """Verify all fields expected by the frontend are present."""
        data = WeeklyGameDataResponse(
            week_start=datetime(2026, 2, 23, tzinfo=timezone.utc),
            week_end=datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc),
            best_difficulty=0,
            best_difficulty_time=None,
            best_hash="",
            network_difficulty=1e14,
            progress_ratio=0,
            daily_best_diffs={"mon": 0, "tue": 0, "wed": 0, "thu": 0, "fri": 0, "sat": 0, "sun": 0},
            total_shares=0,
            weekly_rank=0,
            percentile=0,
            block_found=False,
            user_name="test",
        )
        # Check every field from the frontend WeeklyGameData interface
        assert hasattr(data, "week_start")
        assert hasattr(data, "week_end")
        assert hasattr(data, "best_difficulty")
        assert hasattr(data, "best_difficulty_time")
        assert hasattr(data, "best_hash")
        assert hasattr(data, "network_difficulty")
        assert hasattr(data, "progress_ratio")
        assert hasattr(data, "daily_best_diffs")
        assert hasattr(data, "total_shares")
        assert hasattr(data, "weekly_rank")
        assert hasattr(data, "percentile")
        assert hasattr(data, "block_found")
        assert hasattr(data, "block_data")
        assert hasattr(data, "user_name")

    def test_json_serialization(self):
        """Response should serialize to JSON matching frontend expectations."""
        data = WeeklyGameDataResponse(
            week_start=datetime(2026, 2, 23, tzinfo=timezone.utc),
            week_end=datetime(2026, 3, 1, 23, 59, 59, tzinfo=timezone.utc),
            best_difficulty=4_231_847_293,
            best_difficulty_time=datetime(2026, 2, 25, 10, 0, 0, tzinfo=timezone.utc),
            best_hash="0000000000000a3f",
            network_difficulty=100_847_293_444_000,
            progress_ratio=4_231_847_293 / 100_847_293_444_000,
            daily_best_diffs={"mon": 2e9, "tue": 1e9, "wed": 4e9, "thu": 3e9, "fri": 1e9, "sat": 2e9, "sun": 3e9},
            total_shares=47_832,
            weekly_rank=12,
            percentile=94.0,
            block_found=False,
            user_name="SatoshiHunter",
        )
        json_str = data.model_dump_json()
        assert "best_difficulty" in json_str
        assert "daily_best_diffs" in json_str
        assert "mon" in json_str
        assert "sun" in json_str
