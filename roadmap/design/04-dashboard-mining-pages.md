# Phase 4 — Dashboard & Mining Pages [COMPLETED]

## Duration: ~3 weeks
## Dependencies: Phase 3 (Layout & Navigation Shell)
## Status: COMPLETED
## Goal: Build the core mining experience — dashboard, workers, shares, difficulty tracker

---

## 4.1 Main Dashboard — `/dashboard`

The single most important page. This is what users see every time they open the app. It must be exciting every single time.

### Row 1: The Difficulty Meter (Full-Width Hero Element)

**The signature visual of the entire product.**

```
┌────────────────────────────────────────────────────────────┐
│  "Your Best Hash This Week"                                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ DIFFICULTY THERMOMETER                                │   │
│  │                                                        │   │
│  │ Full-width horizontal bar with logarithmic scale      │   │
│  │ Background: subtle grid pattern (graph paper feel)    │   │
│  │ Fill: Orange gradient, animated particles flowing      │   │
│  │                                                        │   │
│  │ [░░░░░░░░▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]   │   │
│  │          ↑                                    ↑       │   │
│  │    Your best: 4.2B              Network: 100T        │   │
│  │                                                        │   │
│  │ Logarithmic scale markers below:                      │   │
│  │ 1K    1M    1B    1T    10T    100T                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Left:   "Best Difficulty: 4,231,847,293" (monospace, large)│
│  Center: "That's 0.0042% of the way to a block!"           │
│  Right:  [Play This Week's Game →]                          │
└────────────────────────────────────────────────────────────┘
```

**Implementation Details:**
- The bar uses a logarithmic scale so even tiny progress is visible
- Orange gradient fill from left to the user's best difficulty marker
- Animated particles (small dots) flow left-to-right along the fill
- Scale markers: 1K, 1M, 1B, 1T, 10T, 100T — evenly spaced on log scale
- User's marker: vertical line with label, pulsing glow

**Real-Time Behavior:**
- When a new share beats the weekly best: bar JUMPS forward with a "thump" + screen flash + particle burst + celebratory sound
- Number counter spins up to new value (500ms count-up animation)
- Previous best briefly shown as ghost marker for comparison

### Row 2: Stat Cards (4 Columns)

| Card | Value Format | Sparkline | Change Indicator |
|------|-------------|-----------|------------------|
| Hashrate | `1.2 TH/s` (monospace) | 24h hashrate mini chart | `+3.2%` vs yesterday |
| Shares Today | `47,832` (monospace, count-up) | Today vs previous days | `+12% vs avg` |
| Workers | `3/3 Online` + dots (green/red) | N/A | "All healthy" or "1 offline" |
| Streak | `12 weeks` + fire animation | N/A | "Best ever!" or weeks until record |

**Animations:**
- All numbers use count-up animation on page load (500ms, ease-out)
- Sparklines draw left-to-right on appear
- Change percentages: green text + tiny up arrow if positive, red + down if negative
- Worker dots pulse gently when online

### Row 3: Two-Column Split

**Left: Live Share Feed**
- Real-time scrolling list of incoming shares via WebSocket
- Each entry: `[timestamp] [worker name] [difficulty value]`
- Color coding:
  - Gold: personal best (this week)
  - Green: above user's average difficulty
  - White: normal share
- New shares slide in from top with subtle bounce animation
- Maximum visible: ~15 entries, older ones scroll off
- Footer link: "View All Shares"

**Right: Hashrate Chart**
- Area chart (Recharts) with orange gradient fill
- Time range toggle: 1h / 24h / 7d / 30d (segmented control)
- Animated cursor dot tracks along the line
- Hover: tooltip with exact hashrate + time
- New data points extend the line with smooth spring animation
- Y-axis: hashrate (auto-scaled), X-axis: time

### Row 4: Two-Column Split

