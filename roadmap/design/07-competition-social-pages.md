# Phase 7 — Competition & Social Pages

## Duration: ~3 weeks
## Dependencies: Phase 6 (Gamification UI)
## Goal: Build World Cup, leagues, leaderboards (with globe), cooperatives, and social features

---

## 7.1 Leaderboard — `/leaderboard`

### Tab System

Segmented control (Apple style):
- **This Week** | **This Month** | **All Time** | **By Country**

### My Position Card (Sticky, Always Visible)

```
┌────────────────────────────────────────────────────────────┐
│ #12    [Avatar] YourName 🇵🇹    Best: 4.2B    ↑3 from #15  │
└────────────────────────────────────────────────────────────┘
```
- Sticky at the top of the leaderboard (always shows user's position)
- Subtle orange left border pulse
- Position change arrow: animated count-up, green (up) / red (down)

### Leaderboard Table

| Column | Content |
|--------|---------|
| Rank | Number (top 3: gold/silver/bronze medal) |
| Miner | Avatar + display name |
| Country | Flag emoji + code |
| Best Diff | Monospace number, gold star for weekly champion |
| Shares | Total shares count |

**Row Animations:**
- Rows slide in with staggered delay on page load (50ms between rows)
- Top 3 rows: animated metallic gradient borders (gold, silver, bronze)
- User's own row: highlighted background + orange left border pulse
- Position changes: arrows animate with count-up

**Interactions:**
- Hover: row highlights with `--bg-spotlight`
- Click: row expands with mini-profile (hashrate, workers, badges preview)
- Virtualized scroll for performance (hundreds of entries)

### Country Leaderboard View

When "By Country" tab is selected:

**Interactive Globe (Three.js / react-globe.gl)**
- Earth visualization, dark theme
- Countries with active miners are highlighted
- Dot size = total hashrate from that country
- Dot color intensity = miner count (more miners = brighter orange)
- Click a country: zoom in + show stats panel
- Auto-rotates slowly, stops on hover/touch
- Arc lines between countries during World Cup matches
- Mobile: simplified 2D map or smaller globe

**Country Ranking Table (below globe)**

| Rank | Country | Miners | Total Hashrate |
|------|---------|--------|----------------|
| 1 | USA | 847 | 12.4 PH/s |
| 2 | Japan | 623 | 8.7 PH/s |
| 3 | Germany | 512 | 6.2 PH/s |

### Tasks

- [ ] Build `/leaderboard` page with tab system (weekly/monthly/alltime/country)
- [ ] Build sticky "My Position" card
- [ ] Build leaderboard table with virtualized rows, staggered entry animation
- [ ] Build top-3 metallic gradient borders
- [ ] Build row expansion with mini-profile
- [ ] Build interactive globe component (Three.js / react-globe.gl)
- [ ] Build country ranking table below globe
- [ ] Mobile: simplified table (rank, name, diff only), 2D country view

---

## 7.2 World Cup — `/world-cup`

### Public World Cup Landing

```
┌────────────────────────────────────────────────────────────┐
│  SWAN BITCOIN Solo Mining World Cup 2027                    │
│                                                              │
│  [Live Match / Upcoming Countdown / Past Winner depending   │
│   on current state]                                         │
│                                                              │
│  GROUP STANDINGS                                             │
│  Group A          │ Group B          │ Group C              │
│  🇺🇸 USA     12pts │ 🇯🇵 Japan   10pts │ 🇩🇪 Germany  9pts  │
│  🇬🇧 UK      10pts │ 🇧🇷 Brazil   8pts │ 🇫🇷 France   8pts  │
│  🇨🇦 Canada   6pts │ 🇰🇷 Korea    7pts │ 🇪🇸 Spain    7pts  │
│  🇲🇽 Mexico   2pts │ 🇦🇺 Australia 3pts│ 🇮🇹 Italy    4pts  │
│                                                              │
│  MATCH SCHEDULE                                              │
│  [List of upcoming / recent matches]                        │
│                                                              │
│  BRACKET (Knockout Stage)                                    │
│  [Tournament bracket visualization]                         │
└────────────────────────────────────────────────────────────┘
```

### States

| State | Display |
|-------|---------|
| No active cup | "Next World Cup starts [date]" + registration CTA |
| Registration open | Registration form + countdown + registered countries list |
| Group stage | Live group standings + match schedule + live matches |
| Knockout stage | Tournament bracket + live match |
| Completed | Final results + winner celebration + recap |

### Match Page — `/world-cup/:id/match/:matchId`

```
┌────────────────────────────────────────────────────────────┐
│  🇵🇹 Portugal  2 — 1  Spain 🇪🇸                              │
│                                                              │
│  Presented by Bitaxe Open Source Mining                      │
│                                                              │
│  LIVE HASHRATE BAR                                           │
│  [████████████████████░░░░░░░░░░░░░░░░░░░░░░░░]            │
│  PT: 4.2 PH/s                          ES: 3.1 PH/s        │
│                                                              │
│  MATCH STATS                                                 │
│  Portugal          │              │ Spain                    │
│  247 miners        │ Miners       │ 198 miners               │
│  4.2 PH/s         │ Hashrate     │ 3.1 PH/s                │
│  0 blocks          │ Blocks Found │ 0 blocks                 │
│  2                  │ Goals        │ 1                        │
│                                                              │
│  SCORING: 1 goal per 5 PH/s + 3 bonus goals per block found│
│                                                              │
│  MAN OF THE MATCH                                            │
│  [Avatar] SatoshiHunter — highest diff share: 12.8T         │
│                                                              │
│  TOP MINERS (Portugal)      │ TOP MINERS (Spain)            │
│  1. SatoshiHunter  2.1 PH/s│ 1. ElMatador  1.8 PH/s       │
│  2. PortoHash      1.2 PH/s│ 2. MadridMine 0.9 PH/s       │
│  3. ...                     │ 3. ...                         │
│                                                              │
│  AI MATCH RECAP                                              │
│  "In a thrilling encounter, Portugal's SatoshiHunter        │
│   dominated the hashrate battle, pushing Portugal to         │
│   a 2-1 victory over their Iberian rivals..."               │
│                                                              │
│  [Share Match Result]                                        │
└────────────────────────────────────────────────────────────┘
```

**Live Match View (`/world-cup/:id/live`):**
- Real-time updating hashrate bars (WebSocket)
- Score updates with celebration animation (brief confetti on goal)
- Running commentary/events feed
- Timer showing match remaining

### Match Scoring Logic (Visual Representation)

```
Goal Calculation:
- 1 goal per 5 PH/s of team hashrate during match period
- Block found by a team's miner = 3 bonus goals
- Visual: goals "scored" when hashrate thresholds crossed
- Animation: soccer ball icon flies into goal when team earns a goal
```

### Tournament Bracket

- SVG/Canvas bracket visualization
- Expandable: click a match to see details
- Winner path highlighted in gold
- Animated connector lines

### World Cup Registration — `/world-cup/register`

- Country selector with flag preview
- Confirm BTC address is associated with that country
- Minimum 5 miners per country to qualify (show progress)
- Countdown to registration deadline

### Tasks

- [ ] Build `/world-cup` public landing with group standings, match schedule, bracket
- [ ] Build World Cup state machine (upcoming/registration/group/knockout/completed)
- [ ] Build match page with live hashrate bars and scoring visualization
- [ ] Build live match view with WebSocket real-time updates
- [ ] Build tournament bracket visualization (SVG)
- [ ] Build AI match recap display section
- [ ] Build match result share card
- [ ] Build `/world-cup/register` registration flow
- [ ] Build `/world-cup/my-team` page showing user's country stats
- [ ] Handle sponsor/advertising slots in match display
- [ ] Mobile: simplified match view, bracket scrollable

---

## 7.3 Leagues — `/leagues`

### Club-Based Competition

Post-World Cup feature. Users create or join "clubs" (cooperatives rebranded for competition).

### League Landing

```
┌────────────────────────────────────────────────────────────┐
│  LEAGUES                                                     │
│                                                              │
│  MY CLUB: [Club Name] — Division 2, Position: 3rd          │
│  [View My Club →]                                           │
│                                                              │
│  FEATURED LEAGUES                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ Champions    │ │ Division 1  │ │ Division 2  │          │
│  │ League       │ │             │ │             │          │
│  │ Top 16 clubs │ │ 16 clubs   │ │ 16 clubs   │          │
│  │ [View →]     │ │ [View →]    │ │ [View →]    │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│                                                              │
│  LEAGUE TABLE                                                │
│  # │ Club          │ P │ W │ D │ L │ Pts │ Hashrate       │
│  1 │ Tokyo Hash FC │ 8 │ 7 │ 1 │ 0 │ 22  │ 14.2 PH/s     │
│  2 │ Berlin Mining │ 8 │ 6 │ 1 │ 1 │ 19  │ 11.8 PH/s     │
│  ...                                                         │
│                                                              │
│  Promotion zone (top 3) highlighted in green                │
│  Relegation zone (bottom 3) highlighted in red              │
└────────────────────────────────────────────────────────────┘
```

### Tasks

- [ ] Build `/leagues` hub page with featured leagues and club status
- [ ] Build league table component with promotion/relegation zones
- [ ] Build `/leagues/:leagueId` specific league view
- [ ] Build `/leagues/:leagueId/team/:teamId` team detail view

---

## 7.4 Cooperatives — `/coop`

### Cooperative Dashboard

```
┌────────────────────────────────────────────────────────────┐
│  [Coop Avatar] Mining Vikings                                │
│  "Raiding the blockchain since 2026"                        │
│  12 members • 8.4 TH/s combined • 🔥 8 week streak         │
│                                                              │
│  COMBINED HASHRATE CHART                                     │
│  [Area chart showing cooperative total hashrate over time]  │
│                                                              │
│  MEMBER LIST                                                 │
│  # │ Member         │ Hashrate │ Shares Today │ Status     │
│  1 │ VikingOne      │ 2.1 TH/s │ 12,847      │ 🟢 Online  │
│  2 │ NorseHash      │ 1.8 TH/s │ 10,234      │ 🟢 Online  │
│  3 │ OdinMiner      │ 1.2 TH/s │ 7,891       │ 🔴 Offline │
│  ...                                                         │
│                                                              │
│  COOP STATS                                                  │
│  Best Combined Diff:  47.2T                                 │
│  Blocks Found:        0                                      │
│  Total Shares (week): 234,891                               │
│  Weekly Rank:         #34 (cooperatives)                    │
│                                                              │
│  INVITE LINK                                                 │
│  [https://thebitcoingame.com/coop/join/ABC123] [Copy]       │
│                                                              │
│  COOPERATIVE CHAT (Integrated)                               │
│  [Simple real-time chat for coop members]                   │
└────────────────────────────────────────────────────────────┘
```

### Create Cooperative — `/coop/create`

- Name input (unique check)
- Description/motto
- Upload avatar/logo
- Set payout address (multisig recommended)
- Invite first members

### Join Cooperative — `/coop/join/:inviteCode`

- Show coop details + member count
- Confirm join
- Welcome animation on join

### Tasks

- [ ] Build `/coop` dashboard page with combined stats and member list
- [ ] Build combined hashrate chart
- [ ] Build member list with individual stats and status
- [ ] Build invite link generation and copy
- [ ] Build `/coop/create` flow
- [ ] Build `/coop/join/:inviteCode` flow
- [ ] Build cooperative settings page (admin only)
- [ ] Build basic real-time cooperative chat (WebSocket-based)

---

## 7.5 Social Features (Foundational)

### Global Activity Feed

Used on dashboard and potentially as a standalone page:

```
🧊 SatoshiFan42 found Block #891,234! — 2h ago
🏆 Japan just overtook Brazil in World Cup standings! — 3h ago
🎖️ CryptoMike earned "Trillion Club" badge — 4h ago
⛏️ 3 new miners joined from Portugal today — 6h ago
🔥 MiningViking hit a 52-week streak! — 8h ago
```

- Each entry: icon + text + relative time
- Clickable: navigates to relevant detail page
- Filter by type: blocks, badges, competition, social
- Real-time: new events push to top via WebSocket

### Share Cards

Shareable image cards generated for:
- Game results (lottery outcomes)
- Badge earns
- Milestone achievements (streak, level up, personal best)
- Match results (World Cup)

All share cards:
- 1200x630px (social preview) and 1080x1080px (square)
- Branded: TheBitcoinGame logo, Bitcoin orange accent
- User's display name and result data
- Download as PNG + share intent to Nostr/X/Telegram

### Follow System (Foundational)

- Follow other miners to see their activity
- Activity feed filtered by followed miners
- Follower/following counts on public profiles

### Tasks

- [ ] Build `<ActivityFeed>` component with icon, text, time, filter
- [ ] Build share card generator (html-to-image or server-side rendering)
- [ ] Build follow/unfollow functionality
- [ ] Build followed miners activity feed view

---

## 7.6 Deliverables Checklist

- [ ] `/leaderboard` — 4 tab views (weekly/monthly/alltime/country)
- [ ] Interactive globe for country leaderboard
- [ ] `/world-cup` — Full World Cup experience (standings, matches, bracket)
- [ ] Live match view with real-time hashrate updates
- [ ] AI match recap display
- [ ] `/world-cup/register` — Registration flow
- [ ] `/leagues` — League hub, tables, team details
- [ ] `/coop` — Cooperative dashboard, create, join, member management
- [ ] Activity feed component
- [ ] Share card generation system
- [ ] All pages responsive

---

## Definition of Done

Phase 7 is complete when:
1. Leaderboard renders with proper ranking, animations, and globe visualization
2. World Cup system handles all states (upcoming/registration/group/knockout/completed)
3. Live match view updates in real-time via WebSocket
4. Cooperative dashboard shows combined team stats accurately
5. Share cards generate correctly for all shareable content types
6. Globe visualization works on desktop (simplified on mobile)
