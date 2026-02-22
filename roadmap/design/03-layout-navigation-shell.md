# Phase 3 — Layout & Navigation Shell [COMPLETED]

## Duration: ~1.5 weeks
## Dependencies: Phase 2 (Core Component Library)
## Status: COMPLETED
## Goal: Build the app shell that frames all content — sidebar, top bar, mobile nav, page transition system

---

## 3.1 App Layout Structure

The authenticated app uses a sidebar + content area layout on desktop and a bottom tab bar on mobile.

```
DESKTOP (>=1024px):
┌─────────┬──────────────────────────────────────────┐
│ SIDEBAR │  TOP BAR                                  │
│ (260px) │──────────────────────────────────────────│
│         │                                           │
│         │  PAGE CONTENT                             │
│         │  (max-width: 1280px, centered)           │
│         │                                           │
│         │                                           │
└─────────┴──────────────────────────────────────────┘

MOBILE (<768px):
┌────────────────────────────────────────────────────┐
│ TOP BAR (simplified)                                │
│────────────────────────────────────────────────────│
│                                                     │
│ PAGE CONTENT (full width, 16px padding)            │
│                                                     │
│────────────────────────────────────────────────────│
│ BOTTOM TAB BAR                                      │
└────────────────────────────────────────────────────┘
```

### Tasks

- [ ] Build `<AppLayout>` wrapper component that handles sidebar/content split
- [ ] Implement responsive behavior: sidebar on desktop, tab bar on mobile
- [ ] Create `<ContentArea>` with max-width constraint and page padding
- [ ] Handle layout transitions between breakpoints smoothly

---

## 3.2 Sidebar Component

### Sections

```
[Logo]  THE BITCOIN GAME

──── PLAY ────
Dashboard          (active = left orange border)
Games              (pulse animation if lottery available)
World Cup          (live dot if match active)
Leagues

──── MINE ────
Workers
Shares
Difficulty
Blocks Found

──── SOCIAL ────
Leaderboard
Cooperative
Education

──── ME ────
Badges             (counter badge if new badges earned)
Profile
Settings

─────────────
Level 7: Solo Miner
[████████░░░░] 2,340/5,000 XP
🔥 12-week streak
─────────────
[🟢 3 workers online]
```

### Behavior

| Behavior | Desktop | Tablet |
|----------|---------|--------|
| Default width | 260px | 72px (collapsed, icon-only) |
| Collapse trigger | Toggle button at top | Always collapsed |
| Collapse animation | Width animates 260px -> 72px, text fades out, icons remain | — |
| Active indicator | Left orange border (3px) on active nav item, slides vertically on route change (spring animation) | Orange dot under icon |
| Hover | Background: `--bg-elevated`, text brightens | Icon brightens |

### Active Route Indicators

| Route Pattern | Active Item | Special Indicator |
|---------------|------------|-------------------|
| `/dashboard` | Dashboard | — |
| `/games/*` | Games | Pulsing dot if weekly lottery is available |
| `/world-cup/*` | World Cup | Live red dot during active match |
| `/leagues/*` | Leagues | — |
| `/mining/workers*` | Workers | — |
| `/mining/shares*` | Shares | — |
| `/mining/difficulty*` | Difficulty | — |
| `/mining/blocks*` | Blocks Found | — |
| `/leaderboard*` | Leaderboard | — |
| `/coop*` | Cooperative | — |
| `/education*`, `/learn*` | Education | — |
| `/profile/badges*` | Badges | Counter if unrevealed badges |
| `/profile*` | Profile | — |
| `/settings*` | Settings | — |

### Bottom Section (User Info)

- XP progress bar: thin horizontal bar with orange fill, animated on XP gain
- Streak indicator: fire emoji + week count
- Worker status: green dot + count of online workers
- This section always visible, even when sidebar is collapsed (collapses to icons only)

### Tasks

- [ ] Build `<Sidebar>` component with all sections and nav items
- [ ] Implement expand/collapse animation (260px <-> 72px)
- [ ] Build active route indicator with spring-animated vertical slide
- [ ] Add special indicators (pulse dot, live dot, counter badge)
- [ ] Build bottom user info section with XP bar and streak
- [ ] Connect to React Router for active route detection
- [ ] Handle collapsed state on tablet breakpoint

---

## 3.3 Top Bar Component

### Desktop Top Bar

