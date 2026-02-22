# Phase 11 — Secondary Pages: How It Works, Public Leaderboard, Profile, Settings, Notifications

## Duration: ~2 weeks
## Dependencies: Phase 4 (Dashboard), Phase 6 (Gamification), Phase 7 (Competition)
## Goal: Build the remaining pages that complete the full user experience — public explainer, profile hub, settings system, and notification center

---

## 11.1 How It Works — `/how-it-works` (Public)

**Animated explainer page that converts visitors into users. This is the "sell" page — visual, simple, zero jargon.**

### Section 1: Hero

```
"How Does Bitcoin Mining Become a Game?"
"In 60 seconds, you'll understand everything."

[Scroll to begin ↓]
```

Background: same particle field as landing page (subtle, dark).

### Section 2: The Mining Basics (Scroll-triggered)

```
STEP 1: "Your Miner Searches for a Needle in a Haystack"

[LEFT: Animated visualization]
  A tiny Bitaxe icon generating thousands of tiny dots (hashes)
  flying toward a massive wall of numbers. Most bounce off.
  Occasionally one glows brighter (high difficulty share).

[RIGHT: Text]
  "Your miner generates millions of random numbers every second,
   trying to find one that matches Bitcoin's target. It's like
   rolling dice — but with a trillion sides."
```

```
STEP 2: "Every Attempt is Tracked"

[LEFT: Text]
  "Each attempt has a 'difficulty score.' The higher the number,
   the closer you got to finding a block. We track your best
   score every week."

[RIGHT: Animated visualization]
  A difficulty meter filling up, with numbers counting.
  Mini version of the dashboard difficulty meter.
```

```
STEP 3: "Sunday Night = Lottery Night"

[LEFT: Animated visualization]
  Quick preview montage of all 4 games:
  Hammer swinging, horses racing, slots spinning, card scratching
  (Looping 3-second clips or CSS animations)

[RIGHT: Text]
  "Every Sunday, your best score becomes a lottery ticket.
   Choose your game and watch the results unfold.
   The higher your score, the bigger the show."
```

```
STEP 4: "Compete with the World"

[LEFT: Text]
  "Join the Solo Mining World Cup. Your country vs the world.
   Climb the leaderboards. Earn badges. Build streaks.
   Mining has never been this fun."

[RIGHT: Animated visualization]
  Mini globe with dots lighting up.
  Leaderboard rows sliding in.
  Badge cards flipping to unlocked state.
```

### Section 3: The Block Dream

```
"And If You Actually Find a Block..."

[CENTER: Full-width]
  Simplified block-found animation:
  Gold flash → Bitcoin symbol → "3.125 BTC" drops in → "~$312,500"

  "It's rare. It's random. But someone has to win.
   47 of our miners already have."

[Connect Your Miner →]  ← Orange CTA
```

### Section 4: How to Start

```
"Three Steps. Five Minutes."

┌──────────┐  ┌──────────┐  ┌──────────┐
│  Step 1   │  │  Step 2   │  │  Step 3   │
│           │  │           │  │           │
│  Get a    │  │  Point it │  │  Start    │
│  Miner    │  │  at us    │  │  Playing  │
│           │  │           │  │           │
│  Bitaxe,  │  │  Configure│  │  Watch    │
│  Antminer │  │  stratum  │  │  your     │
│  or any   │  │  URL to   │  │  dashboard│
│  SHA-256  │  │  our pool │  │  light up │
│           │  │           │  │           │
│ [Shop →]  │  │ [Guide →] │  │ [Login →] │
└──────────┘  └──────────┘  └──────────┘
```

### Animation Approach

- All sections use scroll-triggered animations (Framer Motion `useInView` or Intersection Observer)
- Elements fade in + slide up as user scrolls to them
- Visualizations play when section enters viewport
- Parallax on background elements
- Total page: smooth single-page scroll, 4-5 viewport sections

### Tasks

- [ ] Build `/how-it-works` public page with scroll-triggered sections
- [ ] Build Step 1 hash visualization (animated dots hitting a wall — CSS or Canvas)
- [ ] Build Step 2 mini difficulty meter animation
- [ ] Build Step 3 game preview montage (CSS animations or looping clips)
- [ ] Build Step 4 mini globe/leaderboard/badge animation
- [ ] Build block dream section with simplified celebration animation
- [ ] Build "How to Start" 3-step cards
- [ ] Mobile: single column, simplified animations, no parallax
- [ ] Reduced motion: static illustrations with text, no scroll triggers

