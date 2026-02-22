# Phase 6 — Gamification UI

## Duration: ~2 weeks
## Dependencies: Phase 4 (Dashboard & Mining Pages)
## Goal: Build the badge collection, streak system, XP/level progression, and reward animations

---

## 6.1 Badge Collection Page — `/profile/badges`

**Apple Game Center style — the most satisfying collection screen in the app.**

### Page Header

```
"Your Collection"
"23 / 47 badges earned"
[████████████████░░░░░░░░░░░░░] 49% complete
```

- Progress bar: orange fill with animated particles flowing along it
- Total count animates on first load (count-up)

### Filter System

**Category Tabs (Segmented Control):**
- All | Mining | Streaks | Competition | Social

**Rarity Filter (Toggle Pills):**
- Common (gray) | Rare (cyan) | Epic (purple) | Legendary (gold)
- Multiple can be active at once

### Badge Grid

3-4 columns (responsive), each cell is a `<BadgeCard>` component from Phase 2.

**Grid Behavior:**
- Unlocked badges: full color, rarity glow, hover to rotate 3D
- Locked badges: grayscale, "???" text, slight shake on click
- Hidden badges: completely obscured, "?" icon, no hint at content
- Sort: earned date (newest first) or rarity (legendary first)

**Badge Earn Animation (triggered when badge first earned):**

```
Sequence (3.5s total):
0.0s  Screen dims to 70% brightness
0.3s  Badge card flies to center of screen from bottom (spring animation)
0.6s  Card flips from back (showing "?") to front (showing badge icon)
1.0s  3D badge icon expands and rotates one full turn
1.3s  Rarity-colored particles explode outward from badge
1.6s  "Achievement Unlocked!" text fades in above
1.8s  Badge name + description fades in below
2.0s  "+50 XP" floats upward and fades
2.5s  Rarity-specific sound plays (see Sound section)
3.0s  Tap anywhere to dismiss
3.5s  Badge icon flies to collection corner (persistent UI)
```

### Badge Detail Modal (from Phase 2, enhanced)

- Large 3D interactive badge icon (draggable rotation)
- Metallic material with environment lighting
- Badge name, rarity tag, full description
- "Earned: January 15, 2026"
- Metadata: Block #891,234 — 3.125 BTC (for block finder badge)
- "Only 0.3% of miners have this badge" (rarity percentage)
- Share buttons: [Share to Nostr] [Download Image]

### Tasks

- [ ] Build `/profile/badges` page with header, filters, and grid
- [ ] Build progress bar with animated fill and particle effect
- [ ] Build filter system (category tabs + rarity toggles)
- [ ] Build badge earn animation sequence (full 3.5s choreography)
- [ ] Enhance `<BadgeDetailModal>` with rarity percentage and share buttons
- [ ] Build badge image download feature (render badge card as downloadable PNG)
- [ ] Mobile: 2-column grid, simplified animations

---

## 6.2 Badge System Data

### Badge Categories & Definitions

**Mining Milestones:**

| Badge | Trigger | Rarity | XP |
|-------|---------|--------|-----|
| First Hash | Submit 1 share | Common | 50 |
| Hash Thousand | Submit 1,000 shares | Common | 100 |
| Megahash | Submit 1,000,000 shares | Rare | 200 |
| Block Finder | Find a Bitcoin block solo | Legendary | 500 |

**Difficulty Records:**

