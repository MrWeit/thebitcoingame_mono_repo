# Prompt: Backend Service — Phase 3 (Dashboard & Real-Time)

You are continuing to build the backend API service for **The Bitcoin Game** — a Bitcoin mining gamification platform. Phase 0 (foundation), Phase 1 (authentication), and Phase 2 (mining data) are complete. The FastAPI project at `services/api/` has the full middleware stack, health endpoints, Bitcoin message signing auth (P2PKH, P2WPKH, P2TR), RS256 JWT tokens, user profile CRUD, settings, API key management, Redis Stream consumer (8 event types), worker status tracking (Redis hashes), cursor-based share pagination, hashrate computation, personal bests, difficulty analysis, and all 17 mining data endpoints. The arq event consumer is running as a separate Docker service.

The frontend dashboard is complete at `dashboard/` (React 19 + TypeScript + Vite 7 + TanStack Query v5 + Zustand) and currently uses mock data. This phase builds the WebSocket server, Redis pub/sub bridge, dashboard stats aggregation, global activity feed, and the frontend integration layer (API client, WebSocket client, TanStack Query hooks) that replaces all mock data with live API calls and real-time updates.

---

## IMPORTANT CONSTRAINTS

1. **Phases 0, 1, and 2 are complete.** Auth works. JWT tokens work. Mining endpoints work. Stream consumer works. Do NOT recreate any of this.
2. **Do not touch `services/ckpool/` or `services/event-collector/`** — they are working. The event collector writes to Redis Streams and TimescaleDB. The Phase 2 consumer reads these streams.
3. **Single WebSocket endpoint.** One endpoint: `/ws?token={jwt}`. No multiple WS routes. Channel multiplexing via JSON subscribe/unsubscribe messages.
4. **JWT in query parameter for WebSocket.** Browsers cannot set custom headers on WebSocket connections. The JWT token is passed as a query parameter. The connection is authenticated once at connect time.
5. **Redis pub/sub is the bridge.** The Phase 2 event consumer already publishes to Redis pub/sub channels (`pubsub:*`). This phase subscribes to those channels and fans out to WebSocket clients. Do NOT read from Redis Streams in this phase — the consumer already handles that.
6. **Dashboard stats are cached in Redis (10s TTL).** The aggregation endpoint reads from Redis cache first, falls back to database queries, caches the result. Do not query the database on every request.
7. **Frontend files go in `dashboard/src/`.** You WILL create files in the dashboard directory for this phase — specifically `src/lib/api.ts`, `src/lib/ws.ts`, and `src/hooks/useApi.ts`. These are the integration glue. Do NOT modify existing page components or stores beyond what is necessary to wire them to the API.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Sections 7 (WebSocket Design), 4.2 (Share Submission to Dashboard Update flow), 6.8 (Dashboard endpoints). These define the real-time architecture.
2. `docs/backend-service/roadmap/phase-03-dashboard-realtime.md` — **The detailed specification for Phase 3.** Contains complete code for the connection manager, WebSocket router, Redis pub/sub bridge, dashboard service, dashboard router, frontend clients, and tests.
3. `services/api/src/tbg/auth/jwt.py` — The `verify_token` function you will use to authenticate WebSocket connections.
4. `services/api/src/tbg/auth/dependencies.py` — The `get_current_user` dependency used on REST endpoints.
5. `services/api/src/tbg/mining/service.py` — The `get_mining_summary` function you will call from dashboard stats aggregation.
6. `services/api/src/tbg/config.py` — Current config. You will add WebSocket and dashboard settings.
7. `services/api/src/tbg/workers/event_consumer.py` — The Phase 2 consumer that publishes to `pubsub:*` channels. Your bridge subscribes to these.
8. `dashboard/src/mocks/data.ts` — The mock data shapes the frontend currently uses. Your API responses MUST match these shapes so the frontend works without page-level changes.
9. `dashboard/src/stores/authStore.ts` — The auth store that will hold the JWT token. Your API client reads from this.
10. `dashboard/src/pages/Dashboard.tsx` — The dashboard page that will consume your API hooks and WebSocket data.

Read ALL of these before writing any code.

---

## What You Are Building

### Part 1: WebSocket Connection Manager

Create `src/tbg/ws/manager.py` — tracks all active WebSocket connections and their channel subscriptions. Handles fan-out of messages to subscribed clients.

**Data structures:**

```python
@dataclass
class ClientConnection:
    """Represents a single WebSocket client."""
    websocket: WebSocket
    user_id: int
    btc_address: str
    subscriptions: set[str] = field(default_factory=set)
    connected_at: float = field(default_factory=time.time)
    messages_sent: int = 0


class ConnectionManager:
    """Manages all active WebSocket connections."""

    def __init__(self) -> None:
        self._connections: dict[str, ClientConnection] = {}       # conn_id -> client
        self._channels: dict[str, set[str]] = defaultdict(set)    # channel -> {conn_ids}
        self._user_connections: dict[int, set[str]] = defaultdict(set)  # user_id -> {conn_ids}
```

