"""Unit tests for cooperative business rules."""

from __future__ import annotations

import pytest
import pytest_asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Cooperative, CooperativeMember, User
from tbg.social.cooperative_service import (
    MAX_MEMBERS,
    create_cooperative,
    get_cooperative,
    get_user_membership,
    join_cooperative,
    leave_cooperative,
    remove_member,
)


async def _create_user(db: AsyncSession, btc_address: str, display_name: str | None = None) -> User:
    """Create a test user."""
    user = User(
        btc_address=btc_address,
        display_name=display_name,
        auth_method="wallet",
    )
    db.add(user)
    await db.flush()
    return user


async def _create_coop_with_members(db: AsyncSession, count: int) -> tuple[Cooperative, list[User]]:
    """Create a cooperative with `count` members (including the owner)."""
    owner = await _create_user(db, f"bc1qowner{count:04d}xxx")
    coop = await create_cooperative(db, owner.id, f"TestCoop{count}")
    await db.flush()

    members = [owner]
    for i in range(count - 1):
        user = await _create_user(db, f"bc1qmember{i:04d}xxx")
        await join_cooperative(db, user.id, coop.invite_code)
        members.append(user)
        await db.flush()

    return coop, members


@pytest_asyncio.fixture
async def db(db_session: AsyncSession) -> AsyncSession:
    """Clean database for each test."""
    # Clean up social tables
    for table in ["cooperative_members", "cooperatives"]:
        try:
            await db_session.execute(text(f"DELETE FROM {table}"))
        except Exception:
            pass
    await db_session.flush()
    yield db_session


class TestCooperativeRules:
    """Test cooperative business rules."""

    @pytest.mark.asyncio
    async def test_create_cooperative(self, db: AsyncSession):
        """Creating a cooperative sets up admin membership."""
        user = await _create_user(db, "bc1qcreatetest1xxx")
        coop = await create_cooperative(db, user.id, "Test Coop")

        assert coop.name == "Test Coop"
        assert coop.member_count == 1
        assert coop.owner_user_id == user.id
        assert len(coop.invite_code) == 8

        membership = await get_user_membership(db, user.id)
        assert membership is not None
        assert membership.role == "admin"

    @pytest.mark.asyncio
    async def test_max_20_members(self, db: AsyncSession):
        """Cannot join a cooperative with 20 members."""
        coop, _members = await _create_coop_with_members(db, MAX_MEMBERS)

        extra_user = await _create_user(db, "bc1qextra0000xxx")
        with pytest.raises(ValueError, match="full"):
            await join_cooperative(db, extra_user.id, coop.invite_code)

    @pytest.mark.asyncio
    async def test_user_in_one_coop_only(self, db: AsyncSession):
        """A user cannot be in two cooperatives."""
        user1 = await _create_user(db, "bc1qowner0001xxx")
        user2 = await _create_user(db, "bc1qowner0002xxx")
        joiner = await _create_user(db, "bc1qjoiner001xxx")

        coop1 = await create_cooperative(db, user1.id, "Coop One")
        coop2 = await create_cooperative(db, user2.id, "Coop Two")
        await db.flush()

        await join_cooperative(db, joiner.id, coop1.invite_code)
        with pytest.raises(ValueError, match="already a member"):
            await join_cooperative(db, joiner.id, coop2.invite_code)

    @pytest.mark.asyncio
    async def test_admin_transfer_on_leave(self, db: AsyncSession):
        """When admin leaves, ownership transfers to oldest member."""
        coop, members = await _create_coop_with_members(db, 3)
        admin = members[0]
        oldest_member = members[1]

        await leave_cooperative(db, admin.id)
        await db.flush()

        refreshed_member = await get_user_membership(db, oldest_member.id)
        assert refreshed_member is not None
        assert refreshed_member.role == "admin"

        refreshed_coop = await get_cooperative(db, coop.id)
        assert refreshed_coop.owner_user_id == oldest_member.id
        assert refreshed_coop.member_count == 2

    @pytest.mark.asyncio
    async def test_last_member_dissolves_coop(self, db: AsyncSession):
        """When last member leaves, cooperative is dissolved."""
        user = await _create_user(db, "bc1qlastleave01xxx")
        coop = await create_cooperative(db, user.id, "Dissolve Me")

        await leave_cooperative(db, user.id)
        await db.flush()

        refreshed = await get_cooperative(db, coop.id)
        assert refreshed.is_active is False
        assert refreshed.member_count == 0

    @pytest.mark.asyncio
    async def test_non_admin_cannot_remove_members(self, db: AsyncSession):
        """Only admins can remove members."""
        coop, members = await _create_coop_with_members(db, 3)
        regular = members[2]
        target = members[1]

        with pytest.raises(ValueError, match="Only cooperative admins"):
            await remove_member(db, regular.id, target.id)

    @pytest.mark.asyncio
    async def test_admin_can_remove_member(self, db: AsyncSession):
        """Admins can remove other members."""
        coop, members = await _create_coop_with_members(db, 3)
        admin = members[0]
        target = members[2]

        await remove_member(db, admin.id, target.id)
        await db.flush()

        refreshed = await get_cooperative(db, coop.id)
        assert refreshed.member_count == 2

        removed = await get_user_membership(db, target.id)
        assert removed is None

    @pytest.mark.asyncio
    async def test_cannot_remove_self(self, db: AsyncSession):
        """Admins cannot remove themselves (must use leave)."""
        coop, members = await _create_coop_with_members(db, 2)
        admin = members[0]

        with pytest.raises(ValueError, match="leave endpoint"):
            await remove_member(db, admin.id, admin.id)

    @pytest.mark.asyncio
    async def test_invalid_invite_code(self, db: AsyncSession):
        """Invalid invite code raises error."""
        user = await _create_user(db, "bc1qinvalidcode1xxx")
        with pytest.raises(ValueError, match="Invalid invite code"):
            await join_cooperative(db, user.id, "XXXXXXXX")

    @pytest.mark.asyncio
    async def test_case_insensitive_name(self, db: AsyncSession):
        """Cooperative names are case-insensitive unique."""
        user1 = await _create_user(db, "bc1qname0001xxx")
        user2 = await _create_user(db, "bc1qname0002xxx")

        await create_cooperative(db, user1.id, "My Coop")
        with pytest.raises(ValueError, match="name already exists"):
            await create_cooperative(db, user2.id, "my coop")

    @pytest.mark.asyncio
    async def test_owner_already_in_coop_cannot_create(self, db: AsyncSession):
        """User already in a coop cannot create another."""
        user = await _create_user(db, "bc1qdoublecreate1xxx")
        await create_cooperative(db, user.id, "First Coop")

        with pytest.raises(ValueError, match="already a member"):
            await create_cooperative(db, user.id, "Second Coop")

    @pytest.mark.asyncio
    async def test_join_inactive_coop_fails(self, db: AsyncSession):
        """Cannot join a dissolved cooperative."""
        user1 = await _create_user(db, "bc1qinactive01xxx")
        user2 = await _create_user(db, "bc1qinactive02xxx")

        coop = await create_cooperative(db, user1.id, "Dead Coop")
        invite_code = coop.invite_code
        await leave_cooperative(db, user1.id)
        await db.flush()

        with pytest.raises(ValueError, match="no longer active"):
            await join_cooperative(db, user2.id, invite_code)