---

## 11.2 Public Leaderboard — `/leaderboard` (Public)

**Limited view of the leaderboard for non-authenticated users. Drives signups.**

### Layout

Same as the authenticated leaderboard from Phase 7 but with restrictions:

| Feature | Authenticated | Public |
|---------|--------------|--------|
| Tab system (weekly/monthly/alltime/country) | Full | Weekly only |
| Miner details on row click | Full profile | "Sign in to see details" |
| Full difficulty values | Visible | Truncated (e.g., "4.2B" not "4,231,847,293") |
| Your position sticky card | Shown | [Connect Wallet to See Your Rank] CTA |
| Row count | Full list | Top 25 only + "Sign in to see all" |
| Country leaderboard | Full with globe | Table only, top 10 |

### Upsell Banner

```
┌────────────────────────────────────────────────────────────┐
│  "Where do you rank?"                                        │
│  "Connect your miner and see your position on the board."   │
│                                                              │
│  [Connect Your Miner →]   (orange CTA)                      │
└────────────────────────────────────────────────────────────┘
```

Positioned: above the leaderboard table (sticky on scroll) or at row 26 where the list cuts off.

### Tasks

- [ ] Build public `/leaderboard` page reusing leaderboard components from Phase 7
- [ ] Limit to weekly view, top 25 rows
- [ ] Replace "My Position" card with signup CTA
- [ ] Truncate difficulty values for public view
- [ ] Disable row click expansion (show "sign in" tooltip instead)
- [ ] Add upsell banner driving to `/connect`
- [ ] Mobile: same simplified 3-column table as authenticated version

---

## 11.3 Profile Page — `/profile`

**The user's home page. Hub for identity, stats, badges, activity, and settings.**

### Profile Header (Hero Section)

```
┌────────────────────────────────────────────────────────────┐
│  Background: Subtle animated mesh gradient (personal color  │
│  derived from BTC address hash — unique per user)           │
│                                                              │
│  [Avatar circle]                                             │
│    Generated from BTC address (Blockies/Jazzicon style)     │
│    Circular mask with border colored by highest rarity       │
│    badge earned (gray=none, cyan=rare, purple=epic, gold=   │
│    legendary)                                                │
│                                                              │
│  "SatoshiHunter" [Edit icon — pencil, opens inline edit]   │
│  bc1q...abcd  [Copy icon]                                   │
│  🇵🇹 Portugal                                                │
│                                                              │
│  Level 7: Solo Miner                                        │
│  [XP Bar ████████████░░░░░░░░] 2,340 / 5,000 XP           │
│                                                              │
│  Quick stats row (4 inline stats):                          │
│  ⛏️ 892K shares  💎 7.1B best  🔥 12wk streak  🎖️ 23 badges │
└────────────────────────────────────────────────────────────┘
```

**Avatar generation:** Use `@davatar/react`, `jazzicon`, or a simple deterministic color block based on address. No need for upload system at MVP.

**Inline name edit:** Click pencil icon → name becomes an editable input → Enter to save, Escape to cancel.

### Tab Bar

```
[ Overview | Badges | Stats | Activity | Settings ]
```

- Badges tab → navigates to `/profile/badges` (already built in Phase 6)
- Settings tab → navigates to `/settings` (built in this phase)
- Overview, Stats, Activity → rendered inline on this page via sub-routes

### Overview Tab (default)

**Featured Badges:**
- Horizontal scroll of 3-5 most impressive badges (highest rarity first)
- Uses existing `<BadgeCard>` in compact mode
- [View All] link → `/profile/badges`

**Mining Summary:**
Two stat cards side by side:
- Hashrate (24h average): monospace number + sparkline
- Total Shares (all time): monospace number + monthly bar chart

**Streak Calendar:**
- Reuse `<UptimeCalendar>` from workers page but for mining activity
- 52 weeks of cells, orange intensity = share count per day
- Hover: date + share count + best diff that day

**Competition History:**
- List of World Cups / leagues participated in
- Each: competition name, date, result, country/team
- Empty state: "No competitions yet. Register for the next World Cup!"

