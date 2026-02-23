# Prompt: Backend Service — Phase 9 (Frontend Integration)

You are connecting the frontend to the backend for **The Bitcoin Game** — a Bitcoin mining gamification platform. The frontend dashboard is complete (React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + Zustand + React Router v7) with 31 pages, 6 Zustand stores, and comprehensive mock data. The backend API has been built through Phases 0-8: testing infrastructure, authentication, mining data, real-time WebSocket, gamification, games & lottery, competition & leaderboards, social & cooperatives, and education — totaling approximately 63 API endpoints.

Phase 9 introduces **zero new backend code**. This is a pure frontend integration phase: replace every mock data import with real API calls, wire all Zustand stores to their backend counterparts, add TanStack Query for data fetching and caching, and build the WebSocket client for real-time updates.

This is a mono-repo. The project root is the current working directory. The frontend lives in `dashboard/`. The backend lives at `backend/`. You will ONLY modify files in `dashboard/`. All changes are TypeScript/React.

---

## IMPORTANT CONSTRAINTS

1. **Frontend only** — Do NOT modify anything in `backend/`. Phase 9 is 100% frontend work. The backend is already complete.
2. **Do NOT delete mock data** — Mock data files in `dashboard/src/mocks/` must be preserved. Gate them behind `VITE_USE_MOCKS=true` so developers can run the frontend without a backend. When `VITE_USE_MOCKS` is not set or is `false`, real API calls are used.
3. **Zero TypeScript errors** — The frontend currently has 0 TS errors (`tsc -b && vite build`). It must stay that way. Every new file, import, and hook must be fully typed.
4. **TanStack Query v5** — Install `@tanstack/react-query` v5 for all data fetching. Do NOT use raw `fetch()` or `useEffect` for API calls. Every data fetch goes through a `useQuery` or `useMutation` hook.
5. **Axios for HTTP** — Use `axios` as the HTTP client (not `fetch`). The API client (`src/lib/api.ts`) must handle JWT attachment, token refresh, and request queuing during refresh.
6. **Preserve existing UX** — All pages must continue to work exactly as they do now. The user should see real data instead of mock data, but the layout, animations, interactions, and navigation must remain identical.
7. **Do not break the build** — `npm run build` (which runs `tsc -b && vite build`) must pass with 0 errors at every step. Do not commit intermediate states that break the build.
8. **Testing is NON-NEGOTIABLE** — 85%+ Vitest unit test coverage on the 3 infrastructure files (`api.ts`, `ws.ts`, `useApi.ts`). 20 Playwright E2E tests. 0 axe-core accessibility violations.

---

## Before You Start — Read These Files (in order)

1. `docs/backend-service/00-master-plan.md` — Full backend architecture, all API endpoints, WebSocket protocol, authentication flow. This tells you what the backend provides.
2. `docs/backend-service/roadmap/phase-09-frontend-integration.md` — The authoritative Phase 9 specification. Contains the complete `api.ts`, `ws.ts`, `useApi.ts` implementations, the page update matrix, store wiring, and all test cases.
3. `dashboard/src/stores/authStore.ts` — Current auth store. You will extend it with `setTokens()`, `logout()`, `accessToken`, and `refreshToken` fields to integrate with the JWT flow.
4. `dashboard/src/stores/userStore.ts` — Current user store. You will wire it to `GET /api/v1/user/profile` and `PATCH /api/v1/user/profile`.
5. `dashboard/src/stores/settingsStore.ts` — Current settings store (with persist). You will add API sync with optimistic updates.
6. `dashboard/src/stores/notificationStore.ts` — Current notification store. You will wire it to the notification API and WebSocket push events.
7. `dashboard/src/stores/toastStore.ts` — Current toast store. You will wire it to WebSocket `toast` events for real-time mining notifications.
8. `dashboard/src/mocks/data.ts` — Primary mock data file. Understand the data shapes so your API types match.
9. `dashboard/src/routes/router.tsx` — Current routing config. Understand which pages exist and which are lazy-loaded.
10. `docs/thebitcoingame-project-plan.md` — Overall project context for architecture decisions.