```
┌──────────────────────────────────────────────────────────┐
│ "Good morning, [Name]"              [🔔] [🎮 Play Now!] │
│ "Your miner has been hashing for 14 days straight 🔥"   │
└──────────────────────────────────────────────────────────┘
```

- Left: Greeting text (time-of-day aware: morning/afternoon/evening) + contextual subtitle
- Right: Notification bell (with unread count badge) + contextual action button
- Background: transparent, becomes glassmorphism on scroll (when content scrolls behind it)
- Height: 64px
- Sticky: remains at top of content area

### Mobile Top Bar

- Height: 52px
- Center: Page title (or logo on dashboard)
- Left: Hamburger menu (opens slide-over nav) or back button
- Right: Notification bell

### Contextual Subtitles

| Context | Subtitle |
|---------|----------|
| Mining active, streak going | "Your miner has been hashing for {N} days straight" |
| Worker offline | "1 worker offline — check your setup" (orange text) |
| Lottery ready | "This week's results are ready! Play now" |
| World Cup match live | "Match live: Portugal vs Spain" |
| Default | "Decentralizing hashrate, one game at a time" |

### Tasks

- [ ] Build `<TopBar>` with desktop and mobile variants
- [ ] Implement scroll-aware glassmorphism background
- [ ] Build greeting logic (time-of-day) and contextual subtitle system
- [ ] Add notification bell with unread count indicator
- [ ] Add contextual action button slot
- [ ] Make sticky positioning work correctly with sidebar layout

---

## 3.4 Mobile Bottom Tab Bar

### Structure

```
┌─────────────────────────────────────────────┐
│  ⛏️       🎮       🏆       🎖️       👤    │
│ Mine     Games    Cup     Badges   Profile │
└─────────────────────────────────────────────┘
```

### Behavior

| Behavior | Detail |
|----------|--------|
| Active tab | Orange icon + text label visible |
| Inactive tabs | Gray icon, no text |
| Badge indicators | Red dot on Games (if lottery ready), Badges (if new badge) |
| Tab switch | Content crossfades, haptic feedback on mobile |
| Safe area | Respects `env(safe-area-inset-bottom)` for notch devices |
| Hide on scroll | Optional — hide on scroll down, show on scroll up |

### Tab Mapping

| Tab | Routes | Default Route |
|-----|--------|---------------|
| Mine | `/dashboard`, `/mining/*` | `/dashboard` |
| Games | `/games/*` | `/games` |
| Cup | `/world-cup/*`, `/leagues/*` | `/world-cup` |
| Badges | `/profile/badges*`, `/profile/streaks`, `/profile/level` | `/profile/badges` |
| Profile | `/profile`, `/settings/*`, `/coop/*` | `/profile` |

### Tasks

- [ ] Build `<BottomTabBar>` component
- [ ] Implement active tab highlighting with route matching
- [ ] Add badge indicator dots for contextual notifications
- [ ] Handle safe-area insets for iOS notch devices
- [ ] Optional: hide-on-scroll behavior

---

## 3.5 Page Transition System

### Route Change Animation

When navigating between pages:
1. Current content fades out (opacity 1 -> 0, 150ms)
2. New content fades in + slides up (opacity 0 -> 1, translateY 20px -> 0, 300ms, gentle ease)
3. Sidebar active indicator slides vertically to new position (spring animation, 400ms)

### Implementation

Use Framer Motion's `AnimatePresence` with `layout` animations:

```typescript
// Conceptual — exact implementation in code
<AnimatePresence mode="wait">
  <motion.div
    key={location.pathname}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
  >
    <Outlet />
  </motion.div>
</AnimatePresence>
```

### Reduced Motion

When `prefers-reduced-motion: reduce`:
- Replace all transitions with simple instant opacity toggle
- No translateY movement
- No spring animations on sidebar indicator

### Tasks

- [ ] Install and configure Framer Motion
- [ ] Build `<PageTransition>` wrapper with `AnimatePresence`
- [ ] Implement sidebar indicator spring animation on route change
- [ ] Test transitions across all major routes
- [ ] Implement `prefers-reduced-motion` fallback

---

## 3.6 Public Layout (No Auth)

For public routes (`/`, `/about`, `/how-it-works`, `/leaderboard`, etc.):

### Header

```
┌──────────────────────────────────────────────────────────┐
│ [₿ Logo]  How It Works  Leaderboard  World Cup  Education  [Connect Wallet] │
└──────────────────────────────────────────────────────────┘
```