**Cooperative:**
- Card showing coop name, role, member count, combined hashrate
- [View Cooperative] link → `/coop`
- Empty state: "Not in a cooperative. Create or join one!"

### Stats Tab — `/profile/stats`

Deep dive into personal statistics:

```
ALL-TIME STATS
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Total Shares│ │ Best Diff   │ │ Total Uptime│ │ Blocks Found│
│ 892,104     │ │ 7.1B        │ │ 347 days    │ │ 0           │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

MINING HISTORY CHART
[Area chart: shares per week over last 52 weeks]

DIFFICULTY PROGRESSION
[Line chart: weekly best difficulty over time, log scale]

WORKER STATISTICS
| Worker | Total Shares | Best Diff | Avg Hashrate | First Seen |
(Summary table of all workers, all time)

BADGE PROGRESS
"23 / 47 badges earned — 49% complete"
[Progress bar]
Next achievable badges: [badge] [badge] [badge]
```

### Activity Tab — `/profile/history`

Timeline of all user activity:

```
TODAY
  14:23  💎 New personal best: 4.2B
  14:23  ⛏️  Share submitted (diff: 4,231,847,293)
  12:01  🟢 bitaxe-living-room connected

YESTERDAY
  22:15  🎖️ Badge earned: "Megahash" (+100 XP)
  18:30  ⬆️  Level up: Level 7 — Solo Miner

LAST WEEK
  Sun    🎮 Played Hammer Game (rank #12)
  Mon    🔥 Streak extended: Week 12
```

- Grouped by day
- Each entry: time + type icon + description
- Clickable: navigates to relevant detail page
- Infinite scroll / load more
- Filter: All | Mining | Badges | Games | Competition

### Tasks

- [ ] Build `/profile` page with hero header, avatar generation, inline name edit
- [ ] Build mesh gradient background derived from BTC address
- [ ] Build tab bar routing (Overview/Badges/Stats/Activity/Settings)
- [ ] Build Overview tab: featured badges, mining summary, streak calendar, competition history, cooperative card
- [ ] Build Stats tab (`/profile/stats`): all-time stat cards, shares-per-week chart, difficulty progression chart, worker summary table, badge progress
- [ ] Build Activity tab (`/profile/history`): grouped timeline, filters, infinite scroll
- [ ] Build quick stats row component (shares, best diff, streak, badges inline)
- [ ] Mobile: header compresses, stats stack 2x2, timeline full-width

---

## 11.4 Settings — `/settings`

### Settings Layout

Left sidebar (desktop) or stacked sections (mobile) with settings groups:

```
SETTINGS NAVIGATION
├── Account
├── Notifications
├── Mining
├── Sound
├── Privacy
└── API Keys
```

### Account Settings — `/settings` (default)

```
PROFILE
  Display Name:      [SatoshiHunter          ] [Save]
  Country:           [🇵🇹 Portugal         ▼ ] [Save]
  BTC Address:       bc1q...abcd              [Copy] (read-only)

APPEARANCE
  Dashboard Mode:    [Full] [Simplified]       ← for NoCoiners toggle

DANGER ZONE
  [Delete Account]   ← red ghost button, opens confirm dialog
```

### Notification Settings — `/settings/notifications`

```
NOTIFICATION PREFERENCES

Organized by priority tier with toggles:

CRITICAL (Always on — cannot be disabled)
  ☑️  Block found by you
  ☑️  Worker offline for > 30 minutes
  ☑️  Streak about to expire (< 24h remaining)

HIGH (Default on)
  [Toggle] New personal best difficulty
  [Toggle] Badge earned
  [Toggle] World Cup match starting (if registered)
  [Toggle] Weekly lottery results ready

MEDIUM (Default off)
  [Toggle] Block found by any miner
  [Toggle] Leaderboard position change
  [Toggle] Cooperative member activity
  [Toggle] Education track recommendation

DELIVERY METHOD
  [Toggle] In-app notifications (bell icon)     ← always on
  [Toggle] Browser push notifications           ← requires permission
  [Toggle] Email notifications                  ← requires email input

  Email: [                              ] [Save]
  (Optional — only if email toggle is on)
```

### Mining Settings — `/settings/mining`