**Left: Latest Badges Earned**
- Horizontal scroll of recent badge cards (compact Apple Game Center style)
- Each: circular icon + name + date
- Tap to expand with badge detail modal
- Link: "View All Badges"

**Right: Upcoming Events**
- World Cup countdown or live status
- Weekly lottery countdown + "Preview Your Ticket" link
- Streak timer: "Streak ends in: 2d 14h"
- Each item is a card with icon, text, countdown, and action button

### Row 5: Global Feed (Collapsible)

- Feed of platform-wide events:
  - Block found by any miner
  - World Cup standing changes
  - Notable badge earns
  - New miners from user's country
- Each entry: icon + text + time ago
- Expandable/collapsible section

### Dashboard Special Behaviors

| Event | Behavior |
|-------|----------|
| First visit of day | Subtle sunrise gradient wash animation + "Good morning" |
| Block found globally | Full-width gold toast notification with pulse |
| Block found by YOU | Full-screen celebration overlay (see Phase 9) |
| New personal best | Difficulty meter jumps + flash + particle burst |
| Badge earned | Toast from top-right with badge icon spinning 3D |
| Worker goes offline | Orange alert in top bar subtitle |

### Tasks

- [x] Build `<DifficultyMeter>` with logarithmic scale, particle animation, spring physics
- [x] Build stat card row with `<StatCard>` instances for hashrate, shares, workers, streak
- [x] Build `<LiveShareFeed>` with simulated real-time updates (setInterval)
- [x] Build `<HashrateChart>` area chart with time range toggles (1h/24h/7d/30d)
- [x] Build `<RecentBadges>` horizontal scroll with BadgeCard components
- [x] Build `<UpcomingEvents>` card with live countdown timers
- [x] Build `<GlobalFeed>` collapsible section with type-specific icons
- [ ] Implement all dashboard special behaviors (toasts, alerts) — deferred to Phase 9
- [ ] Wire up WebSocket connection for real-time data — deferred to backend integration
- [x] Mobile layout: single column, stacked, responsive breakpoints

---

## 4.2 Workers Page — `/mining/workers`

### Page Header

```
"Your Mining Fleet"
"3 workers online - Total: 1.2 TH/s"
[+ Add Worker Guide]
```

### Worker Card Grid

One card per worker, responsive grid (1-3 columns based on viewport).

**Worker Card Contents:**
| Field | Format | Detail |
|-------|--------|--------|
| Status | Green/Red dot + "Online"/"Offline" | Breathing glow animation when online |
| Name | `bitaxe-living-room` | Editable via click |
| Hashrate | `480 GH/s` (monospace) | Mini sparkline next to it |
| Current Difficulty | `1,024` (monospace) | Current vardiff assignment |
| Best Difficulty | `2,847,193,472` (monospace) | All-time worker best |
| Shares/hr | `1,247` | Rolling 1-hour count |
| Uptime | `14d 7h 32m` | Since last connect |
| Last Share | `3 seconds ago` (live-updating) | Pulsing dot animation |
| Accept Rate | `99.7%` | Green if >99%, yellow 95-99%, red <95% |
| Temperature | `47°C` | If available from user-agent string |

**Offline Workers:**
- Card has muted colors (desaturated)
- Red dot with static state (no breathing)
- "Last seen: 2h ago" instead of live timestamp
- Subtle alert: "This worker has been offline since [time]"

### Worker Detail View

Accessed via "View Details" on worker card, opens as slide-over panel or dedicated page.

**Content:**
- Full hashrate chart (1h / 24h / 7d / 30d)
- Share distribution histogram (difficulty distribution of shares from this worker)
- Difficulty history chart (shows vardiff adjustments over time)
- Uptime calendar: GitHub-contribution-style grid, colored squares for each day
  - Color intensity = share count that day
  - Hover: date + share count + uptime hours
- Recent shares list (paginated table)
- Connection info: IP address, user agent, Stratum version

### Tasks

