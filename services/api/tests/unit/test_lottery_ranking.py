"""Unit tests for the deterministic lottery ranking algorithm."""

from datetime import datetime

from tbg.games.ranking import determine_xp_tier, rank_participants
from tbg.games.week_utils import calculate_percentile


class TestLotteryRanking:
    """Test the deterministic ranking algorithm."""

    def test_higher_diff_ranks_first(self):
        participants = [
            {"user_id": 1, "best_difficulty": 5_000_000},
            {"user_id": 2, "best_difficulty": 10_000_000},
            {"user_id": 3, "best_difficulty": 1_000_000},
        ]
        ranked = rank_participants(participants)
        assert ranked[0]["user_id"] == 2  # 10M — highest
        assert ranked[1]["user_id"] == 1  # 5M
        assert ranked[2]["user_id"] == 3  # 1M — lowest

    def test_tie_broken_by_earlier_timestamp(self):
        participants = [
            {"user_id": 1, "best_difficulty": 5_000_000, "best_diff_time": datetime(2026, 2, 23, 12, 0)},
            {"user_id": 2, "best_difficulty": 5_000_000, "best_diff_time": datetime(2026, 2, 23, 10, 0)},
        ]
        ranked = rank_participants(participants)
        assert ranked[0]["user_id"] == 2  # Earlier time wins the tie

    def test_tie_broken_by_total_shares(self):
        """Same diff, same time → higher total_shares wins."""
        participants = [
            {"user_id": 1, "best_difficulty": 5_000_000, "best_diff_time": datetime(2026, 2, 23, 12, 0), "total_shares": 100},
            {"user_id": 2, "best_difficulty": 5_000_000, "best_diff_time": datetime(2026, 2, 23, 12, 0), "total_shares": 500},
        ]
        ranked = rank_participants(participants)
        assert ranked[0]["user_id"] == 2  # More shares wins

    def test_single_participant(self):
        participants = [{"user_id": 1, "best_difficulty": 100}]
        ranked = rank_participants(participants)
        assert len(ranked) == 1
        assert ranked[0]["rank"] == 1
        # Single participant is at the top → percentile = 0.0 (100 - 100/100*100 = 0)
        # Actually: 100 - (1/1 * 100) = 0.0
        assert ranked[0]["percentile"] == 0.0

    def test_zero_participants(self):
        ranked = rank_participants([])
        assert len(ranked) == 0

    def test_ranks_are_contiguous(self):
        participants = [
            {"user_id": i, "best_difficulty": 1000 - i}
            for i in range(1, 11)
        ]
        ranked = rank_participants(participants)
        for i, entry in enumerate(ranked):
            assert entry["rank"] == i + 1

    def test_all_same_difficulty_no_time(self):
        """All same diff, no timestamps — should still produce valid ranking."""
        participants = [
            {"user_id": 1, "best_difficulty": 5_000_000},
            {"user_id": 2, "best_difficulty": 5_000_000},
            {"user_id": 3, "best_difficulty": 5_000_000},
        ]
        ranked = rank_participants(participants)
        assert len(ranked) == 3
        ranks = {r["rank"] for r in ranked}
        assert ranks == {1, 2, 3}

    def test_large_participant_list(self):
        """200 participants should rank correctly."""
        participants = [
            {"user_id": i, "best_difficulty": i * 1000}
            for i in range(1, 201)
        ]
        ranked = rank_participants(participants)
        assert len(ranked) == 200
        # Highest diff (user_id=200) should be rank 1
        assert ranked[0]["user_id"] == 200
        assert ranked[0]["rank"] == 1
        # Lowest diff (user_id=1) should be rank 200
        assert ranked[-1]["user_id"] == 1
        assert ranked[-1]["rank"] == 200


class TestXPTiers:
    """Test XP award determination by rank."""

    def test_xp_tier_top_10(self):
        assert determine_xp_tier(1) == 100
        assert determine_xp_tier(5) == 100
        assert determine_xp_tier(10) == 100

    def test_xp_tier_top_50(self):
        assert determine_xp_tier(11) == 50
        assert determine_xp_tier(25) == 50
        assert determine_xp_tier(50) == 50

    def test_xp_tier_top_100(self):
        assert determine_xp_tier(51) == 25
        assert determine_xp_tier(75) == 25
        assert determine_xp_tier(100) == 25

    def test_xp_tier_participated(self):
        assert determine_xp_tier(101) == 10
        assert determine_xp_tier(500) == 10
        assert determine_xp_tier(1000) == 10

    def test_xp_tier_boundary_values(self):
        """Exact boundary ranks should get the higher tier."""
        assert determine_xp_tier(10) == 100  # Still top 10
        assert determine_xp_tier(11) == 50   # Now top 50
        assert determine_xp_tier(50) == 50   # Still top 50
        assert determine_xp_tier(51) == 25   # Now top 100
        assert determine_xp_tier(100) == 25  # Still top 100
        assert determine_xp_tier(101) == 10  # Now participation

    def test_rank_participants_includes_xp(self):
        """rank_participants should annotate entries with xp_awarded."""
        participants = [
            {"user_id": 1, "best_difficulty": 10_000},
            {"user_id": 2, "best_difficulty": 5_000},
        ]
        ranked = rank_participants(participants)
        assert ranked[0]["xp_awarded"] == 100  # Rank 1 → top 10
        assert ranked[1]["xp_awarded"] == 100  # Rank 2 → top 10


class TestPercentileCalculation:
    """Test percentile computation."""

    def test_rank_1_of_100(self):
        assert calculate_percentile(1, 100) == 99.0

    def test_rank_50_of_100(self):
        assert calculate_percentile(50, 100) == 50.0

    def test_rank_100_of_100(self):
        assert calculate_percentile(100, 100) == 0.0

    def test_rank_1_of_1(self):
        assert calculate_percentile(1, 1) == 0.0

    def test_zero_total(self):
        assert calculate_percentile(1, 0) == 0.0

    def test_zero_rank(self):
        assert calculate_percentile(0, 100) == 0.0

    def test_rank_1_of_1000(self):
        assert calculate_percentile(1, 1000) == 99.9

    def test_rank_10_of_100(self):
        assert calculate_percentile(10, 100) == 90.0