**Core methods:**

| Method | Signature | Purpose |
|---|---|---|
| `connect` | `async def connect(websocket, conn_id, user_id, btc_address) -> None` | Accept WS, create ClientConnection, register in maps |
| `disconnect` | `async def disconnect(conn_id) -> None` | Remove from all maps, clean up channel subscriptions |
| `subscribe` | `async def subscribe(conn_id, channel) -> bool` | Add conn to channel set. Valid channels: `mining`, `dashboard`, `gamification`, `competition` |
| `unsubscribe` | `async def unsubscribe(conn_id, channel) -> bool` | Remove conn from channel set |
| `broadcast_to_channel` | `async def broadcast_to_channel(channel, message) -> int` | Send to all subscribers. Return count. Clean up dead connections. |
| `send_to_user` | `async def send_to_user(user_id, channel, message) -> int` | Send to specific user on specific channel |
| `get_stats` | `def get_stats() -> dict` | Return total connections, unique users, per-channel counts |

Create a global singleton: `manager = ConnectionManager()`

### Part 2: WebSocket Router

Create `src/tbg/ws/router.py` — single WebSocket endpoint with JWT authentication.

**Endpoint:** `ws://host/ws?token={jwt}`

**Protocol:**

```
Client -> Server:
    {"action": "subscribe", "channel": "mining"}
    {"action": "unsubscribe", "channel": "mining"}
    {"action": "ping"}

Server -> Client:
    {"channel": "mining", "data": {...}}
    {"channel": "dashboard", "data": {...}}
    {"type": "pong"}
    {"type": "error", "message": "..."}
    {"type": "subscribed", "channel": "mining"}
    {"type": "unsubscribed", "channel": "mining"}
```

**Authentication flow:**

```python
@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
) -> None:
    # 1. Verify JWT
    try:
        payload = verify_token(token, expected_type="access")
        user_id = int(payload["sub"])
        btc_address = payload["address"]
    except Exception as e:
        await websocket.close(code=4001, reason=f"Authentication failed: {e}")
        return

    # 2. Generate unique connection ID
    conn_id = str(uuid.uuid4())

    # 3. Register connection
    await manager.connect(websocket, conn_id, user_id, btc_address)

    # 4. Enter message loop
    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            # Handle subscribe, unsubscribe, ping
    except WebSocketDisconnect:
        await manager.disconnect(conn_id)
```

**Error handling:** Invalid JSON sends `{"type": "error", "message": "Invalid JSON"}`. Unknown action sends `{"type": "error", "message": "Unknown action: {action}"}`. Invalid channel sends `{"type": "error", "message": "Invalid channel: {channel}"}`.

### Part 3: Redis Pub/Sub Bridge

Create `src/tbg/ws/bridge.py` — subscribes to Redis pub/sub channels and pushes messages to WebSocket clients via the connection manager.

**Channel mapping (Redis pub/sub -> WebSocket channel):**

```python
CHANNEL_MAP = {
    "pubsub:share_submitted": "mining",
    "pubsub:worker_status": "mining",
    "pubsub:hashrate_update": "mining",
    "pubsub:best_diff": "mining",
    "pubsub:block_found": "dashboard",
    "pubsub:badge_earned": "gamification",
    "pubsub:xp_gained": "gamification",
    "pubsub:level_up": "gamification",
    "pubsub:streak_update": "gamification",
    "pubsub:leaderboard_update": "competition",
    "pubsub:match_update": "competition",
    "pubsub:feed_item": "dashboard",
}
```

**Bridge lifecycle:**

```python
class PubSubBridge:
    def __init__(self, redis_client: redis.Redis) -> None:
        self.redis = redis_client
        self._running = False

    async def start(self) -> None:
        """Start listening. Called from FastAPI lifespan startup."""
        self._running = True
        pubsub = self.redis.pubsub()
        await pubsub.subscribe(*CHANNEL_MAP.keys())
        # Loop: get_message, parse, broadcast_to_channel

    async def stop(self) -> None:
        """Stop listening. Called from FastAPI lifespan shutdown."""
        self._running = False
```

**Integration with FastAPI lifespan:**

```python
# In main.py lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    redis = get_redis()
    bridge = PubSubBridge(redis)
    task = asyncio.create_task(bridge.start())
    yield
    await bridge.stop()
    task.cancel()
```

### Part 4: Dashboard Stats Aggregation

Create `src/tbg/dashboard/service.py` — combines mining, gamification, and event data into a single endpoint response.

**GET /api/v1/dashboard/stats** (cached 10s in Redis):