Read ALL of these before writing any code. The Phase 9 roadmap contains the exact implementations to follow.

---

## What You Are Building

### Part 1: Install Dependencies

```bash
cd dashboard
npm install @tanstack/react-query @tanstack/react-query-devtools axios
npm install -D @axe-core/playwright
```

Also ensure these are already installed (they should be from earlier phases):
- `react-error-boundary` (for per-section error boundaries)
- `@playwright/test` (for E2E tests)
- `vitest` + `@testing-library/react` (for unit tests)

### Part 2: API Client — `src/lib/api.ts`

Build a centralized Axios client with:

1. **Base URL from environment** — `VITE_API_URL` (default: `http://localhost:8000`)
2. **Request interceptor** — Attaches JWT from `authStore.accessToken` to every request as `Authorization: Bearer <token>`
3. **Response interceptor** — Catches 401 errors, attempts token refresh via `POST /api/v1/auth/refresh`, retries the original request
4. **Request queuing** — During a token refresh, queue all concurrent 401'd requests and replay them once the new token is available. Only ONE refresh request should be in-flight at any time.
5. **Logout on refresh failure** — If the refresh token is invalid or expired, call `authStore.logout()` and redirect to `/connect`
6. **Typed API methods** — Export `api.get<T>()`, `api.post<T>()`, `api.put<T>()`, `api.patch<T>()`, `api.delete<T>()` that unwrap `response.data`

```typescript
// Key implementation detail: the refresh queue
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];
```

The full implementation is in `docs/backend-service/roadmap/phase-09-frontend-integration.md` Section 9.3.1.

### Part 3: WebSocket Client — `src/lib/ws.ts`

Build a singleton WebSocket client class with:

1. **JWT authentication** — Connect with `?token=<jwt>` query parameter
2. **Auto-reconnect** — Reconnect on disconnect with exponential backoff (1s → 2s → 4s → 8s → ... → 30s cap)
3. **Heartbeat** — Send `ping` every 30 seconds to keep the connection alive
4. **Event dispatch** — Route incoming messages by `type` field to registered handlers
5. **Built-in store routing** — `notification` events → `notificationStore`, `toast` events → `toastStore`, `pong` → heartbeat ack
6. **Manual disconnect** — `disconnect()` method that closes cleanly without triggering reconnect
7. **Connection state** — Expose `isConnected` boolean

Export as singleton: `export const wsClient = new WebSocketClient()`

The full implementation is in the Phase 9 roadmap Section 9.3.2.

### Part 4: TanStack Query Setup

Configure TanStack Query in the app root:

1. Create `src/lib/queryClient.ts` with a `QueryClient` configured with sensible defaults:
   - `staleTime: 30_000` (30 seconds default)
   - `retry: 3` with exponential backoff
   - `refetchOnWindowFocus: true`
2. Wrap the app in `<QueryClientProvider>` in `src/main.tsx` or `src/App.tsx`
3. Add `<ReactQueryDevtools>` in development mode only

### Part 5: TanStack Query Hooks — `src/hooks/useApi.ts`

Build a comprehensive hooks file organized by domain:

**Query Key Factory:**
```typescript
export const queryKeys = {
  miningStats: ["mining", "stats"] as const,
  workers: ["mining", "workers"] as const,
  shares: (page: number) => ["mining", "shares", page] as const,
  difficulty: ["mining", "difficulty"] as const,
  blocks: ["mining", "blocks"] as const,
  hashrate: ["mining", "hashrate"] as const,
  weeklyGameData: ["games", "weekly-data"] as const,
  gameHistory: ["games", "history"] as const,
  lotteryCurrentKey: ["lottery", "current"] as const,
  userXP: ["gamification", "xp"] as const,
  badges: ["gamification", "badges"] as const,
  streaks: ["gamification", "streaks"] as const,
  level: ["gamification", "level"] as const,
  leaderboard: (period: string) => ["leaderboard", period] as const,
  myRankings: ["leaderboard", "me"] as const,
  competitions: ["competitions"] as const,
  leagues: ["leagues"] as const,
  myCoop: ["coop", "mine"] as const,
  notifications: ["notifications"] as const,
  unreadCount: ["notifications", "unread-count"] as const,
  tracks: ["education", "tracks"] as const,
  track: (id: string) => ["education", "tracks", id] as const,
  lesson: (trackId: string, lessonId: string) =>
    ["education", "tracks", trackId, "lessons", lessonId] as const,
  progress: ["education", "progress"] as const,
  recommendations: ["education", "recommendations"] as const,
  profile: ["user", "profile"] as const,
  settings: ["user", "settings"] as const,
};
```

**Hooks by domain:**

| Domain        | Hooks                                                            | Stale Time  |
|---------------|------------------------------------------------------------------|-------------|
| Mining        | `useMiningStats`, `useWorkers`, `useHashrateHistory`, `useShares`, `useDifficulty`, `useBlocks` | 30s-60s |
| Games         | `useWeeklyGameData`, `usePlayGame` (mutation), `useLotteryCurrent` | 5m |
| Gamification  | `useUserXP`, `useBadges`, `useStreaks`                           | 60s-5m      |
| Competition   | `useLeaderboard(period)`, `useMyRankings`, `useCompetitions`, `useLeagues` | 5m |
| Social        | `useMyCoop`, `useJoinCoop` (mutation), `useNotifications`, `useUnreadCount` | 30s-60s |
| Education     | `useTracks`, `useLesson`, `useCompleteLesson` (mutation), `useProgress`, `useRecommendations` | 10m |
| User          | `useProfile`, `useSettings`, `useUpdateSettings` (mutation with optimistic update) | 5m |

**Optimistic Updates for Settings:**
```typescript
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: object) => api.patch("/api/v1/user/settings", data),
    onMutate: async (newSettings) => {
      await qc.cancelQueries({ queryKey: queryKeys.settings });
      const previous = qc.getQueryData(queryKeys.settings);
      qc.setQueryData(queryKeys.settings, (old: object) => ({
        ...old,
        ...newSettings,
      }));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      qc.setQueryData(queryKeys.settings, context?.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}
```

### Part 6: Mock Data Gating

Create `src/lib/mockGate.ts`:

```typescript
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

export async function getMockOrApi<T>(
  mockImport: () => Promise<{ default: T }>,
  apiCall: () => Promise<T>,
): Promise<T> {
  if (USE_MOCKS) {
    const mod = await mockImport();
    return mod.default;
  }
  return apiCall();
}
```

### Part 7: Zustand Store Wiring

Update each store to sync with the backend:

| Store              | Changes Required                                                     |
|--------------------|----------------------------------------------------------------------|
| `authStore`        | Add `accessToken`, `refreshToken`, `setTokens()`, wire `login()` to `POST /api/v1/auth/connect`, wire `logout()` to clear tokens + redirect |
| `userStore`        | Wire profile data to `GET /api/v1/user/profile`, add `updateProfile()` calling `PATCH /api/v1/user/profile` |
| `settingsStore`    | Add API sync — on load: fetch from API; on change: optimistic update via `useUpdateSettings` |
| `notificationStore`| Wire to `GET /api/v1/notifications`, add WebSocket listener for real-time push, add `markRead()` → `PATCH /api/v1/notifications/{id}/read` |
| `toastStore`       | Add WebSocket `toast` event handler to create toasts from backend events |
| `sidebarStore`     | **No changes** — remains local-only UI state                         |

### Part 8: Page Updates (31 Pages)

Every data-dependent page must be updated. The complete update matrix:

