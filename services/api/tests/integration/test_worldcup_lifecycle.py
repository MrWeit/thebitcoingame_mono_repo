"""Integration test: full World Cup lifecycle."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import (
    Competition,
    CompetitionRegistration,
    CompetitionTeam,
    Match,
    User,
)

pytestmark = pytest.mark.asyncio


async def _create_test_user(
    db: AsyncSession, country_code: str, index: int,
) -> User:
    """Create a test user with a unique btc_address."""
    addr = f"bc1q{country_code.lower()}{index:06d}testaddr00000000000000000"[:42]
    user = User(
        btc_address=addr,
        display_name=f"Miner-{country_code}-{index}",
        country_code=country_code,
        is_verified=True,
        auth_method="wallet",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


class TestWorldCupLifecycle:
    """Test full World Cup from creation to completion."""

    async def test_full_worldcup_cycle(self, db_session):
        """Create -> Register -> Groups -> Knockout -> Winner.

        Uses 8 countries (2 groups of 4) for a full bracket:
        QF (4 matches) -> SF (2 matches) -> Final (1 match).
        """
        db = db_session

        # Clean up all competition and user tables
        for t in ["matches", "competition_registrations", "competition_teams", "competitions", "users"]:
            await db.execute(text(f"TRUNCATE TABLE {t} CASCADE"))
        await db.commit()

        from tbg.competition.worldcup_engine import (
            create_competition,
            get_competition,
            register_for_worldcup,
            transition_state,
        )
        from tbg.competition.match_service import complete_match, get_matches

        # 1. Create competition
        comp = await create_competition(
            db, "Test World Cup", "world_cup",
            config={"min_miners_per_country": 2, "baseline_hashrate": 1e15},
        )
        assert comp.status == "upcoming"

        # 2. Open registration
        comp = await transition_state(db, comp.id, "registration")
        assert comp.status == "registration"

        # 3. Register users (8 countries, 3 miners each = 24 miners)
        countries = ["US", "JP", "DE", "BR", "GB", "FR", "AU", "CA"]
        for country in countries:
            for i in range(3):
                user = await _create_test_user(db, country, i)
                await register_for_worldcup(db, comp.id, user.id, country)

        # Verify registrations
        reg_result = await db.execute(
            select(CompetitionRegistration).where(
                CompetitionRegistration.competition_id == comp.id,
            )
        )
        registrations = reg_result.scalars().all()
        assert len(registrations) == 24  # 8 countries * 3 miners

        # 4. Start group stage
        comp = await transition_state(db, comp.id, "group_stage")
        assert comp.status == "group_stage"

        # Verify group matches were generated
        # 2 groups of 4 teams -> C(4,2)*2 = 12 matches
        group_matches = await get_matches(db, comp.id, round_name="group")
        assert len(group_matches) == 12

        # 5. Complete all group matches with varied scores
        for i, match in enumerate(group_matches):
            sa = (i % 3) + 1
            sb = (i % 2)
            await complete_match(db, match.id, score_a=sa, score_b=sb)

        # Verify all group matches completed
        completed = await get_matches(db, comp.id, round_name="group", status="completed")
        assert len(completed) == 12

        # 6. Start knockout
        comp = await transition_state(db, comp.id, "knockout")
        assert comp.status == "knockout"

        # With 2 groups of 4, top 2 each = 4 qualifiers -> semi-finals directly
        sf_matches = await get_matches(db, comp.id, round_name="semi")
        assert len(sf_matches) == 2

        # Complete semi-finals
        for match in sf_matches:
            await complete_match(db, match.id, score_a=2, score_b=1)

        # Generate final from SF results
        from tbg.competition.worldcup_engine import advance_knockout
        final_matches = await advance_knockout(db, comp.id, "semi")
        assert len(final_matches) == 1
        assert final_matches[0].round == "final"

        # Complete the final
        await complete_match(db, final_matches[0].id, score_a=3, score_b=2)

        # 8. Complete competition
        comp = await transition_state(db, comp.id, "completed")
        assert comp.status == "completed"

    async def test_invalid_transitions_blocked(self, db_session):
        """Cannot skip states."""
        db = db_session
        await db.execute(text("TRUNCATE TABLE users CASCADE"))
        await db.commit()

        from tbg.competition.worldcup_engine import create_competition, transition_state

        comp = await create_competition(db, "Test", "world_cup")
        assert comp.status == "upcoming"

        with pytest.raises(ValueError, match="Invalid transition"):
            await transition_state(db, comp.id, "knockout")

        with pytest.raises(ValueError, match="Invalid transition"):
            await transition_state(db, comp.id, "completed")

    async def test_duplicate_registration_rejected(self, db_session):
        """Same user cannot register twice."""
        db = db_session
        await db.execute(text("TRUNCATE TABLE users CASCADE"))
        await db.commit()

        from tbg.competition.worldcup_engine import (
            create_competition,
            register_for_worldcup,
            transition_state,
        )

        comp = await create_competition(db, "Test", "world_cup")
        comp = await transition_state(db, comp.id, "registration")

        user = await _create_test_user(db, "US", 0)
        await register_for_worldcup(db, comp.id, user.id, "US")

        with pytest.raises(ValueError, match="Already registered"):
            await register_for_worldcup(db, comp.id, user.id, "US")

    async def test_registration_only_when_open(self, db_session):
        """Cannot register when not in registration state."""
        db = db_session
        await db.execute(text("TRUNCATE TABLE users CASCADE"))
        await db.commit()

        from tbg.competition.worldcup_engine import create_competition, register_for_worldcup

        comp = await create_competition(db, "Test", "world_cup")
        user = await _create_test_user(db, "US", 0)

        # Competition is in 'upcoming' state
        with pytest.raises(ValueError, match="Registration is not open"):
            await register_for_worldcup(db, comp.id, user.id, "US")

    async def test_group_stage_needs_enough_teams(self, db_session):
        """Cannot start group stage without enough teams."""
        db = db_session
        await db.execute(text("TRUNCATE TABLE users CASCADE"))
        await db.commit()

        from tbg.competition.worldcup_engine import (
            create_competition,
            register_for_worldcup,
            transition_state,
        )

        comp = await create_competition(
            db, "Test", "world_cup",
            config={"min_miners_per_country": 2},
        )
        comp = await transition_state(db, comp.id, "registration")

        # Only register 2 countries (need 4)
        for country in ["US", "JP"]:
            for i in range(3):
                user = await _create_test_user(db, country, i)
                await register_for_worldcup(db, comp.id, user.id, country)

        with pytest.raises(ValueError, match="Need at least 4 countries"):
            await transition_state(db, comp.id, "group_stage")
