# Prompt: Backend Service — Phase 7 (Social & Cooperatives)

You are building the social and cooperative system for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite). The backend API (FastAPI + PostgreSQL + Redis) was built in Phases 0-6: authentication, mining data API, WebSocket events, gamification engine, games/lottery, and the competition system (leaderboards, World Cup, leagues) are all operational. Phase 7 builds the social layer: cooperatives, notifications, activity feeds, and public profiles.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/` (do not touch). The backend API lives in `backend/`. The mining engine lives in `services/ckpool/` and the event collector in `services/event-collector/`.

---

## IMPORTANT CONSTRAINTS

1. **Do not touch `dashboard/`** — The frontend is complete and working. Do not modify anything in the dashboard directory.
2. **Do not touch `services/`** — The mining engine and event collector are complete from earlier phases.
3. **Invite codes are server-generated.** 8-character alphanumeric codes (A-Z, 0-9), generated server-side with a cryptographic random source. Users cannot choose their own invite codes. Codes must be unique.
4. **Maximum 20 members per cooperative.** This is a hard limit. No exceptions, no configuration override. The 20-member cap is by design to keep cooperatives small and meaningful.
5. **Privacy settings MUST be enforced.** The frontend has privacy toggles in `dashboard/src/stores/settingsStore.ts`: `publicProfile`, `showOnLeaderboard`, `showCountryFlag`, `showInCoopRankings`. When `publicProfile` is disabled, the public profile endpoint MUST return 404 — not an empty profile, not a restricted profile, a genuine 404 as if the user does not exist.
6. **WebSocket for real-time notifications.** Notifications are pushed to users via the existing WebSocket infrastructure from Phase 3. The notification payload must match the `NotificationItem` interface from `dashboard/src/mocks/notifications.ts`.
7. **Notification categories must match frontend.** The frontend has 5 notification types: `mining`, `gamification`, `competition`, `social`, `system`. Do not invent new categories.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Architecture overview, service boundaries, data flow diagrams.
2. `docs/backend-service/roadmap/phase-07-social.md` — Full Phase 7 specification with cooperative rules, notification system, activity feed, and public profile privacy.
3. `docs/backend-service/roadmap/phase-04-gamification.md` — Phase 4 gamification engine. Badges `coop_founder` and `coop_block` are triggered by cooperative events.
4. `dashboard/src/stores/settingsStore.ts` — The `PrivacySettings` and `NotificationPreferences` interfaces. Privacy settings control public profile visibility.
5. `dashboard/src/stores/notificationStore.ts` — The notification store with `addNotification` and `markAsRead`. Your API payloads must match.
6. `dashboard/src/mocks/notifications.ts` — The `NotificationItem` interface with `type` (mining/gamification/competition/social/system), `subtype`, `title`, `description`, `timestamp`, `read`, `actionUrl`, `actionLabel`.
7. `dashboard/src/mocks/competition.ts` — The `Cooperative`, `CoopMember` interfaces. Your cooperative API responses must match these shapes.
8. `dashboard/src/mocks/social.ts` — The `FeedItem` interface for the activity feed.

Read ALL of these before writing any code.

---

## What You Are Building

### Part 1: Database Schema

Create an Alembic migration for the social tables.

#### 1.1 Cooperatives Table

```sql
CREATE TABLE cooperatives (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(64) NOT NULL,
    motto           VARCHAR(256),
    invite_code     VARCHAR(8) UNIQUE NOT NULL,     -- Server-generated, A-Z0-9
    owner_user_id   INTEGER NOT NULL REFERENCES users(id),
    member_count    INTEGER NOT NULL DEFAULT 1,     -- Owner counts as member
    max_members     INTEGER NOT NULL DEFAULT 20,
    combined_hashrate DOUBLE PRECISION NOT NULL DEFAULT 0,
    weekly_streak   INTEGER NOT NULL DEFAULT 0,
    best_combined_diff DOUBLE PRECISION NOT NULL DEFAULT 0,
    blocks_found    INTEGER NOT NULL DEFAULT 0,
    total_shares_week BIGINT NOT NULL DEFAULT 0,
    weekly_rank     INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_cooperatives_name ON cooperatives(lower(name));
CREATE INDEX idx_cooperatives_invite ON cooperatives(invite_code);
```

#### 1.2 Cooperative Members Table

```sql
CREATE TABLE cooperative_members (
    id              SERIAL PRIMARY KEY,
    cooperative_id  INTEGER NOT NULL REFERENCES cooperatives(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(16) NOT NULL DEFAULT 'member', -- admin, member
    hashrate        DOUBLE PRECISION NOT NULL DEFAULT 0,
    shares_today    BIGINT NOT NULL DEFAULT 0,
    is_online       BOOLEAN NOT NULL DEFAULT false,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(cooperative_id, user_id),
    UNIQUE(user_id)                                    -- A user can only be in 1 cooperative
);

CREATE INDEX idx_coop_members_coop ON cooperative_members(cooperative_id);
CREATE INDEX idx_coop_members_user ON cooperative_members(user_id);
```

#### 1.3 Notifications Table

```sql
CREATE TABLE notifications (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(32) NOT NULL,               -- mining, gamification, competition, social, system
    subtype         VARCHAR(64) NOT NULL,               -- personal_best, badge_earned, match_starting, etc.
    title           VARCHAR(256) NOT NULL,
    description     TEXT,
    read            BOOLEAN NOT NULL DEFAULT false,
    action_url      VARCHAR(256),
    action_label    VARCHAR(64),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ                         -- optional expiry
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read) WHERE read = false;
CREATE INDEX idx_notifications_created ON notifications(created_at);
```

#### 1.4 User Activity Table

```sql
CREATE TABLE user_activity (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type   VARCHAR(64) NOT NULL,               -- share_submitted, badge_earned, game_played, etc.
    title           VARCHAR(256) NOT NULL,
    description     TEXT,
    metadata        JSONB DEFAULT '{}',                 -- context: badge_slug, game_type, match_id, etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_activity_user ON user_activity(user_id);
CREATE INDEX idx_user_activity_type ON user_activity(activity_type);
CREATE INDEX idx_user_activity_created ON user_activity(created_at);
```

### Part 2: Cooperative System

#### 2.1 Invite Code Generation

```python
# backend/app/social/invite_codes.py

import secrets
import string

INVITE_CHARSET = string.ascii_uppercase + string.digits  # A-Z, 0-9
INVITE_LENGTH = 8


def generate_invite_code() -> str:
    """Generate a cryptographically random 8-character invite code."""
    return ''.join(secrets.choice(INVITE_CHARSET) for _ in range(INVITE_LENGTH))


async def generate_unique_invite_code(db: AsyncSession) -> str:
    """Generate an invite code that doesn't already exist in the database."""
    for _ in range(10):  # Max 10 attempts
        code = generate_invite_code()
        existing = await db.execute(
            select(Cooperative).where(Cooperative.invite_code == code)
        )
        if not existing.scalar_one_or_none():
            return code
    raise RuntimeError("Failed to generate unique invite code after 10 attempts")
```

#### 2.2 Cooperative CRUD

```python
# backend/app/social/cooperative_service.py

async def create_cooperative(
    db: AsyncSession,
    owner_id: int,
    name: str,
    motto: str | None = None,
) -> Cooperative:
    """Create a new cooperative. The creator becomes the admin."""
    # Check user is not already in a cooperative
    existing_membership = await db.execute(
        select(CooperativeMember).where(CooperativeMember.user_id == owner_id)
    )
    if existing_membership.scalar_one_or_none():
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
    )
    db.add(coop)
    await db.flush()

    # Add owner as admin member
    member = CooperativeMember(
        cooperative_id=coop.id,
        user_id=owner_id,
        role="admin",
    )
    db.add(member)
    await db.commit()

    # Trigger coop_founder badge
    from app.gamification.trigger_engine import trigger_event_badge
    await trigger_event_badge(db, owner_id, "coop_created")

    return coop


async def join_cooperative(
    db: AsyncSession,
    user_id: int,
    invite_code: str,
) -> CooperativeMember:
    """Join a cooperative using an invite code."""
    # Find cooperative by invite code
    coop = await db.execute(
        select(Cooperative).where(Cooperative.invite_code == invite_code.upper())
    )
    coop = coop.scalar_one_or_none()
    if not coop:
        raise ValueError("Invalid invite code")

    if not coop.is_active:
        raise ValueError("This cooperative is no longer active")

    # Check member limit
    if coop.member_count >= coop.max_members:
        raise ValueError(f"This cooperative is full ({coop.max_members} members maximum)")

    # Check user is not already in a cooperative
    existing = await db.execute(
        select(CooperativeMember).where(CooperativeMember.user_id == user_id)
    )
    if existing.scalar_one_or_none():
        raise ValueError("You are already a member of a cooperative. Leave it first.")

    member = CooperativeMember(
        cooperative_id=coop.id,
        user_id=user_id,
        role="member",
    )
    db.add(member)

    coop.member_count += 1
    coop.updated_at = datetime.utcnow()

    await db.commit()

    # Notify cooperative members
    await notify_coop_members(
        db, coop.id,
        type="social",
        subtype="coop_member_joined",
        title="New Member Joined",
        description=f"A new miner joined {coop.name}",
        exclude_user_id=user_id,
    )

    return member


async def leave_cooperative(db: AsyncSession, user_id: int) -> None:
    """Leave the user's current cooperative."""
    membership = await db.execute(
        select(CooperativeMember).where(CooperativeMember.user_id == user_id)
    )
    member = membership.scalar_one_or_none()
    if not member:
        raise ValueError("You are not in a cooperative")

    coop = await get_cooperative(db, member.cooperative_id)

    # If the user is the owner and the only member, dissolve the coop
    if member.role == "admin" and coop.member_count == 1:
        coop.is_active = False
        await db.delete(member)
        coop.member_count = 0
    elif member.role == "admin":
        # Transfer ownership to the longest-serving member
        next_admin = await db.execute(
            select(CooperativeMember)
            .where(
                CooperativeMember.cooperative_id == coop.id,
                CooperativeMember.user_id != user_id,
            )
            .order_by(CooperativeMember.joined_at.asc())
            .limit(1)
        )
        new_admin = next_admin.scalar_one()
        new_admin.role = "admin"
        coop.owner_user_id = new_admin.user_id
        await db.delete(member)
        coop.member_count -= 1
    else:
        await db.delete(member)
        coop.member_count -= 1

    coop.updated_at = datetime.utcnow()
    await db.commit()


async def remove_member(
    db: AsyncSession,
    admin_user_id: int,
    target_user_id: int,
) -> None:
    """Admin removes a member from the cooperative."""
    # Verify the requester is an admin
    admin_membership = await db.execute(
        select(CooperativeMember).where(CooperativeMember.user_id == admin_user_id)
    )
    admin = admin_membership.scalar_one_or_none()
    if not admin or admin.role != "admin":
        raise ValueError("Only cooperative admins can remove members")

    # Cannot remove yourself
    if admin_user_id == target_user_id:
        raise ValueError("Use the leave endpoint to leave the cooperative")

    # Find the target member
    target_membership = await db.execute(
        select(CooperativeMember).where(
            CooperativeMember.user_id == target_user_id,
            CooperativeMember.cooperative_id == admin.cooperative_id,
        )
    )
    target = target_membership.scalar_one_or_none()
    if not target:
        raise ValueError("User is not a member of your cooperative")

    coop = await get_cooperative(db, admin.cooperative_id)
    await db.delete(target)
    coop.member_count -= 1
    coop.updated_at = datetime.utcnow()
    await db.commit()

    # Notify the removed user
    await create_notification(
        db, target_user_id,
        type="social",
        subtype="coop_removed",
        title="Removed from Cooperative",
        description=f"You have been removed from {coop.name}",
    )


async def regenerate_invite_code(db: AsyncSession, admin_user_id: int) -> str:
    """Admin regenerates the cooperative's invite code."""
    membership = await db.execute(
        select(CooperativeMember).where(CooperativeMember.user_id == admin_user_id)
    )
    member = membership.scalar_one_or_none()
    if not member or member.role != "admin":
        raise ValueError("Only cooperative admins can regenerate invite codes")

    coop = await get_cooperative(db, member.cooperative_id)
    coop.invite_code = await generate_unique_invite_code(db)
    coop.updated_at = datetime.utcnow()
    await db.commit()

    return coop.invite_code
```

#### 2.3 Combined Stats Worker

Create an arq periodic task that updates cooperative stats every 5 minutes:

```python
# backend/app/workers/cooperative_worker.py

async def update_cooperative_stats(ctx):
    """Update combined stats for all active cooperatives. Runs every 5 minutes."""
    db: AsyncSession = ctx["db"]

    cooperatives = await db.execute(
        select(Cooperative).where(Cooperative.is_active == True)
    )

    for coop in cooperatives.scalars():
        members = await db.execute(
            select(CooperativeMember).where(
                CooperativeMember.cooperative_id == coop.id
            )
        )

        total_hashrate = 0
        total_shares_week = 0
        online_count = 0

        for member in members.scalars():
            # Get member's current stats from workers table
            worker_stats = await get_user_worker_stats(db, member.user_id)
            member.hashrate = worker_stats["hashrate_1h"]
            member.shares_today = worker_stats["shares_today"]
            member.is_online = worker_stats["is_online"]

            total_hashrate += member.hashrate
            total_shares_week += worker_stats.get("shares_week", 0)
            if member.is_online:
                online_count += 1

        coop.combined_hashrate = total_hashrate
        coop.total_shares_week = total_shares_week
        coop.updated_at = datetime.utcnow()

    await db.commit()
```

### Part 3: Notification System

#### 3.1 Notification Creation

```python
# backend/app/social/notification_service.py

async def create_notification(
    db: AsyncSession,
    user_id: int,
    type: str,          # mining, gamification, competition, social, system
    subtype: str,       # personal_best, badge_earned, match_starting, etc.
    title: str,
    description: str = None,
    action_url: str = None,
    action_label: str = None,
    metadata: dict = None,
) -> Notification:
    """Create a notification and push it via WebSocket."""
    # Validate type
    VALID_TYPES = {"mining", "gamification", "competition", "social", "system"}
    if type not in VALID_TYPES:
        raise ValueError(f"Invalid notification type: {type}. Must be one of {VALID_TYPES}")

    # Check user's notification preferences
    preferences = await get_user_notification_preferences(db, user_id)
    if not should_deliver(preferences, type, subtype):
        return None  # User has this notification category disabled

    notification = Notification(
        user_id=user_id,
        type=type,
        subtype=subtype,
        title=title,
        description=description,
        action_url=action_url,
        action_label=action_label,
        metadata=metadata or {},
    )
    db.add(notification)
    await db.flush()

    # Push via WebSocket immediately
    redis = get_redis()
    ws_payload = {
        "event": "notification",
        "data": {
            "id": str(notification.id),
            "type": notification.type,
            "subtype": notification.subtype,
            "title": notification.title,
            "description": notification.description,
            "timestamp": notification.created_at.isoformat(),
            "read": False,
            "actionUrl": notification.action_url,
            "actionLabel": notification.action_label,
        }
    }
    await redis.publish(f"ws:user:{user_id}", json.dumps(ws_payload))

    return notification


def should_deliver(preferences: NotificationPreferences, type: str, subtype: str) -> bool:
    """Check if a notification should be delivered based on user preferences."""
    if not preferences.in_app:
        return False

    PREFERENCE_MAP = {
        ("mining", "personal_best"): preferences.personal_best,
        ("gamification", "badge_earned"): preferences.badge_earned,
        ("competition", "match_starting"): preferences.world_cup_match,
        ("competition", "match_result"): preferences.world_cup_match,
        ("competition", "lottery_results"): preferences.lottery_results,
        ("social", "block_found"): preferences.block_found_any,
        ("competition", "leaderboard_change"): preferences.leaderboard_change,
        ("social", "coop_activity"): preferences.coop_activity,
        ("social", "coop_member_joined"): preferences.coop_activity,
        ("gamification", "education_recommendation"): preferences.education_recommendation,
    }

    key = (type, subtype)
    return PREFERENCE_MAP.get(key, True)  # Default to True for unmatched types
```

#### 3.2 Notification Categories and Events

Create notifications for these events throughout the system:

| Category | Subtype | When | Title Template | Source |
|---|---|---|---|---|
| mining | personal_best | New best difficulty | "New Best Difficulty!" | Event collector |
| mining | worker_online | Worker reconnects | "Worker Online" | Event collector |
| mining | worker_offline | Worker offline > 30min | "Worker Offline" | Background worker |
| mining | streak_warning | Sunday 18:00 UTC, no shares this week | "Streak Expiring Soon" | Streak worker |
| gamification | badge_earned | Badge awarded | 'Badge Earned: "{name}"' | Trigger engine |
| gamification | level_up | Level increased | "Level Up!" | XP service |
| gamification | streak_extended | Streak continues (Monday) | "Streak Extended!" | Streak worker |
| competition | match_starting | Match begins | "World Cup Match Starting" | Match worker |
| competition | match_result | Match completes | "Match Complete: {score}" | Match worker |
| competition | lottery_results | Weekly draw completes | "Weekly Lottery Results" | Lottery worker |
| competition | leaderboard_change | Rank changes by 5+ | "Leaderboard Update" | Leaderboard worker |
| social | block_found | Any user finds a block | "Block Found!" | Event collector |
| social | coop_activity | Cooperative milestone | "Cooperative Update" | Coop worker |
| social | coop_member_joined | New member joins | "New Member Joined" | Coop service |
| social | coop_removed | Removed from coop | "Removed from Cooperative" | Coop service |
| system | maintenance | Scheduled maintenance | "Scheduled Maintenance" | Admin |
| system | welcome | New user onboarded | "Welcome to The Bitcoin Game!" | Onboarding |

#### 3.3 Email Delivery Stub

Create an email delivery interface that is stubbed for now but ready for SendGrid/SES integration:

```python
# backend/app/social/email_service.py

from abc import ABC, abstractmethod


class EmailService(ABC):
    """Abstract email delivery service. Implement for SendGrid, SES, etc."""

    @abstractmethod
    async def send(self, to: str, subject: str, body_html: str) -> bool:
        """Send an email. Returns True if successful."""
        ...


class StubEmailService(EmailService):
    """Stub implementation that logs emails instead of sending them."""

    async def send(self, to: str, subject: str, body_html: str) -> bool:
        logger.info(f"[EMAIL STUB] To: {to}, Subject: {subject}")
        return True


class SendGridEmailService(EmailService):
    """SendGrid implementation. Configure later."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def send(self, to: str, subject: str, body_html: str) -> bool:
        # TODO: Implement when SendGrid is configured
        raise NotImplementedError("SendGrid not configured yet")


def get_email_service() -> EmailService:
    """Factory: returns the configured email service."""
    api_key = settings.SENDGRID_API_KEY
    if api_key:
        return SendGridEmailService(api_key)
    return StubEmailService()
```

### Part 4: Activity Feed

#### 4.1 Recording Activity

Activities are recorded for significant user events. They feed the personal history feed.

```python
# backend/app/social/activity_service.py

async def record_activity(
    db: AsyncSession,
    user_id: int,
    activity_type: str,
    title: str,
    description: str = None,
    metadata: dict = None,
) -> UserActivity:
    """Record a user activity for the feed."""
    activity = UserActivity(
        user_id=user_id,
        activity_type=activity_type,
        title=title,
        description=description,
        metadata=metadata or {},
    )
    db.add(activity)
    await db.flush()
    return activity


# Activity types and when they are recorded:
ACTIVITY_TRIGGERS = {
    "share_submitted": "Mining share submitted",              # Only notable shares (top 1% diff)
    "badge_earned": "Earned badge: {badge_name}",
    "level_up": "Reached level {level}: {title}",
    "game_played": "Played {game_type}",
    "lottery_result": "Weekly lottery: ranked #{rank}",
    "coop_joined": "Joined cooperative: {coop_name}",
    "coop_created": "Created cooperative: {coop_name}",
    "streak_milestone": "Reached {weeks}-week mining streak",
    "worldcup_registered": "Registered for World Cup",
    "block_found": "Found Block #{height}!",
}
```

#### 4.2 Activity Feed Endpoint

```python
@router.get("/activity/feed")
async def get_activity_feed(
    page: int = 1,
    per_page: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's activity feed (personal history)."""
    offset = (page - 1) * per_page

    activities = await db.execute(
        select(UserActivity)
        .where(UserActivity.user_id == current_user.id)
        .order_by(UserActivity.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )

    total = await db.execute(
        select(func.count(UserActivity.id))
        .where(UserActivity.user_id == current_user.id)
    )

    return {
        "activities": [activity_to_response(a) for a in activities.scalars()],
        "total": total.scalar(),
        "page": page,
        "per_page": per_page,
    }
```

### Part 5: Public Miner Profile

#### 5.1 Privacy Enforcement

```python
# backend/app/social/public_profile_service.py

async def get_public_profile(
    db: AsyncSession,
    btc_address: str,
) -> dict | None:
    """
    Get a user's public profile.
    Returns None (→ 404) if user not found OR publicProfile is disabled.
    """
    user = await db.execute(
        select(User).where(User.btc_address == btc_address)
    )
    user = user.scalar_one_or_none()
    if not user:
        return None

    # Check privacy settings
    settings = await get_user_settings(db, user.id)
    if not settings.public_profile:
        return None  # Return None → endpoint returns 404

    # Build public profile (respecting individual toggles)
    profile = {
        "display_name": user.display_name or f"Miner-{user.btc_address[:8]}",
        "btc_address": user.btc_address,
        "level": user.gamification.level if user.gamification else 1,
        "level_title": user.gamification.level_title if user.gamification else "Nocoiner",
        "badges_earned": user.gamification.badges_earned if user.gamification else 0,
        "member_since": user.created_at.isoformat(),
    }

    # Conditional fields based on privacy settings
    if settings.show_country_flag:
        profile["country_code"] = user.country_code
    else:
        profile["country_code"] = None

    return profile


async def get_public_stats(
    db: AsyncSession,
    btc_address: str,
) -> dict | None:
    """
    Get a user's public mining stats.
    Returns None (→ 404) if user not found OR publicProfile is disabled.
    """
    user = await db.execute(
        select(User).where(User.btc_address == btc_address)
    )
    user = user.scalar_one_or_none()
    if not user:
        return None

    settings = await get_user_settings(db, user.id)
    if not settings.public_profile:
        return None

    gamification = user.gamification
    if not gamification:
        return {"best_difficulty": 0, "total_shares": 0, "blocks_found": 0}

    return {
        "best_difficulty": gamification.best_difficulty,
        "total_shares": gamification.total_shares,
        "blocks_found": gamification.blocks_found,
        "current_streak": gamification.current_streak,
        "badges": await get_user_badge_slugs(db, user.id),
    }
```

#### 5.2 Public Profile Endpoints

```python
@router.get("/users/{address}/profile")
async def get_user_public_profile(
    address: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a user's public profile by Bitcoin address."""
    profile = await get_public_profile(db, address)
    if profile is None:
        raise HTTPException(status_code=404, detail="User not found")
    return profile


@router.get("/users/{address}/stats")
async def get_user_public_stats(
    address: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a user's public mining stats by Bitcoin address."""
    stats = await get_public_stats(db, address)
    if stats is None:
        raise HTTPException(status_code=404, detail="User not found")
    return stats
```

### Part 6: API Endpoints

Create routers at `backend/app/api/v1/social.py` and `backend/app/api/v1/notifications.py` with 17 endpoints total:

#### 6.1 Cooperative Endpoints (10)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/cooperatives` | List all cooperatives (paginated, public) | No |
| POST | `/cooperatives` | Create a cooperative | Yes |
| GET | `/cooperatives/{id}` | Cooperative detail with members | No |
| PUT | `/cooperatives/{id}` | Update name/motto (admin only) | Yes |
| DELETE | `/cooperatives/{id}` | Dissolve cooperative (admin only, must be empty) | Yes |
| POST | `/cooperatives/join` | Join via invite code | Yes |
| POST | `/cooperatives/leave` | Leave current cooperative | Yes |
| POST | `/cooperatives/{id}/remove-member` | Remove member (admin only) | Yes |
| POST | `/cooperatives/{id}/regenerate-code` | Regenerate invite code (admin only) | Yes |
| GET | `/cooperatives/{id}/stats` | Cooperative stats (hashrate, shares, members) | No |

#### 6.2 Notification Endpoints (4)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/notifications` | List user's notifications (paginated) | Yes |
| POST | `/notifications/{id}/read` | Mark notification as read | Yes |
| POST | `/notifications/read-all` | Mark all notifications as read | Yes |
| GET | `/notifications/unread-count` | Get unread notification count | Yes |

#### 6.3 Activity & Profile Endpoints (3)

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/activity/feed` | User's activity feed (paginated) | Yes |
| GET | `/users/{address}/profile` | Public miner profile | No |
| GET | `/users/{address}/stats` | Public miner stats | No |

#### Response Shape Examples

```python
# Cooperative (must match frontend Cooperative interface)
class CooperativeResponse(BaseModel):
    id: str
    name: str
    motto: str | None
    member_count: int
    combined_hashrate: float
    weekly_streak: int
    best_combined_diff: float
    blocks_found: int
    total_shares_week: int
    weekly_rank: int
    members: list[CoopMemberResponse]
    invite_code: str | None = None  # Only shown to members

class CoopMemberResponse(BaseModel):
    user_id: str
    display_name: str
    hashrate: float
    shares_today: int
    is_online: bool
    role: str  # "admin" or "member"

# Notification (must match frontend NotificationItem)
class NotificationResponse(BaseModel):
    id: str
    type: str           # mining, gamification, competition, social, system
    subtype: str
    title: str
    description: str | None
    timestamp: datetime
    read: bool
    action_url: str | None = None
    action_label: str | None = None
```

---

## Testing Requirements

These tests are **NON-NEGOTIABLE**.

### Unit Tests

```python
# tests/unit/test_invite_codes.py

class TestInviteCodes:
    """Test invite code generation."""

    def test_code_is_8_chars(self):
        code = generate_invite_code()
        assert len(code) == 8

    def test_code_is_alphanumeric_uppercase(self):
        code = generate_invite_code()
        assert all(c in string.ascii_uppercase + string.digits for c in code)

    def test_codes_are_unique(self):
        codes = {generate_invite_code() for _ in range(1000)}
        assert len(codes) == 1000  # All unique

    def test_code_is_case_insensitive_on_lookup(self):
        """Invite code lookup should be case-insensitive."""
        code = "ABC12345"
        assert normalize_invite_code("abc12345") == code
        assert normalize_invite_code("Abc12345") == code


# tests/unit/test_cooperative_rules.py

class TestCooperativeRules:
    """Test cooperative business rules."""

    async def test_max_20_members(self, db):
        """Cannot join a cooperative with 20 members."""
        coop = await create_coop_with_members(db, count=20)
        user = await create_test_user(db)
        with pytest.raises(ValueError, match="full"):
            await join_cooperative(db, user.id, coop.invite_code)

    async def test_user_in_one_coop_only(self, db):
        """A user cannot be in two cooperatives."""
        coop1 = await create_test_cooperative(db)
        coop2 = await create_test_cooperative(db)
        user = await create_test_user(db)

        await join_cooperative(db, user.id, coop1.invite_code)
        with pytest.raises(ValueError, match="already a member"):
            await join_cooperative(db, user.id, coop2.invite_code)

    async def test_admin_transfer_on_leave(self, db):
        """When admin leaves, ownership transfers to oldest member."""
        coop, admin, member = await create_coop_with_admin_and_member(db)
        await leave_cooperative(db, admin.id)

        refreshed_member = await get_member(db, member.id)
        assert refreshed_member.role == "admin"

    async def test_last_member_dissolves_coop(self, db):
        """When last member leaves, cooperative is dissolved."""
        coop = await create_test_cooperative(db)  # Owner only
        await leave_cooperative(db, coop.owner_user_id)

        refreshed = await get_cooperative(db, coop.id)
        assert refreshed.is_active == False

    async def test_non_admin_cannot_remove_members(self, db):
        """Only admins can remove members."""
        coop, admin, member, regular = await create_coop_with_members(db, count=3)
        with pytest.raises(ValueError, match="Only cooperative admins"):
            await remove_member(db, regular.user_id, member.user_id)


# tests/unit/test_privacy_enforcement.py

class TestPrivacyEnforcement:
    """Test that privacy settings are enforced."""

    async def test_disabled_profile_returns_none(self, db):
        """publicProfile=false → get_public_profile returns None."""
        user = await create_test_user(db)
        await set_privacy(db, user.id, public_profile=False)
        result = await get_public_profile(db, user.btc_address)
        assert result is None

    async def test_enabled_profile_returns_data(self, db):
        """publicProfile=true → get_public_profile returns data."""
        user = await create_test_user(db)
        await set_privacy(db, user.id, public_profile=True)
        result = await get_public_profile(db, user.btc_address)
        assert result is not None
        assert result["display_name"] is not None

    async def test_country_flag_hidden_when_disabled(self, db):
        """showCountryFlag=false → country_code is None in public profile."""
        user = await create_test_user(db, country_code="PT")
        await set_privacy(db, user.id, public_profile=True, show_country_flag=False)
        result = await get_public_profile(db, user.btc_address)
        assert result["country_code"] is None

    async def test_nonexistent_user_returns_none(self, db):
        """Unknown address → None (same as disabled, prevents enumeration)."""
        result = await get_public_profile(db, "bc1qnonexistent")
        assert result is None


# tests/unit/test_notification_preferences.py

class TestNotificationPreferences:
    """Test notification delivery respects preferences."""

    def test_personal_best_default_on(self):
        prefs = default_preferences()
        assert should_deliver(prefs, "mining", "personal_best") == True

    def test_block_found_default_off(self):
        prefs = default_preferences()
        assert should_deliver(prefs, "social", "block_found") == False

    def test_in_app_disabled_blocks_all(self):
        prefs = default_preferences()
        prefs.in_app = False
        assert should_deliver(prefs, "mining", "personal_best") == False
        assert should_deliver(prefs, "gamification", "badge_earned") == False
```

### Integration Tests

```python
# tests/integration/test_cooperative_lifecycle.py

class TestCooperativeLifecycle:
    """Integration: create -> join -> stats -> leave."""

    async def test_full_cooperative_lifecycle(self, auth_client, db):
        """Create coop, invite members, check stats, leave."""
        # 1. Create cooperative
        response = await auth_client.post("/api/v1/cooperatives", json={
            "name": "Test Miners",
            "motto": "Mining together",
        })
        assert response.status_code == 201
        coop = response.json()
        assert len(coop["invite_code"]) == 8
        assert coop["member_count"] == 1

        # 2. Second user joins via invite code
        response2 = await auth_client_2.post("/api/v1/cooperatives/join", json={
            "invite_code": coop["invite_code"],
        })
        assert response2.status_code == 200

        # 3. Verify member count
        response3 = await auth_client.get(f"/api/v1/cooperatives/{coop['id']}")
        assert response3.json()["member_count"] == 2

        # 4. Second user leaves
        response4 = await auth_client_2.post("/api/v1/cooperatives/leave")
        assert response4.status_code == 200

        # 5. Verify member count decreased
        response5 = await auth_client.get(f"/api/v1/cooperatives/{coop['id']}")
        assert response5.json()["member_count"] == 1

    async def test_notification_delivery_via_websocket(self, auth_client, ws_client, db):
        """Badge earned → notification → WebSocket push."""
        # Trigger a badge (via Phase 4 engine)
        await trigger_test_badge(db, user_id, "first_share")

        # Check WebSocket received the notification
        msg = await ws_client.receive_json(timeout=5)
        assert msg["event"] == "notification"
        assert msg["data"]["type"] == "gamification"
        assert msg["data"]["subtype"] == "badge_earned"

    async def test_public_profile_privacy_404(self, client, db):
        """Disabled public profile returns 404."""
        user = await create_test_user(db)
        await set_privacy(db, user.id, public_profile=False)

        response = await client.get(f"/api/v1/users/{user.btc_address}/profile")
        assert response.status_code == 404

    async def test_public_profile_enabled(self, client, db):
        """Enabled public profile returns profile data."""
        user = await create_test_user(db)
        await set_privacy(db, user.id, public_profile=True)

        response = await client.get(f"/api/v1/users/{user.btc_address}/profile")
        assert response.status_code == 200
        assert "display_name" in response.json()
```

### Test Coverage Target: 85%+

---

## Rules

1. **20 members max.** The cooperative member limit is hardcoded at 20. No configuration option, no admin override.
2. **One cooperative per user.** A user can only be in one cooperative at a time. They must leave before joining another.
3. **Invite codes are server-generated.** 8 characters, A-Z and 0-9, cryptographically random. Case-insensitive on lookup.
4. **Privacy = 404.** When `publicProfile` is disabled, the public profile endpoint returns HTTP 404. Not 403, not an empty response. This prevents user enumeration.
5. **Notification types match frontend.** Only use the 5 types: mining, gamification, competition, social, system. Do not invent new categories.
6. **WebSocket for real-time delivery.** Every notification is pushed via WebSocket immediately on creation. Use the Phase 3 Redis pub/sub channel (`ws:user:{user_id}`).
7. **Respect notification preferences.** Check the user's notification settings before creating a notification. If the user has disabled a category, do not create the notification at all.
8. **Do not touch `dashboard/`.** The frontend is done.
9. **Admin ownership transfer.** When the admin leaves, ownership transfers to the longest-serving member. When the last member leaves, the cooperative is dissolved.
10. **Email is stubbed.** Create the `EmailService` interface but use `StubEmailService` in development. The real implementation (SendGrid/SES) comes later.
11. **Activity feed is personal.** The activity feed shows only the authenticated user's own activities. There is no global activity feed in this phase.
12. **Combined stats updated every 5 min.** The cooperative's `combined_hashrate`, `total_shares_week`, and member `is_online` status are refreshed by an arq background worker every 5 minutes.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `backend/app/social/__init__.py` |
| CREATE | `backend/app/social/models.py` |
| CREATE | `backend/app/social/schemas.py` |
| CREATE | `backend/app/social/cooperative_service.py` |
| CREATE | `backend/app/social/invite_codes.py` |
| CREATE | `backend/app/social/notification_service.py` |
| CREATE | `backend/app/social/email_service.py` |
| CREATE | `backend/app/social/activity_service.py` |
| CREATE | `backend/app/social/public_profile_service.py` |
| CREATE | `backend/app/api/v1/social.py` |
| CREATE | `backend/app/api/v1/notifications.py` |
| CREATE | `backend/app/workers/cooperative_worker.py` |
| CREATE | `backend/alembic/versions/007_social_tables.py` |
| CREATE | `tests/unit/test_invite_codes.py` |
| CREATE | `tests/unit/test_cooperative_rules.py` |
| CREATE | `tests/unit/test_privacy_enforcement.py` |
| CREATE | `tests/unit/test_notification_preferences.py` |
| CREATE | `tests/integration/test_cooperative_lifecycle.py` |
| CREATE | `tests/integration/test_notifications_api.py` |
| CREATE | `tests/integration/test_public_profile.py` |
| EDIT | `backend/app/api/v1/__init__.py` — register social and notifications routers |
| EDIT | `backend/app/main.py` — add social and notifications routers |
| EDIT | `backend/app/workers/__init__.py` — register cooperative worker |

---

## Definition of Done

1. **Cooperatives can be created.** `POST /cooperatives` creates a cooperative with a server-generated 8-char invite code. The creator becomes admin.
2. **Joining via invite code works.** `POST /cooperatives/join` with a valid invite code adds the user as a member. Invalid codes return an error.
3. **20 member limit enforced.** Attempting to join a full cooperative returns an error.
4. **One coop per user enforced.** Attempting to join while already in a cooperative returns an error.
5. **Leave/remove works correctly.** Members can leave. Admins can remove members. Admin transfer happens on admin leave. Last member dissolves the coop.
6. **Invite code regeneration works.** Admins can regenerate the invite code. The old code stops working immediately.
7. **Combined stats updated every 5 min.** The arq worker updates `combined_hashrate` and member stats.
8. **Notifications created for all events.** Mining, gamification, competition, social, and system events all create notifications.
9. **WebSocket push works.** Notifications are pushed via WebSocket immediately on creation. The payload matches `NotificationItem`.
10. **Notification preferences respected.** Disabled categories do not produce notifications.
11. **Mark read/read-all works.** `POST /notifications/{id}/read` and `POST /notifications/read-all` update the read status.
12. **Unread count is correct.** `GET /notifications/unread-count` returns the accurate count of unread notifications.
13. **Public profile returns 404 when disabled.** `publicProfile=false` -> HTTP 404 on both `/profile` and `/stats` endpoints.
14. **Public profile returns data when enabled.** `publicProfile=true` -> profile data with country flag controlled by `showCountryFlag`.
15. **Activity feed paginated.** `GET /activity/feed` returns paginated user activities.
16. **All 17 endpoints return correct responses.** Each endpoint matches the documented response shape.
17. **Test coverage is 85%+** for all social modules.

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Database migration** — Create the Alembic migration with all 4 tables (cooperatives, cooperative_members, notifications, user_activity). Run the migration.

2. **Invite code generation** — Implement the code generator with uniqueness check. Write unit tests for code format and uniqueness.

3. **Cooperative CRUD** — Implement create, join, leave, remove-member. Write unit tests for all business rules (20 member limit, one coop per user, admin transfer).

4. **Cooperative API endpoints** — Create the 10 cooperative endpoints. Test with integration tests.

5. **Notification service** — Implement notification creation with preference checking and WebSocket push. Write unit tests for preference filtering.

6. **Notification endpoints** — Create the 4 notification endpoints. Test mark-read and unread-count.

7. **Wire notifications to existing features** — Add notification creation calls to: gamification trigger engine (badge_earned, level_up), streak service (streak_extended, streak_warning), lottery worker (lottery_results), match worker (match_starting, match_result).

8. **Email service stub** — Create the EmailService interface with StubEmailService. No real email sending yet.

9. **Activity feed** — Implement activity recording and the feed endpoint. Wire to existing events.

10. **Public profile** — Implement privacy-enforced public profile endpoints. Write privacy enforcement tests.

11. **Cooperative stats worker** — Create the arq periodic task for updating combined stats.

12. **Integration tests** — Write the full cooperative lifecycle test and notification delivery test.

**Critical: Get step 3 (cooperative CRUD with all business rules) working with full unit test coverage before building the API endpoints. The business rules (member limits, one-coop-per-user, admin transfer) are the core of the cooperative system.**