```
STRATUM CONNECTION
  Server:    stratum+tcp://mine.thebitcoingame.com:3333  [Copy]
  Username:  bc1q...abcd                                  [Copy]
  Password:  x                                            [Copy]
  [Copy Full Configuration]

COINBASE SIGNATURE (Premium)
  Custom text that appears in blocks you find:
  [/TheBitcoinGame:SatoshiHunter/    ] [Save]
  "Max 32 characters. Appears in the coinbase of any block you find."

DIFFICULTY PREFERENCES
  Minimum Share Difficulty:  [Auto (recommended) ▼]
  "Higher minimum = fewer shares but each share is more significant"
```

### Sound Settings — `/settings/sound`

(Built in Phase 9 — already specified. Just ensure it's accessible from this settings page.)

```
Sound Effects:     [Off] [Subtle] [Full]
Game Sounds:       [Toggle]
Master Volume:     [━━━━━━━━━━━●━━━] 80%
```

### Privacy Settings — `/settings/privacy`

```
PROFILE VISIBILITY
  [Toggle] Public profile                ← allows /miner/:address to show your data
  [Toggle] Show on leaderboard           ← opt out of public rankings
  [Toggle] Show country flag             ← hide country from public view
  [Toggle] Show in cooperative rankings  ← hide from coop leaderboards

DATA
  [Download My Data]     ← exports JSON of all user data
  [Delete My Data]       ← GDPR compliance, opens confirm dialog
```

### API Keys — `/settings/api-keys`

```
API ACCESS (Power users)
  "Access your mining data programmatically."

  API Key:  [sk-xxxx...xxxx]  [Copy]  [Regenerate]

  Last used: 2 hours ago

  ENDPOINTS
  GET /api/v1/mining/dashboard    — Real-time overview
  GET /api/v1/mining/workers      — Worker list
  GET /api/v1/mining/shares       — Share history
  GET /api/v1/gamification/badges — Badge collection

  [View Full API Docs →]
```

### Tasks

- [ ] Build `/settings` page with left-nav/stacked layout
- [ ] Build Account settings section with editable fields
- [ ] Build Notification settings with tiered toggle groups
- [ ] Build Mining settings with stratum config display and coinbase sig input
- [ ] Build Privacy settings with visibility toggles
- [ ] Build API Keys section with key display, copy, regenerate
- [ ] Wire sound settings (already built in Phase 9) into this page
- [ ] Build "Delete Account" and "Delete Data" confirm dialogs
- [ ] Store all settings in `userStore` (Zustand) + localStorage persistence
- [ ] Mobile: stacked sections with collapsible headers instead of sidebar nav

---

## 11.5 Notification Center (Bell Icon Dropdown)

**The bell icon in the TopBar opens a dropdown panel with all notifications.**

### Bell Icon Behavior

- Position: top-right of TopBar (already placed in Phase 3)
- Unread count: orange circle badge with number (e.g., "3")
- Click: opens dropdown panel below the icon
- Animation: panel scales from 0.95→1.0 + fades in (200ms, snappy)

### Notification Panel

```
┌──────────────────────────────────────┐
│  Notifications            [Mark All Read] │
│──────────────────────────────────────│
│                                        │
│  TODAY                                 │
│  ┌──────────────────────────────────┐│
│  │ 💎 New Best Difficulty!          ││ ← unread: slightly brighter bg
│  │ 4,231,847,293 — 14 min ago      ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ 🟢 Worker Online                 ││
│  │ bitaxe-living-room — 2h ago      ││
│  └──────────────────────────────────┘│
│                                        │
│  YESTERDAY                             │
│  ┌──────────────────────────────────┐│
│  │ 🎖️ Badge Earned: "Megahash"     ││ ← read: default bg
│  │ +100 XP — Yesterday 22:15       ││
│  └──────────────────────────────────┘│
│  ┌──────────────────────────────────┐│
│  │ 🔥 Streak Extended!              ││
│  │ 12-week streak — Yesterday 00:01 ││
│  └──────────────────────────────────┘│
│                                        │
│  EARLIER THIS WEEK                     │
│  ┌──────────────────────────────────┐│
│  │ 🧊 Block Found!                  ││
│  │ SatoshiFan42 found #891,234      ││
│  │ [View Block →]                   ││
│  └──────────────────────────────────┘│
│                                        │
│  [View All Notifications →]           │
│                                        │
└──────────────────────────────────────┘
```

### Notification Item Structure

```typescript
interface NotificationItem {
  id: string;
  type: 'mining' | 'gamification' | 'competition' | 'social' | 'system';
  subtype: string;          // 'worker_online', 'badge_earned', 'block_found', etc.
  icon: string;             // emoji or icon name
  title: string;
  description?: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;       // where to navigate on click
  actionLabel?: string;     // "View Block", "Play Now", etc.
}
```

### Panel Behavior

- Width: 400px (desktop), full-width slide-over (mobile)
- Max height: 500px with scroll
- Grouped by: Today, Yesterday, Earlier This Week, Older
- Unread items: slightly brighter background (`--bg-elevated`)
- Read items: default surface background
- Click an item: navigate to actionUrl, mark as read, close panel
- "Mark All Read": clears all unread indicators
- Close: click outside, press Escape, or click bell again
- Focus trap when open (keyboard accessible)

### Notification Store

```typescript
// src/stores/notificationStore.ts
interface NotificationStore {
  notifications: NotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  addNotification: (item: Omit<NotificationItem, 'id' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  togglePanel: () => void;
}
```

Connect this store to the existing toast system: when a notification is added, also fire a toast notification (unless the panel is currently open).

### Tasks

- [ ] Build `<NotificationPanel>` dropdown component
- [ ] Build `<NotificationItem>` with type-specific icon, read/unread state
- [ ] Build notification grouping by date (Today/Yesterday/Earlier/Older)
- [ ] Build `notificationStore` (Zustand) with add, markRead, markAllRead
- [ ] Update `<TopBar>` bell icon to show unread count badge and open panel
- [ ] Wire notification store to toast system (notification added → toast fires)
- [ ] Populate with mock notifications (15-20 items, mix of types and read states)
- [ ] Mobile: full-width slide-over instead of dropdown
- [ ] Keyboard: focus trap in panel, Escape closes, Tab through items
- [ ] `aria-live="polite"` on the unread count for screen readers

---

## 11.6 Public Miner Profile — `/miner/:address`

**Optional public profile for any miner who has opted in via privacy settings.**

### Layout

Simplified version of the authenticated profile:

```
[Avatar] DisplayName  🇵🇹
Level 7: Solo Miner

STATS
⛏️ 892K shares  💎 7.1B best  🔥 12wk streak

FEATURED BADGES (top 5)
[badge] [badge] [badge] [badge] [badge]

STREAK CALENDAR
[52-week heatmap]

(No edit controls, no activity feed, no settings)
```

- If user has not opted in: "This miner profile is private." message
- Link: "This could be you → [Connect Your Miner]"

### Tasks

- [ ] Build `/miner/:address` public profile page
- [ ] Reuse profile header, badge scroll, streak calendar components
- [ ] Handle private profile state (opt-out message)
- [ ] Add social meta tags for sharing (og:title, og:description, og:image)

---

## 11.7 Deliverables Checklist

- [ ] `/how-it-works` — 4-section scroll-triggered animated explainer
- [ ] `/leaderboard` (public) — limited weekly view with signup CTA
- [ ] `/profile` — hero header, overview tab, stats tab, activity tab
- [ ] `/profile/stats` — all-time stats, charts, worker summary, badge progress
- [ ] `/profile/history` — grouped activity timeline with filters
- [ ] `/settings` — account, notifications, mining, sound, privacy, API keys
- [ ] Notification center — bell icon dropdown/slide-over with grouped items
- [ ] `notificationStore` wired to toast system
- [ ] `/miner/:address` — public profile (opt-in)
- [ ] All pages responsive (320px mobile + 1024px+ desktop)

---

## Definition of Done

Phase 11 is complete when:
1. `/how-it-works` animates on scroll and clearly explains the product to a newcomer
2. Public leaderboard shows top 25 with signup CTA, no authenticated features leak
3. Profile page renders hero header with avatar, XP bar, quick stats, and all 3 tabs
4. Settings page allows editing all preferences with proper save/persist
5. Notification bell shows unread count and opens panel with grouped notifications
6. Clicking a notification navigates to the right page and marks it as read
7. All pages work on mobile (320px)