- [x] Build `<WorkerCard>` with all fields and online/offline states
- [x] Build worker card grid layout (responsive 1-3 columns)
- [x] Build `<WorkerDetail>` SlideOver with hashrate chart, uptime calendar, connection info
- [x] Build `<UptimeCalendar>` (GitHub contribution style)
- [x] Implement live-updating "last share" timestamps (useLastShareTimer hook)
- [x] Build "Add Worker Guide" modal with stratum connection details
- [x] Mobile: single-column card stack, simplified detail view

---

## 4.3 Shares Page — `/mining/shares`

### Share History Table

Paginated, sortable table of all shares submitted.

| Column | Format | Sortable |
|--------|--------|----------|
| Time | `2026-02-09 14:23:45` (monospace) | Yes |
| Worker | `bitaxe-living-room` | Yes (filter) |
| Difficulty | `2,847,193` (monospace) | Yes |
| Share Diff | `4,231,847,293` (monospace) | Yes |
| Valid | Green check / Red X | Yes (filter) |
| Block | Gold star if block candidate | Yes (filter) |

**Row Highlights:**
- Gold row: personal best difficulty
- Green row: above average
- Red row: invalid share (stale, duplicate)

**Filters:**
- Date range picker
- Worker selector (multi-select)
- Minimum difficulty threshold
- Valid/Invalid toggle

### Share Detail View

Click a row to open share detail (slide-over or page):
- Full hash value (monospace, with leading zeros highlighted in orange)
- Nonce value
- Worker that submitted it
- Network difficulty at the time
- Visual: ratio bar showing share_diff / network_diff
- "Share this hash" button (generates shareable card)

### Tasks

- [x] Build `<SharesTable>` with pagination (15/page), sorting, filtering
- [x] Build `<ShareDetail>` SlideOver with hash visualization (leading zeros in orange)
- [ ] Implement virtualized rows for performance — deferred (50-row dataset sufficient for now)
- [x] Build worker filter and validity filter components
- [x] Color-code rows based on difficulty significance (gold/green/red)

---

## 4.4 Difficulty Tracker — `/mining/difficulty`

**This page exists for the thrill of "how close did I get?"**

### Hero: Animated Mountain Visualization

A stylized mountain scene (SVG or Three.js):
- Mountain peak = network difficulty (unreachable, impossibly tall)
- Glowing climber dot = user's all-time best difficulty
- Path traces historical bests (flags at major milestones)
- Parallax layers: background stars, mid mountains, snow caps
- The mountain is designed to be impossibly tall on purpose — the journey is the point

**Right-side overlay stats:**
- "Your Summit: 4.2B"
- "Network Peak: 100T"
- "You've climbed 0.0042% of the way"
- "That's higher than 94% of all solo miners" (percentile rank)

### Personal Bests Table

| Period | Best Difficulty | Date Found | Global Rank |
|--------|----------------|------------|-------------|
| This Week | 4,231,847,293 | Today 14:23 | #12 |
| Last Week | 3,892,104,556 | Feb 2 | #18 |
| This Month | 4,231,847,293 | Today 14:23 | #8 |
| All Time | 7,104,293,847 | Jan 12 | #45 |

- Each row clickable: opens share detail
- Rank column clickable: jumps to leaderboard at that position

### Difficulty History Chart

- Scatter plot: each dot = a share, Y = difficulty, X = time
- Best shares highlighted in orange/gold
- Toggle: linear / logarithmic Y-axis (default: log)
- Hover: full share details tooltip
- Time range: 7d / 30d / 90d / All Time

### Difficulty Distribution Histogram

- X-axis: difficulty ranges (buckets)
- Y-axis: share count in each bucket
- Bell curve overlay showing expected distribution (Poisson)
- Outliers (high difficulty) highlighted in gold
- Shows where the user's best falls in the statistical context

### Tasks