| Badge | Trigger | Rarity | XP |
|-------|---------|--------|-----|
| Million Club | Best diff > 1,000,000 | Common | 50 |
| Billion Club | Best diff > 1,000,000,000 | Rare | 100 |
| Trillion Club | Best diff > 1,000,000,000,000 | Epic | 200 |
| Diff Champion | Highest difficulty of the week (global #1) | Epic | 300 |

**Streaks:**

| Badge | Trigger | Rarity | XP |
|-------|---------|--------|-----|
| Month Strong | 4-week mining streak | Common | 100 |
| Quarter Master | 12-week mining streak | Rare | 200 |
| Year of Mining | 52-week mining streak | Legendary | 500 |

**Node Operator:**

| Badge | Trigger | Rarity | XP |
|-------|---------|--------|-----|
| Node Runner | Verified running a Bitcoin full node | Rare | 150 |
| Pruned but Proud | Verified running a pruned node | Common | 100 |
| Archival Node | Verified running an archival node | Epic | 250 |

**Competition:**

| Badge | Trigger | Rarity | XP |
|-------|---------|--------|-----|
| World Cup Miner | Participate in any World Cup | Rare | 200 |
| World Champion | Win the World Cup (your country) | Legendary | 500 |

**Social / Education:**

| Badge | Trigger | Rarity | XP |
|-------|---------|--------|-----|
| Orange Piller | Gift a Bitaxe to a nocoiner | Rare | 200 |
| Rabbit Hole | Complete full education track | Common | 150 |
| Coop Founder | Create a cooperative | Rare | 150 |
| Team Block | Cooperative finds a block | Legendary | 500 |

### Badge Icon Design Direction

- Each badge: 3D rendered icon in a circular mask
- Metallic materials (gold, silver, bronze, platinum based on rarity)
- Consistent lighting and shadow direction across all badges
- Export: PNG @1x/@2x/@3x for display, .glb for interactive 3D view
- Locked state: same icon but grayscale + silhouette

### Tasks

- [ ] Define complete badge catalog in a typed configuration file
- [ ] Design badge artwork for all badges (or placeholder icon set for MVP)
- [ ] Build badge checking logic (given user state, which badges are newly earned?)
- [ ] Build badge notification pipeline (earn -> toast -> animation -> persist)

---

## 6.3 Streak System — `/profile/streaks`

### Streak Types

**Weekly Mining Streak:**
- Rule: Submit at least 1 valid share per calendar week (Monday-Sunday)
- Visual: Fire icon that grows with streak length

**Daily Mining Streak (hardcore):**
- Rule: Submit at least 1 valid share per calendar day
- Visual: Lightning bolt icon that intensifies

### Streak Page Layout

```
┌────────────────────────────────────────────────────────────┐
│  "Your Streaks"                                              │
│                                                              │
│  WEEKLY STREAK                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  [Fire icon — animated, size scales with streak]      │   │
│  │                                                        │   │
│  │  Current:     12 weeks                                │   │
│  │  Longest:     12 weeks (THIS IS YOUR RECORD!)        │   │
│  │  Started:     November 18, 2025                       │   │
│  │                                                        │   │
│  │  Week Progress:                                       │   │
│  │  [██████████████████████████░░░░] 5/7 days this week │   │
│  │                                                        │   │
│  │  ⚠️ Streak expires: Sunday 23:59 UTC (2d 14h left)   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  STREAK CALENDAR                                             │
│  [52-week heatmap showing streak weeks in orange]           │
│  Each cell = one week, filled = streak maintained           │
│  Breaks shown as gaps                                        │
│                                                              │
│  STREAK MILESTONES                                           │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
│  │ 4 wks  │ │ 12 wks │ │ 26 wks │ │ 52 wks │              │
│  │ ✅ Done│ │ ✅ Done│ │ 🔒 14  │ │ 🔒 40  │              │
│  │        │ │        │ │ to go  │ │ to go  │              │
│  └────────┘ └────────┘ └────────┘ └────────┘              │
└────────────────────────────────────────────────────────────┘
```

### Streak Mechanics

- **Freeze protection:** If a user misses a week, they get ONE freeze (can be earned through extra mining). On freeze, streak pauses but doesn't reset. Revive by mining double shares next week.
- **Streak milestone animation:** At 4, 8, 12, 16, etc. weeks — fire emoji appears, grows, morphs into the streak number, fire particles disperse outward (1.5s animation)
- **Expiring streak notification:** Push notification when <24h remains in the week and no shares submitted yet

### Tasks

- [ ] Build `/profile/streaks` page with streak display and calendar
- [ ] Build streak fire icon component (animated, scales with streak length)
- [ ] Build 52-week streak heatmap calendar
- [ ] Build streak milestone progress indicators
- [ ] Build streak milestone animation (fire grow + number morph)
- [ ] Build streak expiry warning system (notifications)
- [ ] Implement streak freeze/revive mechanic

---

## 6.4 XP & Level System — `/profile/level`

### Level Definitions

| Level | Title | XP Required | Cumulative XP |
|-------|-------|-------------|---------------|
| 1 | Nocoiner | 0 | 0 |
| 2 | Curious Cat | 100 | 100 |
| 3 | Hash Pupil | 500 | 600 |
| 4 | Solo Miner | 1,000 | 1,600 |
| 5 | Difficulty Hunter | 2,500 | 4,100 |
| 10 | Hashrate Warrior | 10,000 | ~30,000 |
| 15 | Block Chaser | 25,000 | ~80,000 |
| 20 | Mining Veteran | 50,000 | ~180,000 |
| 25 | Satoshi's Apprentice | 100,000 | ~430,000 |
| 30 | Cypherpunk | 250,000 | ~930,000 |
| 50 | Timechain Guardian | 1,000,000 | ~5,000,000 |

### XP Sources

| Action | XP Earned |
|--------|-----------|
| Each share submitted | 1 XP |
| Weekly best diff personal record | 50 XP |
| Education module completed | 100 XP |
| Badge earned | 50-500 XP (varies by rarity) |
| World Cup participation | 200 XP |
| Running a verified node | 10 XP/day |
| Streak week maintained | 25 XP |

### Level Page Layout

```
┌────────────────────────────────────────────────────────────┐
│  [Level Badge Icon]                                          │
│  Level 7: Solo Miner                                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ XP BAR (full width, animated)                         │   │
│  │ [████████████████████░░░░░░░░░░░░░] 2,340 / 5,000 XP│   │
│  │ Particles flow along the filled portion               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  "2,660 XP to Level 8: Difficulty Hunter"                   │
│  "At your current pace, ~3 weeks"                           │
│                                                              │
│  LEVEL ROADMAP (vertical timeline)                          │
│  ● Level 7: Solo Miner ← YOU ARE HERE                      │
│  ○ Level 8: Difficulty Hunter (2,660 XP away)              │
│  ○ Level 9: ...                                              │
│  ○ Level 10: Hashrate Warrior (7,660 XP away)              │
│                                                              │
│  XP HISTORY (recent XP gains)                               │
│  +1 XP  — Share submitted (x47,832 today)                  │
│  +50 XP — New personal best difficulty                      │
│  +100 XP — "First Hash" badge earned                        │
│  +25 XP  — Week 12 streak maintained                        │
└────────────────────────────────────────────────────────────┘
```

### Level Up Animation

```
Sequence (2.5s):
0.0s  XP bar fills to 100% (animated fill, 500ms)
0.3s  XP bar flashes white
0.5s  Level number explodes (particles outward) and reforms as new number
0.8s  "LEVEL 8: Difficulty Hunter" text sweeps in from right
1.0s  New level perks listed below (fade in, staggered)
1.5s  Subtle fireworks behind the text
2.0s  XP bar resets (empties with drain animation) showing new target
2.5s  Ascending chime: do-re-mi-fa-sol sound plays

On reduced motion: simple number change + text update, no particles/fireworks
```

### Tasks

- [ ] Build `/profile/level` page with XP bar, level roadmap, XP history
- [ ] Build `<XPBar>` component with animated fill + particle flow
- [ ] Build level up animation sequence
- [ ] Build level roadmap timeline component
- [ ] Build XP history feed component
- [ ] Implement XP calculation from user actions
- [ ] Display current level in sidebar (always visible)

---

## 6.5 Reward Toast Notification System

Gamification events trigger toast notifications that stack from the top-right.

### Toast Types

**Badge Earned Toast:**
```
┌──────────────────────────────────┐
│ [rarity-color left border]       │
│ 🎖️ Badge Earned!                 │
│ [Badge Icon spinning] "Megahash" │
│ +100 XP                          │
│                                  │
│ Click to view →                  │
└──────────────────────────────────┘
```
- Badge icon does 360 spin in toast
- "+100 XP" floats upward and fades
- Click: opens badge earn animation (full modal)
- Auto-dismiss: 5s

**Level Up Toast:**
```
┌──────────────────────────────────┐
│ [gold left border]               │
│ ⬆️ Level Up!                     │
│ Level 8: Difficulty Hunter       │
│ Keep going!                      │
└──────────────────────────────────┘
```

**Streak Toast:**
```
┌──────────────────────────────────┐
│ [orange left border]             │
│ 🔥 Streak Extended!              │
│ 12-week mining streak!           │
│ +25 XP                          │
└──────────────────────────────────┘
```

**Personal Best Toast:**
```
┌──────────────────────────────────┐
│ [orange left border + glow]      │
│ 💎 New Best Difficulty!          │
│ 4,231,847,293                    │
│ Your new weekly record!          │
│ +50 XP                          │
└──────────────────────────────────┘
```

### Tasks

- [ ] Extend `<ToastProvider>` from Phase 2 with gamification-specific toast types
- [ ] Build badge-specific toast with spinning icon
- [ ] Build XP float-up micro-animation ("+50 XP" that drifts up and fades)
- [ ] Implement toast stacking and auto-dismiss timing
- [ ] Connect gamification events to toast triggers via WebSocket/event bus

---

## 6.6 Deliverables Checklist

- [ ] `/profile/badges` — Full badge collection page with filters and grid
- [ ] Badge earn animation (3.5s full sequence)
- [ ] Badge detail modal with 3D interaction and share
- [ ] `/profile/streaks` — Streak display, calendar, milestones
- [ ] Streak fire animation + milestone celebration
- [ ] `/profile/level` — XP bar, level roadmap, XP history
- [ ] Level up animation (2.5s sequence)
- [ ] Gamification toast notification system
- [ ] XP float-up micro-animation
- [ ] All animations respect `prefers-reduced-motion`

---

## Definition of Done

Phase 6 is complete when:
1. Badge collection page renders all badges in correct locked/unlocked state
2. Badge earn animation plays correctly when triggered
3. Streak page shows accurate streak data with calendar heatmap
4. XP bar fills and level up animation triggers at correct thresholds
5. All gamification toasts fire on corresponding events
6. Everything works on mobile with appropriate simplifications