- Sticky, starts transparent, becomes glassmorphism on scroll
- Logo links to `/`
- "Connect Wallet" is a primary orange button
- Mobile: hamburger menu for nav items

### Footer

```
┌──────────────────────────────────────────────────────────┐
│ Links: About, GitHub (mining engine), API Docs, Education │
│ Social: Nostr, X/Twitter, Telegram                        │
│ "Open source mining. Proprietary fun."                    │
│ [₿ TheBitcoinGame]                                        │
└──────────────────────────────────────────────────────────┘
```

### Tasks

- [ ] Build `<PublicLayout>` with sticky header and footer
- [ ] Build `<PublicHeader>` with glassmorphism-on-scroll behavior
- [ ] Build `<PublicFooter>` with links and social
- [ ] Mobile: hamburger menu for header nav items
- [ ] Ensure smooth transition from PublicLayout to AppLayout on login

---

## 3.7 Route Configuration

### File Structure (React Router)

```
routes/
├── _public.tsx            → PublicLayout wrapper
│   ├── index.tsx          → Landing page (/)
│   ├── about.tsx
│   ├── how-it-works.tsx
│   ├── connect.tsx        → Login page
│   ├── leaderboard.tsx    → Public leaderboard
│   ├── blocks.tsx         → Public blocks
│   ├── world-cup/
│   │   ├── index.tsx
│   │   └── $competitionId.tsx
│   ├── stats.tsx
│   ├── miner/$address.tsx
│   ├── education/
│   │   ├── index.tsx
│   │   └── $trackId.tsx
│   └── gift.tsx
│
├── _app.tsx               → AppLayout wrapper (auth required)
│   ├── dashboard.tsx
│   ├── mining/
│   │   ├── workers.tsx
│   │   ├── workers/$workerId.tsx
│   │   ├── shares.tsx
│   │   ├── difficulty.tsx
│   │   ├── blocks.tsx
│   │   └── setup.tsx
│   ├── games/
│   │   ├── index.tsx
│   │   ├── hammer.tsx
│   │   ├── horse-race.tsx
│   │   ├── slots.tsx
│   │   ├── scratch.tsx
│   │   └── lottery-history.tsx
│   ├── world-cup/
│   │   ├── my-team.tsx
│   │   ├── register.tsx
│   │   └── $id/live.tsx
│   ├── leagues/
│   │   ├── index.tsx
│   │   └── $leagueId.tsx
│   ├── profile/
│   │   ├── index.tsx
│   │   ├── badges.tsx
│   │   ├── stats.tsx
│   │   ├── streaks.tsx
│   │   ├── level.tsx
│   │   └── history.tsx
│   ├── coop/
│   │   ├── index.tsx
│   │   ├── create.tsx
│   │   └── $coopId.tsx
│   ├── leaderboard/
│   │   ├── weekly.tsx
│   │   ├── monthly.tsx
│   │   ├── alltime.tsx
│   │   └── country.tsx
│   ├── learn/
│   │   └── $trackId/$lessonId.tsx
│   ├── betting/       (Phase 10)
│   ├── shop/          (Future)
│   └── settings/
│       ├── index.tsx
│       ├── notifications.tsx
│       ├── mining.tsx
│       ├── privacy.tsx
│       └── api-keys.tsx
```

### Tasks

- [ ] Set up React Router with nested routes matching structure above
- [ ] Implement auth guard that redirects to `/connect` when unauthenticated
- [ ] Create placeholder pages for all routes (empty shells with page title)
- [ ] Verify route transitions work with `AnimatePresence`

---

## 3.8 Deliverables Checklist

- [ ] `<AppLayout>` — sidebar + content area responsive layout
- [ ] `<Sidebar>` — full navigation with collapse, active indicators, user info section
- [ ] `<TopBar>` — desktop and mobile, with greeting, notifications, contextual action
- [ ] `<BottomTabBar>` — mobile tab navigation
- [ ] `<PageTransition>` — crossfade + slide up animation wrapper
- [ ] `<PublicLayout>` — header + footer for public pages
- [ ] Route configuration with all routes defined
- [ ] Auth guard middleware
- [ ] Placeholder pages for all routes

---

## Definition of Done

Phase 3 is complete when:
1. A user can navigate to any route in the app and see the correct layout shell
2. Sidebar/tab bar correctly highlights the active route
3. Page transitions animate smoothly between routes
4. Layout is responsive at all breakpoints (320px to 1440px+)
5. Auth guard prevents access to authenticated routes