```python
DASHBOARD_CACHE_KEY = "dashboard:stats:{user_id}"
DASHBOARD_CACHE_TTL = 10  # seconds

async def get_dashboard_stats(session, redis, user_id, btc_address) -> dict:
    """
    Aggregated dashboard stats. Shape MUST match frontend mockDashboardStats.
    """
    # 1. Check Redis cache
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    # 2. Get mining summary from Phase 2 service
    mining = await get_mining_summary(session, user_id, btc_address)

    # 3. Get gamification state (graceful fallback — gamification engine is Phase 4)
    try:
        gamification = await get_gamification_state(session, user_id)
    except Exception:
        gamification = {"level": 1, "level_title": "Nocoiner", "xp": 0, "xp_to_next": 100, "streak": 0, "badges_earned": 0}

    # 4. Get network info from Redis
    network_diff = float(await redis.get("network:difficulty") or 0)
    network_height = int(await redis.get("network:height") or 0)

    # 5. Assemble response matching frontend shape
    stats = {
        "hashrate": mining.get("hashrate_5m", 0),
        "hashrate_change": mining.get("hashrate_change_24h", 0),
        "shares_today": mining.get("shares_today", 0),
        "shares_change": mining.get("shares_change_pct", 0),
        "workers_online": mining.get("workers_online", 0),
        "workers_total": mining.get("workers_total", 0),
        "streak": gamification.get("streak", 0),
        "best_diff_week": mining.get("best_diff_week", 0),
        "network_diff": network_diff,
        "best_diff_ratio": (mining.get("best_diff_week", 0) / network_diff) if network_diff > 0 else 0,
        "level": gamification.get("level", 1),
        "level_title": gamification.get("level_title", "Nocoiner"),
        "xp": gamification.get("xp", 0),
        "xp_to_next": gamification.get("xp_to_next", 100),
        "badges_earned": gamification.get("badges_earned", 0),
        "network_height": network_height,
    }

    # 6. Cache in Redis
    await redis.setex(cache_key, DASHBOARD_CACHE_TTL, json.dumps(stats))
    return stats
```

### Part 5: Global Activity Feed

**GET /api/v1/dashboard/feed** — pool-wide events: blocks found, badges earned, new miners, competition updates.

```python
async def get_global_feed(session, limit=20, before_id=None) -> list[dict]:
    """Cursor-based feed using ID for pagination (descending)."""
    query = select(ActivityFeed).where(ActivityFeed.is_global == True)
    if before_id:
        query = query.where(ActivityFeed.id < before_id)
    query = query.order_by(desc(ActivityFeed.created_at)).limit(limit)
    # Return list of {id, type, text, description, time, metadata}
```

**GET /api/v1/dashboard/events** — upcoming events (lottery, streak deadline, competitions):

```python
async def get_upcoming_events(session, user_id) -> list[dict]:
    """Events visible to all users + user-specific events, sorted by ends_at ascending."""
    # Filter: is_active AND ends_at > now AND (target_user_id IS NULL OR target_user_id == user_id)
```

**GET /api/v1/dashboard/recent-badges** — recently earned badges for current user:

```python
async def get_recent_badges(session, user_id, limit=5) -> list[dict]:
    """Graceful fallback — gamification tables may not exist until Phase 4."""
    try:
        # Query from gamification tables
    except Exception:
        return []
```

### Part 6: Database Schema (Alembic Migration 004)

Create `alembic/versions/004_dashboard_tables.py`:

```sql
-- Activity feed for global events
CREATE TABLE IF NOT EXISTS activity_feed (
    id              BIGSERIAL PRIMARY KEY,
    event_type      VARCHAR(32) NOT NULL,
    user_id         BIGINT REFERENCES users(id),
    title           TEXT NOT NULL,
    description     TEXT,
    metadata        JSONB DEFAULT '{}',
    is_global       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_global
    ON activity_feed(created_at DESC) WHERE is_global = TRUE;
CREATE INDEX IF NOT EXISTS idx_activity_feed_user
    ON activity_feed(user_id, created_at DESC);

-- Upcoming events
CREATE TABLE IF NOT EXISTS upcoming_events (
    id              VARCHAR(64) PRIMARY KEY,
    event_type      VARCHAR(32) NOT NULL,
    title           VARCHAR(256) NOT NULL,
    description     TEXT,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ NOT NULL,
    action_label    VARCHAR(64),
    action_href     VARCHAR(256),
    is_active       BOOLEAN DEFAULT TRUE,
    target_user_id  BIGINT REFERENCES users(id),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_active
    ON upcoming_events(ends_at ASC) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_events_user
    ON upcoming_events(target_user_id, ends_at ASC) WHERE is_active = TRUE;
```

### Part 7: Activity Feed Pruner (Background Task)

Create a background task that runs every hour (arq cron) to prune old feed items:

```python
async def prune_activity_feed(ctx: dict) -> None:
    """Keep only the last 10,000 global feed items."""
    async with get_session_ctx() as session:
        # Find the 10,000th newest item
        cutoff = await session.execute(
            select(ActivityFeed.id)
            .where(ActivityFeed.is_global == True)
            .order_by(ActivityFeed.id.desc())
            .offset(10000)
            .limit(1)
        )
        cutoff_id = cutoff.scalar()
        if cutoff_id:
            await session.execute(
                delete(ActivityFeed).where(
                    ActivityFeed.is_global == True,
                    ActivityFeed.id < cutoff_id,
                )
            )
            await session.commit()
```

