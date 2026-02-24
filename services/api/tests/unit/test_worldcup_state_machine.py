"""Unit tests for World Cup state machine."""

from __future__ import annotations

import pytest

from tbg.competition.worldcup_engine import VALID_TRANSITIONS, validate_transition


pytestmark = pytest.mark.asyncio


class TestWorldCupStateMachine:
    """Test tournament state transitions."""

    def test_valid_transitions_structure(self):
        """All states have defined transitions."""
        assert set(VALID_TRANSITIONS.keys()) == {
            "upcoming", "registration", "group_stage", "knockout", "completed",
        }

    def test_upcoming_to_registration(self):
        """upcoming -> registration is valid."""
        assert "registration" in VALID_TRANSITIONS["upcoming"]
        validate_transition("upcoming", "registration")  # Should not raise

    def test_registration_to_group_stage(self):
        """registration -> group_stage is valid."""
        assert "group_stage" in VALID_TRANSITIONS["registration"]
        validate_transition("registration", "group_stage")

    def test_group_stage_to_knockout(self):
        """group_stage -> knockout is valid."""
        assert "knockout" in VALID_TRANSITIONS["group_stage"]
        validate_transition("group_stage", "knockout")

    def test_knockout_to_completed(self):
        """knockout -> completed is valid."""
        assert "completed" in VALID_TRANSITIONS["knockout"]
        validate_transition("knockout", "completed")

    def test_completed_is_terminal(self):
        """completed has no valid transitions."""
        assert VALID_TRANSITIONS["completed"] == []

    def test_invalid_transition_rejected(self):
        """Skipping states raises ValueError."""
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("upcoming", "knockout")

    def test_cannot_go_backwards(self):
        """Going backwards raises ValueError."""
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("knockout", "group_stage")

    def test_cannot_skip_registration(self):
        """upcoming -> group_stage raises ValueError."""
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("upcoming", "group_stage")

    def test_cannot_skip_to_completed(self):
        """group_stage -> completed raises ValueError."""
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("group_stage", "completed")

    def test_completed_cannot_transition(self):
        """completed -> anything raises ValueError."""
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("completed", "upcoming")
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("completed", "registration")

    def test_self_transition_rejected(self):
        """A state cannot transition to itself."""
        with pytest.raises(ValueError, match="Invalid transition"):
            validate_transition("registration", "registration")

    def test_full_forward_path(self):
        """Full valid progression path works."""
        states = ["upcoming", "registration", "group_stage", "knockout", "completed"]
        for i in range(len(states) - 1):
            validate_transition(states[i], states[i + 1])