- [x] Build `<MountainVis>` SVG mountain visualization with parallax, stars, climber dot
- [x] Build personal bests table with desktop table / mobile card layout
- [x] Build `<DifficultyScatter>` chart with log/linear toggle (Recharts ScatterChart)
- [x] Build `<DifficultyHistogram>` with highlighted user bucket (Recharts BarChart)
- [x] Display percentile rank (94% of solo miners)
- [x] Mobile: responsive mountain vis with overlay stats below on mobile

---

## 4.5 Blocks Found — `/mining/blocks`

### My Blocks

If the user has found any blocks (rare!):
- Hero card per block: block height, hash, reward, date, confirmations
- Gold border + sparkle animation
- "Replay" button: re-plays the block found celebration animation
- Share button: generates shareable card

### Global Blocks (Platform-Wide)

- Horizontal scroll or list of blocks found by all platform miners
- Each card: block height, finder display name + country flag, reward, time ago
- Gold border, cards slide in from right
- Counter: "47 blocks found by our miners"

### Empty State

If no blocks found (common for solo miners):
- Encouraging message: "No blocks yet — but every share gets you closer"
- Link to difficulty tracker
- Stats: estimated time to block based on hashrate
- "Keep mining!" call-to-action

### Tasks

- [x] Build `<BlockCard>` with gold left border and stagger animation
- [x] Build blocks found list for personal (empty state) and global views
- [x] Build encouraging empty state with estimated time-to-block
- [ ] Add "Replay celebration" functionality — deferred to Phase 9 (Animation & Sound)

---

## 4.6 Mining Setup — `/mining/setup`

Step-by-step guide to connect a miner:

### Stratum Configuration Card

```
┌──────────────────────────────────────────┐
│ Stratum URL:  stratum+tcp://mine.thebitcoingame.com:3333  [Copy]
│ Username:     [your-btc-address]                          [Copy]
│ Password:     x                                           [Copy]
│
│ [Copy Full Configuration]
└──────────────────────────────────────────┘
```

### Device-Specific Guides

Tabbed interface with guides for:
- Bitaxe (primary target)
- Antminer
- Whatsminer
- NerdAxe
- Generic / Other

Each guide: step-by-step with screenshots, copy-paste config fields.

### Connection Status

- Live indicator: "Waiting for your first share..." with radar animation
- Transitions to "Connected!" with confetti when first share arrives

### Tasks

- [x] Build `<StratumConfig>` card with copy-to-clipboard buttons
- [x] Build device-specific guide tabs (Bitaxe/Antminer/Whatsminer/NerdAxe/Other)
- [x] Build connection waiting state with radar animation
- [x] Build success state transition with confetti burst

---

## 4.7 Deliverables Checklist

- [x] `/dashboard` — complete with all 5 rows, mock real-time updates
- [x] `/mining/workers` — card grid + detail SlideOver + uptime calendar
- [x] `/mining/shares` — paginated sortable table + share detail + filters
- [x] `/mining/difficulty` — mountain SVG + bests table + scatter + histogram
- [x] `/mining/blocks` — personal empty state + global blocks list
- [x] `/mining/setup` — stratum config + device guides + connection status
- [ ] WebSocket integration for real-time data — deferred to backend integration
- [x] All pages responsive (320px mobile + 1024px+ desktop)

---

## Definition of Done

Phase 4 is complete when:
1. ~~Dashboard loads with mock/real data and all sections render correctly~~ DONE
2. ~~Difficulty meter animates smoothly on value changes~~ DONE (spring physics)
3. ~~Live share feed updates in real-time~~ DONE (mock setInterval, WebSocket deferred)
4. ~~Workers page shows online/offline status with live "last share" timestamps~~ DONE
5. ~~Difficulty tracker mountain visualization renders with user's best position~~ DONE
6. ~~All pages work on mobile with appropriate layout adaptations~~ DONE
7. Production build passes with 0 TypeScript errors — DONE (5657 modules, 310KB gzipped)
