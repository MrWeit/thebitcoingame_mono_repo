"""Unit tests for notification preference filtering."""

import pytest

from tbg.social.notification_service import (
    DEFAULT_PREFERENCES,
    should_deliver,
)


class TestNotificationPreferences:
    """Test notification delivery respects preferences."""

    def test_personal_best_default_on(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "mining", "personal_best") is True

    def test_badge_earned_default_on(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "gamification", "badge_earned") is True

    def test_world_cup_match_default_on(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "competition", "match_starting") is True

    def test_lottery_results_default_on(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "competition", "lottery_results") is True

    def test_block_found_default_off(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "social", "block_found") is False

    def test_leaderboard_change_default_off(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "competition", "leaderboard_change") is False

    def test_coop_activity_default_off(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "social", "coop_activity") is False

    def test_education_default_off(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "gamification", "education_recommendation") is False

    def test_in_app_disabled_blocks_all(self):
        prefs = dict(DEFAULT_PREFERENCES)
        prefs["inApp"] = False
        assert should_deliver(prefs, "mining", "personal_best") is False
        assert should_deliver(prefs, "gamification", "badge_earned") is False
        assert should_deliver(prefs, "competition", "match_starting") is False
        assert should_deliver(prefs, "system", "welcome") is False

    def test_unknown_subtype_defaults_true(self):
        prefs = dict(DEFAULT_PREFERENCES)
        assert should_deliver(prefs, "system", "maintenance") is True
        assert should_deliver(prefs, "system", "welcome") is True

    def test_custom_preference_override(self):
        prefs = dict(DEFAULT_PREFERENCES)
        prefs["blockFoundAny"] = True
        assert should_deliver(prefs, "social", "block_found") is True

    def test_disable_badge_earned(self):
        prefs = dict(DEFAULT_PREFERENCES)
        prefs["badgeEarned"] = False
        assert should_deliver(prefs, "gamification", "badge_earned") is False

    def test_coop_member_joined_matches_coop_activity(self):
        prefs = dict(DEFAULT_PREFERENCES)
        prefs["coopActivity"] = True
        assert should_deliver(prefs, "social", "coop_member_joined") is True

    def test_empty_preferences_use_defaults(self):
        prefs = {}
        # With empty prefs, inApp defaults to True and unknown subtypes default True
        assert should_deliver(prefs, "system", "welcome") is True