Also prune expired events:

```python
async def prune_expired_events(ctx: dict) -> None:
    """Remove events that ended more than 7 days ago."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    async with get_session_ctx() as session:
        await session.execute(
            delete(UpcomingEvent).where(UpcomingEvent.ends_at < cutoff)
        )
        await session.commit()
```

### Part 8: Frontend API Client (`dashboard/src/lib/api.ts`)

Create a typed HTTP client that integrates with the auth store:

```typescript
/**
 * dashboard/src/lib/api.ts — Typed HTTP client for The Bitcoin Game API.
 */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

class ApiClient {
  private token: string | null = null;

  setToken(token: string): void { this.token = token; }
  clearToken(): void { this.token = null; }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });

    if (response.status === 401) {
      await this.refreshToken();
      return this.request(path, options);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async challenge(btcAddress: string) { return this.request<{nonce: string; message: string}>("/api/v1/auth/challenge", { method: "POST", body: JSON.stringify({ btc_address: btcAddress }) }); }
  async verify(btcAddress: string, signature: string, nonce: string) { return this.request<{access_token: string; refresh_token: string}>("/api/v1/auth/verify", { method: "POST", body: JSON.stringify({ btc_address: btcAddress, signature, nonce }) }); }
  async refreshToken() { /* POST /api/v1/auth/refresh with stored refresh token */ }

  // Mining
  async getWorkers() { return this.request("/api/v1/mining/workers"); }
  async getShares(cursor?: string, limit?: number) { return this.request(`/api/v1/mining/shares?limit=${limit ?? 50}${cursor ? `&cursor=${cursor}` : ""}`); }
  async getHashrate() { return this.request("/api/v1/mining/hashrate"); }
  async getHashrateChart(window: string = "24h") { return this.request(`/api/v1/mining/hashrate/chart?window=${window}`); }
  async getPersonalBests() { return this.request("/api/v1/mining/difficulty/bests"); }
  async getDifficultyScatter() { return this.request("/api/v1/mining/difficulty/scatter"); }
  async getBlocks(cursor?: string) { return this.request(`/api/v1/mining/blocks${cursor ? `?cursor=${cursor}` : ""}`); }

  // Dashboard
  async getDashboardStats() { return this.request("/api/v1/dashboard/stats"); }
  async getGlobalFeed(limit?: number, beforeId?: number) { return this.request(`/api/v1/dashboard/feed?limit=${limit ?? 20}${beforeId ? `&before_id=${beforeId}` : ""}`); }
  async getUpcomingEvents() { return this.request("/api/v1/dashboard/events"); }
  async getRecentBadges(limit?: number) { return this.request(`/api/v1/dashboard/recent-badges?limit=${limit ?? 5}`); }

  // User
  async getProfile() { return this.request("/api/v1/users/me"); }
  async updateProfile(data: Record<string, unknown>) { return this.request("/api/v1/users/me", { method: "PATCH", body: JSON.stringify(data) }); }
}

export const api = new ApiClient();
```

### Part 9: Frontend WebSocket Client (`dashboard/src/lib/ws.ts`)

Create a WebSocket client with auto-reconnect and channel multiplexing:

```typescript
/**
 * dashboard/src/lib/ws.ts — WebSocket client with auto-reconnect.
 */
type MessageHandler = (data: unknown) => void;

const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

class WebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private subscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  connect(token: string): void {
    this.token = token;
    this.reconnectAttempts = 0;
    this._connect();
  }

  private _connect(): void {
    if (!this.token) return;
    this.ws = new WebSocket(`${WS_BASE}/ws?token=${this.token}`);
    this.ws.onmessage = (event) => this.handleMessage(JSON.parse(event.data));
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.resubscribe();
    };
    this.ws.onerror = () => {}; // onclose will fire after onerror
  }

  subscribe(channel: string, handler: MessageHandler): () => void {
    this.subscriptions.add(channel);
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel)!.add(handler);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "subscribe", channel }));
    }

    // Return unsubscribe function
    return () => {
      this.handlers.get(channel)?.delete(handler);
      if (this.handlers.get(channel)?.size === 0) {
        this.subscriptions.delete(channel);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: "unsubscribe", channel }));
        }
      }
    };
  }

  private handleMessage(msg: { channel?: string; data?: unknown; type?: string }): void {
    if (msg.channel && msg.data) {
      this.handlers.get(msg.channel)?.forEach((h) => h(msg.data));
    }
  }

  private resubscribe(): void {
    this.subscriptions.forEach((channel) => {
      this.ws?.send(JSON.stringify({ action: "subscribe", channel }));
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    // Exponential backoff with jitter: base * 2^attempt + random(0..1000)ms
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000) + Math.random() * 1000;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  disconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    this.ws?.close();
    this.ws = null;
  }
}

export const wsClient = new WebSocketClient();
```