| # | Page                    | File Path                                   | Hooks Used                                            |
|---|------------------------|---------------------------------------------|-------------------------------------------------------|
| 1 | Dashboard              | `src/pages/Dashboard.tsx`                   | `useMiningStats`, `useHashrateHistory`, `useUserXP`   |
| 2 | Workers                | `src/pages/mining/WorkersPage.tsx`          | `useWorkers`                                          |
| 3 | Shares                 | `src/pages/mining/SharesPage.tsx`           | `useShares` (paginated)                               |
| 4 | Difficulty             | `src/pages/mining/DifficultyPage.tsx`       | `useDifficulty`                                       |
| 5 | Blocks                 | `src/pages/mining/BlocksPage.tsx`           | `useBlocks`                                           |
| 6 | GameHub                | `src/pages/games/GameHub.tsx`               | `useWeeklyGameData`, `useLotteryCurrent`              |
| 7 | HammerGame             | `src/pages/games/HammerGame.tsx`            | `useWeeklyGameData`, `usePlayGame`                    |
| 8 | HorseRace              | `src/pages/games/HorseRace.tsx`             | `useWeeklyGameData`, `usePlayGame`                    |
| 9 | SlotMachine            | `src/pages/games/SlotMachine.tsx`           | `useWeeklyGameData`, `usePlayGame`                    |
| 10| ScratchCard            | `src/pages/games/ScratchCard.tsx`           | `useWeeklyGameData`, `usePlayGame`                    |
| 11| BadgesPage             | `src/pages/profile/BadgesPage.tsx`          | `useBadges`                                           |
| 12| StreaksPage             | `src/pages/profile/StreaksPage.tsx`         | `useStreaks`                                          |
| 13| LevelPage              | `src/pages/profile/LevelPage.tsx`           | `useUserXP`                                           |
| 14| ProfilePage            | `src/pages/profile/ProfilePage.tsx`         | `useProfile`, `useMiningStats`                        |
| 15| LeaderboardPage        | `src/pages/leaderboard/LeaderboardPage.tsx` | `useLeaderboard` (4 tabs), `useMyRankings`            |
| 16| WorldCupPage           | `src/pages/worldcup/WorldCupPage.tsx`       | `useCompetitions`                                     |
| 17| MatchDetailPage        | `src/pages/worldcup/MatchDetailPage.tsx`    | Competition detail hook                               |
| 18| RegisterPage           | `src/pages/worldcup/RegisterPage.tsx`       | Registration mutation                                 |
| 19| MyTeamPage             | `src/pages/worldcup/MyTeamPage.tsx`         | Team data hook                                        |
| 20| LeaguesPage            | `src/pages/leagues/LeaguesPage.tsx`         | `useLeagues`                                          |
| 21| CoopDashboard          | `src/pages/coop/CoopDashboard.tsx`          | `useMyCoop`                                           |
| 22| CreateCoopPage         | `src/pages/coop/CreateCoopPage.tsx`         | Create coop mutation                                  |
| 23| JoinCoopPage           | `src/pages/coop/JoinCoopPage.tsx`           | `useJoinCoop`                                         |
| 24| EducationLanding       | `src/pages/education/EducationLanding.tsx`  | `useTracks`                                           |
| 25| LearnHub               | `src/pages/education/LearnHub.tsx`          | Track detail hook, `useProgress`                      |
| 26| LessonPage             | `src/pages/education/LessonPage.tsx`        | `useLesson`, `useCompleteLesson`                      |
| 27| SettingsPage           | `src/pages/settings/SettingsPage.tsx`       | `useSettings`, `useUpdateSettings`                    |
| 28| ConnectPage            | `src/pages/ConnectPage.tsx`                 | Auth connect mutation                                 |
| 29| PublicLeaderboardPage  | `src/pages/public/PublicLeaderboardPage.tsx`| `useLeaderboard`                                      |
| 30| PublicMinerPage        | `src/pages/public/PublicMinerPage.tsx`      | Public profile hook                                   |
| 31| GiftPage               | `src/pages/GiftPage.tsx`                    | Public profile hook                                   |

