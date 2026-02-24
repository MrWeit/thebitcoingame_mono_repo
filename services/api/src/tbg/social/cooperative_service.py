"""Cooperative business logic.

Rules:
- Max 20 members per cooperative (hard limit)
- One cooperative per user
- Invite codes are server-generated, 8-char A-Z0-9
- Admin transfer on admin leave (to longest-serving member)
- Last member leaving dissolves the cooperative
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from tbg.db.models import Cooperative, CooperativeMember, User
from tbg.social.invite_codes import generate_unique_invite_code, normalize_invite_code

logger = logging.getLogger(__name__)

MAX_MEMBERS = 20


async def get_cooperative(db: AsyncSession, coop_id: int) -> Cooperative | None:
    """Get a cooperative by ID."""
    result = await db.execute(select(Cooperative).where(Cooperative.id == coop_id))
    return result.scalar_one_or_none()


async def get_user_membership(db: AsyncSession, user_id: int) -> CooperativeMember | None:
    """Get a user's cooperative membership (if any)."""
    result = await db.execute(
        select(CooperativeMember).where(CooperativeMember.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def create_cooperative(
    db: AsyncSession,
    owner_id: int,
    name: str,
    motto: str | None = None,
) -> Cooperative:
    """Create a new cooperative. The creator becomes the admin."""
    # Check user is not already in a cooperative
    existing_membership = await get_user_membership(db, owner_id)
    if existing_membership:
        raise ValueError("You are already a member of a cooperative. Leave it first.")

    # Check name uniqueness (case-insensitive)
    existing_name = await db.execute(
        select(Cooperative).where(func.lower(Cooperative.name) == name.lower())
    )
    if existing_name.scalar_one_or_none():
        raise ValueError("A cooperative with this name already exists")

    invite_code = await generate_unique_invite_code(db)

    coop = Cooperative(
        name=name,
        motto=motto,
        invite_code=invite_code,
        owner_user_id=owner_id,
        member_count=1,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(coop)
    await db.flush()

    # Add owner as admin member
    member = CooperativeMember(
        cooperative_id=coop.id,
        user_id=owner_id,
        role="admin",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(member)
    await db.flush()

    logger.info("Cooperative created: %s (id=%d, owner=%d)", name, coop.id, owner_id)
    return coop


async def join_cooperative(
    db: AsyncSession,
    user_id: int,
    invite_code: str,
) -> CooperativeMember:
    """Join a cooperative using an invite code."""
    code = normalize_invite_code(invite_code)

    result = await db.execute(
        select(Cooperative).where(Cooperative.invite_code == code)
    )
    coop = result.scalar_one_or_none()
    if not coop:
        raise ValueError("Invalid invite code")

    if not coop.is_active:
        raise ValueError("This cooperative is no longer active")

    if coop.member_count >= MAX_MEMBERS:
        raise ValueError(f"This cooperative is full ({MAX_MEMBERS} members maximum)")

    # Check user is not already in a cooperative
    existing = await get_user_membership(db, user_id)
    if existing:
        raise ValueError("You are already a member of a cooperative. Leave it first.")

    member = CooperativeMember(
        cooperative_id=coop.id,
        user_id=user_id,
        role="member",
        joined_at=datetime.now(timezone.utc),
    )
    db.add(member)

    coop.member_count += 1
    coop.updated_at = datetime.now(timezone.utc)

    await db.flush()
    logger.info("User %d joined cooperative %d via invite code", user_id, coop.id)
    return member


async def leave_cooperative(db: AsyncSession, user_id: int) -> None:
    """Leave the user's current cooperative."""
    membership = await get_user_membership(db, user_id)
    if not membership:
        raise ValueError("You are not in a cooperative")

    coop = await get_cooperative(db, membership.cooperative_id)
    if not coop:
        raise ValueError("Cooperative not found")

    if membership.role == "admin" and coop.member_count == 1:
        # Last member (admin), dissolve the cooperative
        coop.is_active = False
        coop.member_count = 0
        await db.delete(membership)
    elif membership.role == "admin":
        # Transfer ownership to the longest-serving member
        next_admin_result = await db.execute(
            select(CooperativeMember)
            .where(
                CooperativeMember.cooperative_id == coop.id,
                CooperativeMember.user_id != user_id,
            )
            .order_by(CooperativeMember.joined_at.asc())
            .limit(1)
        )
        new_admin = next_admin_result.scalar_one()
        new_admin.role = "admin"
        coop.owner_user_id = new_admin.user_id
        coop.member_count -= 1
        await db.delete(membership)
    else:
        coop.member_count -= 1
        await db.delete(membership)

    coop.updated_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("User %d left cooperative %d", user_id, coop.id)


async def remove_member(
    db: AsyncSession,
    admin_user_id: int,
    target_user_id: int,
) -> None:
    """Admin removes a member from the cooperative."""
    admin_membership = await get_user_membership(db, admin_user_id)
    if not admin_membership or admin_membership.role != "admin":
        raise ValueError("Only cooperative admins can remove members")

    if admin_user_id == target_user_id:
        raise ValueError("Use the leave endpoint to leave the cooperative")

    target_result = await db.execute(
        select(CooperativeMember).where(
            CooperativeMember.user_id == target_user_id,
            CooperativeMember.cooperative_id == admin_membership.cooperative_id,
        )
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise ValueError("User is not a member of your cooperative")

    coop = await get_cooperative(db, admin_membership.cooperative_id)
    if not coop:
        raise ValueError("Cooperative not found")

    await db.delete(target)
    coop.member_count -= 1
    coop.updated_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("Admin %d removed user %d from cooperative %d", admin_user_id, target_user_id, coop.id)


async def regenerate_invite_code(db: AsyncSession, admin_user_id: int) -> str:
    """Admin regenerates the cooperative's invite code."""
    membership = await get_user_membership(db, admin_user_id)
    if not membership or membership.role != "admin":
        raise ValueError("Only cooperative admins can regenerate invite codes")

    coop = await get_cooperative(db, membership.cooperative_id)
    if not coop:
        raise ValueError("Cooperative not found")

    coop.invite_code = await generate_unique_invite_code(db)
    coop.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return coop.invite_code


async def update_cooperative(
    db: AsyncSession,
    coop_id: int,
    admin_user_id: int,
    name: str | None = None,
    motto: str | None = None,
) -> Cooperative:
    """Update cooperative name/motto (admin only)."""
    membership = await get_user_membership(db, admin_user_id)
    if not membership or membership.role != "admin" or membership.cooperative_id != coop_id:
        raise ValueError("Only the cooperative admin can update it")

    coop = await get_cooperative(db, coop_id)
    if not coop:
        raise ValueError("Cooperative not found")

    if name is not None:
        # Check name uniqueness
        existing = await db.execute(
            select(Cooperative).where(
                func.lower(Cooperative.name) == name.lower(),
                Cooperative.id != coop_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("A cooperative with this name already exists")
        coop.name = name

    if motto is not None:
        coop.motto = motto

    coop.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return coop


async def dissolve_cooperative(db: AsyncSession, coop_id: int, admin_user_id: int) -> None:
    """Dissolve a cooperative (admin only, must have no other members)."""
    membership = await get_user_membership(db, admin_user_id)
    if not membership or membership.role != "admin" or membership.cooperative_id != coop_id:
        raise ValueError("Only the cooperative admin can dissolve it")

    coop = await get_cooperative(db, coop_id)
    if not coop:
        raise ValueError("Cooperative not found")

    if coop.member_count > 1:
        raise ValueError("Cannot dissolve a cooperative with other members. Remove them first.")

    coop.is_active = False
    coop.member_count = 0
    await db.delete(membership)
    coop.updated_at = datetime.now(timezone.utc)
    await db.flush()
    logger.info("Cooperative %d dissolved by admin %d", coop_id, admin_user_id)


async def list_cooperatives(
    db: AsyncSession,
    page: int = 1,
    per_page: int = 20,
) -> tuple[list[Cooperative], int]:
    """List all active cooperatives (paginated)."""
    offset = (page - 1) * per_page

    total_result = await db.execute(
        select(func.count()).select_from(Cooperative).where(Cooperative.is_active.is_(True))
    )
    total = total_result.scalar_one()

    result = await db.execute(
        select(Cooperative)
        .where(Cooperative.is_active.is_(True))
        .order_by(Cooperative.weekly_rank.asc(), Cooperative.combined_hashrate.desc())
        .offset(offset)
        .limit(per_page)
    )
    coops = list(result.scalars().all())
    return coops, total


async def get_cooperative_members(
    db: AsyncSession, coop_id: int
) -> list[tuple[CooperativeMember, User]]:
    """Get all members of a cooperative with user info."""
    result = await db.execute(
        select(CooperativeMember, User)
        .join(User, CooperativeMember.user_id == User.id)
        .where(CooperativeMember.cooperative_id == coop_id)
        .order_by(CooperativeMember.joined_at.asc())
    )
    return [(row.CooperativeMember, row.User) for row in result]