### Part 10: TanStack Query Hooks (`dashboard/src/hooks/useApi.ts`)

Create hooks that wrap the API client for use in React components:

```typescript
/**
 * dashboard/src/hooks/useApi.ts — TanStack Query v5 hooks for backend API.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Stale times
const REALTIME = 10_000;    // 10s — matches backend cache TTL
const STANDARD = 60_000;    // 1m
const SLOW = 300_000;       // 5m

// Dashboard
export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => api.getDashboardStats(),
    staleTime: REALTIME,
    refetchInterval: REALTIME,
  });
}

export function useGlobalFeed(limit?: number) {
  return useQuery({
    queryKey: ["dashboard", "feed", limit],
    queryFn: () => api.getGlobalFeed(limit),
    staleTime: REALTIME,
  });
}

export function useUpcomingEvents() {
  return useQuery({
    queryKey: ["dashboard", "events"],
    queryFn: () => api.getUpcomingEvents(),
    staleTime: STANDARD,
  });
}

export function useRecentBadges(limit?: number) {
  return useQuery({
    queryKey: ["dashboard", "recent-badges", limit],
    queryFn: () => api.getRecentBadges(limit),
    staleTime: STANDARD,
  });
}

// Mining
export function useWorkers() {
  return useQuery({
    queryKey: ["mining", "workers"],
    queryFn: () => api.getWorkers(),
    staleTime: REALTIME,
    refetchInterval: REALTIME,
  });
}

export function useShares(cursor?: string) {
  return useQuery({
    queryKey: ["mining", "shares", cursor],
    queryFn: () => api.getShares(cursor),
    staleTime: REALTIME,
  });
}

export function useHashrate() {
  return useQuery({
    queryKey: ["mining", "hashrate"],
    queryFn: () => api.getHashrate(),
    staleTime: REALTIME,
    refetchInterval: REALTIME,
  });
}

export function useHashrateChart(window: string = "24h") {
  return useQuery({
    queryKey: ["mining", "hashrate-chart", window],
    queryFn: () => api.getHashrateChart(window),
    staleTime: SLOW,
  });
}

export function usePersonalBests() {
  return useQuery({
    queryKey: ["mining", "personal-bests"],
    queryFn: () => api.getPersonalBests(),
    staleTime: STANDARD,
  });
}

export function useDifficultyScatter() {
  return useQuery({
    queryKey: ["mining", "difficulty-scatter"],
    queryFn: () => api.getDifficultyScatter(),
    staleTime: STANDARD,
  });
}

export function useBlocks(cursor?: string) {
  return useQuery({
    queryKey: ["mining", "blocks", cursor],
    queryFn: () => api.getBlocks(cursor),
    staleTime: STANDARD,
  });
}

// User
export function useProfile() {
  return useQuery({
    queryKey: ["user", "profile"],
    queryFn: () => api.getProfile(),
    staleTime: SLOW,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.updateProfile(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["user", "profile"] }),
  });
}
```

### Part 11: Frontend Integration Wiring

Update `dashboard/src/App.tsx` or the root provider to initialize TanStack Query:

```typescript
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Wrap app with <QueryClientProvider client={queryClient}>
```

Update the auth store to initialize the API client and WebSocket on login:

```typescript
// In authStore login action:
api.setToken(accessToken);
wsClient.connect(accessToken);

// In authStore logout action:
api.clearToken();
wsClient.disconnect();
```

Add environment variables to `dashboard/.env.development`:

```
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

### Part 12: Dashboard Endpoint Summary

| # | Method | Path | Description | Auth |
|---|---|---|---|---|
| 1 | WS | `/ws?token={jwt}` | WebSocket with channel multiplexing | Yes (JWT in query) |
| 2 | GET | `/api/v1/dashboard/stats` | Aggregated dashboard statistics (10s cached) | Yes |
| 3 | GET | `/api/v1/dashboard/feed` | Global activity feed (cursor: before_id) | Yes |
| 4 | GET | `/api/v1/dashboard/events` | Upcoming events (global + user-specific) | Yes |
| 5 | GET | `/api/v1/dashboard/recent-badges` | Recently earned badges | Yes |

### Part 13: WebSocket Channel Definitions

| Channel | Subscribe Message | Event Types Pushed |
|---|---|---|
| `mining` | `{"action":"subscribe","channel":"mining"}` | share_submitted, worker_status, hashrate_update, best_diff |
| `dashboard` | `{"action":"subscribe","channel":"dashboard"}` | stats_update, feed_item, event_reminder, block_found |
| `gamification` | `{"action":"subscribe","channel":"gamification"}` | badge_earned, xp_gained, level_up, streak_update |
| `competition` | `{"action":"subscribe","channel":"competition"}` | leaderboard_update, match_update, league_update |

---

## Testing Requirements

### WebSocket Auth Tests (`tests/ws/test_websocket.py`)

```python
class TestWebSocketAuth:
    def test_connect_with_valid_token(self, ws_token):
        """Connect with valid JWT, send ping, receive pong."""
        with client.websocket_connect(f"/ws?token={ws_token}") as ws:
            ws.send_json({"action": "ping"})
            data = ws.receive_json()
            assert data["type"] == "pong"

    def test_connect_with_invalid_token(self):
        """Invalid JWT closes with code 4001."""
        with pytest.raises(Exception):
            with client.websocket_connect("/ws?token=invalid") as ws:
                pass

    def test_connect_without_token(self):
        """Missing token query param closes connection."""
        with pytest.raises(Exception):
            with client.websocket_connect("/ws") as ws:
                pass

    def test_connect_with_expired_token(self, expired_ws_token):
        """Expired JWT closes with code 4001."""
        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws?token={expired_ws_token}") as ws:
                pass