**For each page:**
1. Import the relevant `useQuery` / `useMutation` hook from `useApi.ts`
2. Replace mock data imports with the hook call
3. Add loading states using `Skeleton` components (already available in `src/components/ui/Skeleton.tsx`)
4. Add error states using `ErrorBoundary` (per-section for Dashboard, whole-page for simpler pages)
5. Gate mock imports behind `USE_MOCKS`

### Part 9: Error Boundaries

Add per-section error boundaries to pages with multiple data sources (especially Dashboard):

```typescript
import { ErrorBoundary } from "react-error-boundary";

function SectionErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
      <p className="text-sm text-red-400">Failed to load this section.</p>
      <button
        onClick={resetErrorBoundary}
        className="mt-2 text-xs text-red-300 underline"
      >
        Retry
      </button>
    </div>
  );
}
```

### Part 10: Environment Configuration

Create/update `dashboard/.env.development`:

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
VITE_USE_MOCKS=false
```

Create `dashboard/.env.development.mocks`:

```env
VITE_USE_MOCKS=true
```

---

## Testing Requirements

**Testing is NON-NEGOTIABLE.** All tests must pass before Phase 9 is complete.

### Vitest Unit Tests — `tests/unit/`

| # | Test Case                                         | File                   | Assertions                                              |
|---|--------------------------------------------------|------------------------|---------------------------------------------------------|
| 1 | API client — attaches JWT header                  | `test_api.ts`          | `Authorization: Bearer <token>` present on requests     |
| 2 | API client — 401 triggers refresh                 | `test_api.ts`          | `/api/v1/auth/refresh` called, original request retried |
| 3 | API client — refresh failure triggers logout      | `test_api.ts`          | `authStore.logout()` called                             |
| 4 | API client — concurrent 401s deduplicated         | `test_api.ts`          | Only ONE refresh request sent for multiple 401s         |
| 5 | WS client — connect with token                    | `test_ws.ts`           | WebSocket opened with `?token=` query parameter         |
| 6 | WS client — auto-reconnect on close               | `test_ws.ts`           | Reconnects after backoff delay                          |
| 7 | WS client — exponential backoff                   | `test_ws.ts`           | 1s → 2s → 4s → 8s → ... → 30s cap                     |
| 8 | WS client — heartbeat ping                        | `test_ws.ts`           | Ping sent every 30s                                     |
| 9 | WS client — notification routing                  | `test_ws.ts`           | `notification` events route to `notificationStore`      |
| 10| Query keys — uniqueness                           | `test_hooks.ts`        | No duplicate keys across all domains                    |
| 11| Mock gating — `VITE_USE_MOCKS=true`               | `test_mocks.ts`        | Mock data returned, no API call made                    |
| 12| Mock gating — `VITE_USE_MOCKS=false`              | `test_mocks.ts`        | API called, mock data not imported                      |
| 13| Optimistic update — settings (success)            | `test_hooks.ts`        | Cache updated immediately before API response           |
| 14| Optimistic update — settings (error rollback)     | `test_hooks.ts`        | Cache reverted to previous value on API error           |
| 15| Error boundary — renders fallback                  | `test_errors.ts`       | Error boundary catches, shows retry button              |

### Playwright E2E Tests — `tests/e2e/`

| # | Test Case                                  | Flow                                                              |
|---|--------------------------------------------|-------------------------------------------------------------------|
| 1 | Auth flow — connect wallet                 | `/connect` → sign → dashboard (JWT in store)                      |
| 2 | Auth flow — token refresh                  | Force expire → API call → silent refresh → call succeeds          |
| 3 | Auth flow — logout                         | Logout → redirect to `/connect` → guarded routes blocked          |
| 4 | Dashboard — loads real data                | `/dashboard` → all 5 sections render (not skeletons)              |
| 5 | Mining — workers page                      | `/mining/workers` → table renders with rows                       |
| 6 | Mining — shares page (paginated)           | `/mining/shares` → paginate → next page loads                     |
| 7 | Games — hammer game                        | `/games/hammer` → weekly data renders → play → session recorded   |
| 8 | Games — slot machine                       | `/games/slots` → reels render from hash data                      |
| 9 | Gamification — badges page                 | `/badges` → badges grid renders                                   |
| 10| Gamification — level page                  | `/profile/level` → XP bar renders with real data                  |
| 11| Leaderboard — 4 tabs                       | `/leaderboard` → switch weekly/monthly/alltime/country            |
| 12| World Cup — groups and bracket             | `/world-cup` → group tables + bracket render                      |
| 13| Leagues — table with zones                 | `/leagues` → table with promotion/relegation zones                |
| 14| Coop — create flow                         | `/coop/create` → submit → invite code shown                       |
| 15| Coop — join flow                           | `/coop/join` → enter code → dashboard shows coop                  |
| 16| Education — lesson completion              | `/education/1/1-1` → read → complete → XP toast                   |
| 17| Settings — update + optimistic             | `/settings` → toggle → immediate UI update                        |
| 18| Notifications — real-time push             | Trigger event → toast appears → notification in panel             |
| 19| Public profile — privacy enforcement       | Disable public → visit `/public/miners/{id}` → 404               |
| 20| Mobile responsive — bottom tab bar         | Viewport 390px → bottom tab bar renders, sidebar hidden           |

### Accessibility Tests — `tests/a11y/`

Run axe-core on 13 major pages. **Target: 0 violations.**

```typescript
const pages = [
  "/dashboard", "/mining/workers", "/mining/shares",
  "/games", "/games/hammer", "/badges",
  "/leaderboard", "/world-cup", "/leagues",
  "/coop", "/education", "/settings", "/profile",
];