```

### WebSocket Subscription Tests (`tests/ws/test_subscriptions.py`)

```python
class TestWebSocketSubscriptions:
    def test_subscribe_valid_channel(self, ws_token):
        """Subscribe to mining channel, receive subscribed ack."""

    def test_subscribe_invalid_channel(self, ws_token):
        """Subscribe to nonexistent channel, receive error."""

    def test_subscribe_multiple_channels(self, ws_token):
        """Subscribe to mining + dashboard, both confirmed."""

    def test_unsubscribe(self, ws_token):
        """Subscribe then unsubscribe, receive unsubscribed ack."""

    def test_unknown_action(self, ws_token):
        """Send unknown action, receive error."""

    def test_invalid_json(self, ws_token):
        """Send invalid JSON, receive error (not a crash)."""
```

### Connection Manager Unit Tests (`tests/ws/test_manager.py`)

```python
class TestConnectionManager:
    async def test_connect_registers_client(self):
        """connect() adds client to all tracking maps."""

    async def test_disconnect_cleans_up(self):
        """disconnect() removes from connections, channels, user maps."""

    async def test_broadcast_reaches_subscribers_only(self):
        """broadcast_to_channel() only sends to subscribed clients."""

    async def test_send_to_user_targets_correctly(self):
        """send_to_user() only sends to connections of that user on that channel."""

    async def test_dead_connection_cleaned_up(self):
        """If send fails, connection is auto-removed."""

    async def test_stats_accurate(self):
        """get_stats() reflects current state correctly."""
```

### Pub/Sub Bridge Tests (`tests/ws/test_bridge.py`)

```python
class TestPubSubBridge:
    async def test_bridge_forwards_message(self, redis_client):
        """Publish to pubsub:share_submitted, verify broadcast on mining channel."""

    async def test_channel_mapping(self):
        """Each Redis pub/sub channel maps to correct WebSocket channel."""

    async def test_invalid_message_skipped(self, redis_client):
        """Non-JSON pub/sub message is logged and skipped, not crash."""
```

### Dashboard Endpoint Tests (`tests/dashboard/test_dashboard.py`)

```python
async def test_dashboard_stats(authed_client):
    """GET /dashboard/stats returns all expected fields."""
    response = await authed_client.get("/api/v1/dashboard/stats")
    assert response.status_code == 200
    data = response.json()
    assert "hashrate" in data
    assert "shares_today" in data
    assert "workers_online" in data
    assert "streak" in data
    assert "level" in data
    assert "network_height" in data

async def test_dashboard_stats_cached(authed_client):
    """Second call hits Redis cache (same result, faster)."""

async def test_dashboard_stats_unauthorized(client):
    """Returns 401 without auth."""

async def test_global_feed(authed_client, seeded_feed):
    """GET /dashboard/feed returns list of events."""

async def test_global_feed_pagination(authed_client, seeded_feed):
    """Using before_id returns older events."""

async def test_upcoming_events(authed_client, seeded_events):
    """GET /dashboard/events returns active events sorted by ends_at."""

async def test_upcoming_events_user_specific(authed_client, seeded_events):
    """User-specific events appear alongside global events."""

async def test_recent_badges_graceful_fallback(authed_client):
    """Returns empty list if gamification tables do not exist yet."""
```

### Message Delivery Latency Test

```python
async def test_message_delivery_under_100ms(ws_token):
    """Publish via manager, measure time until client receives. Must be < 100ms."""
    with client.websocket_connect(f"/ws?token={ws_token}") as ws:
        ws.send_json({"action": "subscribe", "channel": "mining"})
        ws.receive_json()  # ack

        start = time.monotonic()
        await manager.broadcast_to_channel("mining", {"type": "test", "ts": start})
        data = ws.receive_json()
        elapsed = time.monotonic() - start
        assert elapsed < 0.100, f"Delivery took {elapsed:.3f}s"
```

### Concurrent Connections Load Test

```python
async def test_100_concurrent_connections(ws_tokens):
    """Open 100 WebSocket connections, subscribe all to mining, broadcast one message, verify all 100 receive it."""
```

### Frontend Unit Tests (`dashboard/src/lib/__tests__/ws.test.ts`)

```typescript
describe("WebSocketClient", () => {
  it("should connect with token", () => { /* ... */ });
  it("should auto-reconnect on disconnect", () => { /* ... */ });
  it("should resubscribe after reconnect", () => { /* ... */ });
  it("should route messages to correct channel handlers", () => { /* ... */ });
  it("should unsubscribe and clean up handler", () => { /* ... */ });
  it("should use exponential backoff with jitter", () => { /* ... */ });
  it("should stop reconnecting after max attempts", () => { /* ... */ });
});

describe("ApiClient", () => {
  it("should include auth header when token is set", () => { /* ... */ });
  it("should retry on 401 with token refresh", () => { /* ... */ });
  it("should throw on non-401 errors", () => { /* ... */ });
});
```

### Coverage Targets

| Module | Target |
|---|---|
| `tbg.ws.manager` | 90% |
| `tbg.ws.router` | 85% |
| `tbg.ws.bridge` | 80% |
| `tbg.dashboard.service` | 85% |
| `tbg.dashboard.router` | 80% |
| Frontend `ws.ts` | 80% |
| Frontend `api.ts` | 75% |
| **Phase 3 overall** | **80%+** |

---

## Rules

1. **Read the Phase 3 roadmap first.** `docs/backend-service/roadmap/phase-03-dashboard-realtime.md` contains complete code for every module. Use it as your implementation blueprint.
2. **One WebSocket endpoint.** `/ws?token={jwt}`. No per-channel endpoints. All multiplexing happens via JSON messages.
3. **JWT in query param for WebSocket.** Browsers cannot set custom headers on WS upgrade. Authenticate once at connection time, not per message.
4. **4 valid channels only.** `mining`, `dashboard`, `gamification`, `competition`. Any other channel name returns an error. Do not add more without explicit instruction.
5. **Redis pub/sub, not Redis Streams.** The Phase 2 event consumer already reads streams and publishes to pub/sub. Your bridge subscribes to pub/sub. Do not create a second stream consumer.
6. **10-second cache on dashboard stats.** `redis.setex(cache_key, 10, json.dumps(stats))`. This prevents database stampede when multiple clients poll simultaneously.
7. **Graceful gamification fallback.** Gamification engine is Phase 4. Dashboard stats must work without it. Return default values (level 1, 0 XP, 0 streak) if the gamification service is unavailable.
8. **Match frontend mock data shapes.** Your API responses must match the shape of `dashboard/src/mocks/data.ts`. The frontend components expect specific field names.
9. **Exponential backoff with jitter on WS reconnect.** Base delay: 1s, max delay: 30s, jitter: +0-1000ms random. Max 10 reconnect attempts.
10. **TanStack Query v5.** Not v4. Use `useQuery` with `queryKey` arrays and `queryFn`. Stale times match backend cache TTLs.
11. **Environment variables for URLs.** `VITE_API_URL` and `VITE_WS_URL` in `.env.development`. Never hardcode localhost in component code.
12. **PubSubBridge starts in FastAPI lifespan.** Not in a startup event handler. Use the `@asynccontextmanager` lifespan pattern. Cancel the bridge task on shutdown.

---

## Files to Create/Edit

| Action | File |
|---|---|
| CREATE | `services/api/src/tbg/ws/__init__.py` |
| CREATE | `services/api/src/tbg/ws/manager.py` |
| CREATE | `services/api/src/tbg/ws/router.py` |
| CREATE | `services/api/src/tbg/ws/bridge.py` |
| CREATE | `services/api/src/tbg/dashboard/__init__.py` |
| CREATE | `services/api/src/tbg/dashboard/service.py` |
| CREATE | `services/api/src/tbg/dashboard/router.py` |
| CREATE | `services/api/src/tbg/dashboard/schemas.py` |
| CREATE | `services/api/alembic/versions/004_dashboard_tables.py` |
| CREATE | `services/api/tests/ws/__init__.py` |
| CREATE | `services/api/tests/ws/test_websocket.py` |
| CREATE | `services/api/tests/ws/test_subscriptions.py` |
| CREATE | `services/api/tests/ws/test_manager.py` |
| CREATE | `services/api/tests/ws/test_bridge.py` |
| CREATE | `services/api/tests/dashboard/__init__.py` |
| CREATE | `services/api/tests/dashboard/test_dashboard.py` |
| CREATE | `dashboard/src/lib/api.ts` |
| CREATE | `dashboard/src/lib/ws.ts` |
| CREATE | `dashboard/src/lib/__tests__/ws.test.ts` |
| CREATE | `dashboard/src/lib/__tests__/api.test.ts` |
| CREATE | `dashboard/src/hooks/useApi.ts` |
| CREATE | `dashboard/.env.development` |
| EDIT | `services/api/src/tbg/main.py` |
| EDIT | `services/api/src/tbg/config.py` |
| EDIT | `services/api/src/tbg/db/models.py` |
| EDIT | `services/api/src/tbg/workers/settings.py` |
| EDIT | `services/api/tests/conftest.py` |
| EDIT | `dashboard/src/App.tsx` |
| EDIT | `dashboard/src/stores/authStore.ts` |
| EDIT | `dashboard/package.json` |

---

## Definition of Done

1. **WebSocket connects with valid JWT** and responds to ping with pong. Invalid/missing/expired tokens close with code 4001.
2. **Subscribe/unsubscribe protocol works.** Client subscribes to `mining`, receives `{"type":"subscribed","channel":"mining"}`. Unsubscribe receives `{"type":"unsubscribed","channel":"mining"}`.
3. **Invalid channel returns error.** Subscribing to `nonexistent` returns `{"type":"error","message":"Invalid channel: nonexistent"}`.
4. **Connection manager tracks state correctly.** `get_stats()` returns accurate counts for connections, users, and per-channel subscribers.
5. **Redis pub/sub bridge forwards messages.** Publishing to `pubsub:share_submitted` delivers to all clients subscribed to `mining` channel.
6. **Message delivery latency < 100ms.** From manager.broadcast to client.receive_json, measured in test.
7. **100 concurrent WebSocket connections** can be opened, subscribed, and receive a broadcast without errors.
8. **GET /api/v1/dashboard/stats** returns all expected fields (hashrate, shares_today, workers_online, streak, level, network_height, etc.) matching the frontend mock data shape.
9. **Dashboard stats are cached in Redis for 10 seconds.** Second call within 10s returns identical data without hitting the database.
10. **GET /api/v1/dashboard/feed** returns global activity feed with cursor pagination via `before_id`.
11. **GET /api/v1/dashboard/events** returns upcoming events sorted by `ends_at`, including user-specific events.
12. **GET /api/v1/dashboard/recent-badges** returns empty list gracefully if gamification tables do not exist (Phase 4 not yet built).
13. **Alembic migration 004** creates `activity_feed` and `upcoming_events` tables with indexes.
14. **Frontend `api.ts`** provides typed methods for all auth, mining, dashboard, and user endpoints with automatic 401 retry.
15. **Frontend `ws.ts`** connects with JWT, supports subscribe/unsubscribe, auto-reconnects with exponential backoff + jitter, and routes messages to channel handlers.
16. **Frontend `useApi.ts`** provides TanStack Query v5 hooks for all endpoints with appropriate stale times and refetch intervals.
17. **Activity feed pruner** runs hourly and keeps only the last 10,000 global feed items.
18. **PubSubBridge starts in FastAPI lifespan** and shuts down cleanly.
19. All pytest tests pass with 80%+ coverage on Phase 3 modules.
20. All frontend Vitest tests pass for `ws.ts` and `api.ts`.

---

## Order of Implementation

1. **Alembic migration 004** — Create `activity_feed` and `upcoming_events` tables. Run `alembic upgrade head`. Verify tables and indexes exist.
2. **SQLAlchemy models** — Add `ActivityFeed` and `UpcomingEvent` models to `db/models.py`.
3. **Connection manager** — Implement `ws/manager.py` with all methods. Write unit tests with mock WebSocket objects. This has zero dependencies on other Phase 3 code.
4. **WebSocket router** — Implement `ws/router.py` with JWT auth and message loop. Write auth tests and subscription tests using `TestClient.websocket_connect`.
5. **Redis pub/sub bridge** — Implement `ws/bridge.py`. Write tests with mock Redis pub/sub. Test channel mapping.
6. **Dashboard service** — Implement `dashboard/service.py` with stats aggregation, global feed, upcoming events, recent badges. Write unit tests with mock data.
7. **Dashboard router** — Implement `dashboard/router.py` with 4 endpoints + WS stats. Register under `/api/v1`. Write integration tests.
8. **Lifespan integration** — Update `main.py` to start PubSubBridge in lifespan, register WS router and dashboard router.
9. **Activity feed pruner** — Add pruner and expired events cleaner to arq worker settings.
10. **Frontend API client** — Create `dashboard/src/lib/api.ts`. Install `@tanstack/react-query` in dashboard.
11. **Frontend WebSocket client** — Create `dashboard/src/lib/ws.ts`. Write Vitest tests.
12. **TanStack Query hooks** — Create `dashboard/src/hooks/useApi.ts` with all hooks.
13. **Frontend wiring** — Update `App.tsx` with QueryClientProvider. Update `authStore.ts` to initialize API + WS on login. Create `.env.development`.
14. **Message delivery test** — Write latency test (< 100ms). Write 100-connection load test.
15. **Full stack verification** — `docker compose up --build`. Open frontend, authenticate, verify dashboard shows real API data. Open browser DevTools Network tab, verify WebSocket messages flow. Run full test suite, verify 80%+ coverage.

**Critical: Get step 4 (WebSocket router) working before step 5 (bridge). Step 3 (connection manager) can be done in parallel with step 6 (dashboard service), but step 8 (lifespan integration) depends on steps 4, 5, and 7 all being complete.**