for (const page of pages) {
  test(`a11y: ${page} has no violations`, async ({ page: pw }) => {
    await pw.goto(page);
    const results = await new AxeBuilder({ page: pw }).analyze();
    expect(results.violations).toEqual([]);
  });
}
```

### Coverage Targets

```bash
# Vitest unit tests
cd dashboard && npx vitest run --coverage --coverage.thresholds.lines=85

# Playwright E2E
cd dashboard && npx playwright test

# Type check
cd dashboard && npx tsc --noEmit

# Accessibility
cd dashboard && npx playwright test tests/a11y/
```

**Minimum: 85% unit test coverage on `api.ts`, `ws.ts`, `useApi.ts`. All 20 E2E tests passing. 0 axe-core violations.**

---

## Rules

1. **Read the Phase 9 roadmap first.** `docs/backend-service/roadmap/phase-09-frontend-integration.md` contains the exact implementations. Follow them closely.
2. **Do NOT delete mock data.** Every file in `src/mocks/` stays. Gate with `VITE_USE_MOCKS`. The mock data is the fallback for frontend-only development.
3. **TanStack Query for EVERYTHING.** No `useEffect` + `fetch` patterns. No `useState` for server state. All data fetching goes through `useQuery`/`useMutation`.
4. **One refresh at a time.** The token refresh mechanism must deduplicate concurrent 401 responses. Only one `POST /api/v1/auth/refresh` request should be in-flight at any time. Queued requests wait and replay with the new token.
5. **Skeletons, not spinners.** Use the existing `Skeleton` component from `src/components/ui/Skeleton.tsx` for loading states. Match the layout shape of the real content.
6. **Error boundaries per section.** On pages with multiple data sources (Dashboard especially), wrap each section in its own `ErrorBoundary`. One failing API should not crash the entire page.
7. **Preserve all existing behavior.** Animations, transitions, sound effects, accessibility features — everything from Phases 1-11 must continue working unchanged.
8. **TypeScript strict mode.** Use `type` keyword for type-only imports. Use `ReturnType<typeof setTimeout>` not `NodeJS.Timeout`. The existing codebase has `verbatimModuleSyntax` enabled.
9. **Follow existing patterns.** Check how stores, hooks, and utilities are structured in the existing codebase before creating new patterns. Use `cn()` for class merging, import from `@/*` paths, follow the animation system from `src/lib/animation.ts`.
10. **Bundle size budget.** Current bundle: ~397KB gzipped. TanStack Query adds ~12KB. Axios adds ~13KB. New total must stay under 450KB. Verify with `npm run build`.
11. **WebSocket reconnect sanity.** Exponential backoff with jitter. Cap at 30 seconds. Do NOT reconnect if the user manually disconnected. Do NOT reconnect on auth code `4001` (deliberately kicked).
12. **Test against both modes.** Verify the app works with `VITE_USE_MOCKS=true` (mock mode) AND `VITE_USE_MOCKS=false` (real API mode). Both must produce a working app.

---

## Files to Create/Edit

| Action | File                                                           |
|--------|----------------------------------------------------------------|
| CREATE | `dashboard/src/lib/api.ts`                                     |
| CREATE | `dashboard/src/lib/ws.ts`                                      |
| CREATE | `dashboard/src/lib/queryClient.ts`                             |
| CREATE | `dashboard/src/lib/mockGate.ts`                                |
| CREATE | `dashboard/src/hooks/useApi.ts`                                |
| CREATE | `dashboard/src/types/api.ts` (response type definitions)       |
| CREATE | `dashboard/.env.development`                                   |
| CREATE | `dashboard/.env.development.mocks`                             |
| CREATE | `dashboard/tests/unit/test_api.ts`                             |
| CREATE | `dashboard/tests/unit/test_ws.ts`                              |
| CREATE | `dashboard/tests/unit/test_hooks.ts`                           |
| CREATE | `dashboard/tests/unit/test_mocks.ts`                           |
| CREATE | `dashboard/tests/unit/test_errors.ts`                          |
| CREATE | `dashboard/tests/e2e/auth.spec.ts`                             |
| CREATE | `dashboard/tests/e2e/dashboard.spec.ts`                        |
| CREATE | `dashboard/tests/e2e/mining.spec.ts`                           |
| CREATE | `dashboard/tests/e2e/games.spec.ts`                            |
| CREATE | `dashboard/tests/e2e/gamification.spec.ts`                     |
| CREATE | `dashboard/tests/e2e/competition.spec.ts`                      |
| CREATE | `dashboard/tests/e2e/social.spec.ts`                           |
| CREATE | `dashboard/tests/e2e/education.spec.ts`                        |
| CREATE | `dashboard/tests/e2e/settings.spec.ts`                         |
| CREATE | `dashboard/tests/e2e/mobile.spec.ts`                           |
| CREATE | `dashboard/tests/a11y/pages.spec.ts`                           |
| EDIT   | `dashboard/src/main.tsx` — Add `QueryClientProvider` wrapper   |
| EDIT   | `dashboard/src/stores/authStore.ts` — Add JWT fields + methods |
| EDIT   | `dashboard/src/stores/userStore.ts` — Wire to profile API      |
| EDIT   | `dashboard/src/stores/settingsStore.ts` — Add API sync         |
| EDIT   | `dashboard/src/stores/notificationStore.ts` — Wire to API + WS |
| EDIT   | `dashboard/src/stores/toastStore.ts` — Add WS event handler    |
| EDIT   | `dashboard/src/pages/Dashboard.tsx` — Replace mock data         |
| EDIT   | `dashboard/src/pages/mining/WorkersPage.tsx` — Replace mock data|
| EDIT   | `dashboard/src/pages/mining/SharesPage.tsx` — Replace mock data |
| EDIT   | `dashboard/src/pages/mining/DifficultyPage.tsx` — Replace mock  |
| EDIT   | `dashboard/src/pages/mining/BlocksPage.tsx` — Replace mock data |
| EDIT   | All remaining 26 page files — Replace mock data with hooks     |
| EDIT   | `dashboard/package.json` — Add new dependencies                |
| EDIT   | `dashboard/vite.config.ts` — Add env variable types if needed  |

---

## Definition of Done

1. `npm install` succeeds with TanStack Query v5, Axios, and dev dependencies installed.
2. `VITE_USE_MOCKS=true npm run dev` starts the app with mock data — all pages render correctly.
3. `VITE_USE_MOCKS=false npm run dev` starts the app connected to the backend API — all pages render with real data.
4. `src/lib/api.ts` attaches JWT headers, handles 401 → refresh → retry, and queues concurrent refresh attempts.
5. `src/lib/ws.ts` connects with JWT, auto-reconnects with exponential backoff (1s → 30s cap), sends heartbeat pings every 30s.
6. `src/hooks/useApi.ts` exports hooks for all ~63 backend endpoints with proper query keys, stale times, and cache invalidation.
7. `authStore` wired to `POST /api/v1/auth/connect` and `POST /api/v1/auth/refresh` with token storage.
8. `userStore` wired to `GET /api/v1/user/profile` and `PATCH /api/v1/user/profile`.
9. `settingsStore` syncs with backend API using optimistic updates (immediate UI, rollback on error).
10. `notificationStore` wired to both `GET /api/v1/notifications` and WebSocket push.
11. `toastStore` receives real-time toast events from WebSocket (mining, rewards, etc.).
12. All 31 pages use TanStack Query hooks instead of direct mock imports.
13. Loading states use `Skeleton` components matching the content layout.
14. Error boundaries prevent single-section failures from crashing pages.
15. `npm run build` passes with 0 TypeScript errors.
16. Bundle size under 450KB gzipped.
17. All 15 Vitest unit tests pass with 85%+ coverage on `api.ts`, `ws.ts`, `useApi.ts`.
18. All 20 Playwright E2E tests pass.
19. 0 axe-core violations on all 13 tested pages.
20. Mock data files in `src/mocks/` are preserved and functional when `VITE_USE_MOCKS=true`.

---

## Order of Implementation

Do these in order — each step builds on the previous:

1. **Install dependencies** — Add TanStack Query, Axios, test utilities. Verify `npm run build` still passes.
2. **Create `api.ts`** — Build the Axios client with JWT interceptor and refresh logic. Write unit tests 1-4.
3. **Create `ws.ts`** — Build the WebSocket client. Write unit tests 5-9.
4. **Create `queryClient.ts` + wrap app** — Configure TanStack Query provider. Add devtools.
5. **Create `mockGate.ts`** — Implement the mock/API gating logic. Write unit tests 11-12.
6. **Create `useApi.ts`** — Build all query/mutation hooks. Write unit tests 10, 13-14.
7. **Wire Zustand stores** — Update authStore, userStore, settingsStore, notificationStore, toastStore.
8. **Update core pages (Mining + Dashboard)** — Wire Dashboard (5 sections), Workers, Shares, Difficulty, Blocks. Add error boundaries and skeletons.
9. **Update game pages** — Wire GameHub, Hammer, Horse Race, Slots, Scratch Card with `useWeeklyGameData` and `usePlayGame`.
10. **Update gamification + competition pages** — Wire Badges, Streaks, Level, Profile, Leaderboard, WorldCup, Leagues.
11. **Update social + education + settings pages** — Wire Coop, Education, Settings, ConnectPage, public pages.
12. **Write E2E tests** — All 20 Playwright test cases. Write accessibility tests.
13. **Final verification** — `npm run build` (0 errors), bundle size check, coverage report, both mock and real modes tested.

**Critical: Get steps 2-6 working before step 8.** The infrastructure layer (api.ts, ws.ts, hooks) must be solid before wiring any pages. Test it in isolation first.
