# THE BITCOIN GAME — Complete UI/UX Design Plan

## Visual Identity, Routes, Components, Animations & Interaction Design

**Version:** 1.0  
**Date:** February 2026  
**For:** Design Team & Frontend Developers

---

## Table of Contents

1. [Design Philosophy & Pillars](#1-design-philosophy--pillars)
2. [Design System Foundation](#2-design-system-foundation)
3. [Complete Route Map](#3-complete-route-map)
4. [Page-by-Page Design Specifications](#4-page-by-page-design-specifications)
5. [Game Experiences — Full Design](#5-game-experiences--full-design)
6. [Animation System](#6-animation-system)
7. [Notification & Reward System](#7-notification--reward-system)
8. [Sound Design](#8-sound-design)
9. [Mobile Design (Responsive + Native)](#9-mobile-design)
10. [Onboarding Flows](#10-onboarding-flows)
11. [Micro-Interactions Catalog](#11-micro-interactions-catalog)
12. [Accessibility](#12-accessibility)
13. [Design Tooling & Handoff](#13-design-tooling--handoff)

---

## 1. Design Philosophy & Pillars

### The Feeling We're After

Imagine opening a beautifully designed iOS game — that moment of delight when the interface itself feels like a reward. Now combine that with the precision and cleanliness of Apple's design language, the excitement of checking lottery results, and the competitive edge of a FIFA World Cup dashboard. That's The Bitcoin Game.

**This is NOT a typical crypto dashboard.** No cluttered charts. No ugly TradingView embeds. No "hacker" aesthetic. This is a **premium gaming experience** that happens to be about Bitcoin mining.

### Five Design Pillars

**1. DELIGHT FIRST**
Every interaction should produce a small dopamine hit. Opening the app, checking your difficulty, seeing a share come in — each moment is designed to make the user smile, not just inform them.

**2. APPLE-LEVEL POLISH**
SF Pro-inspired typography. Buttery 60fps animations. Depth through subtle shadows, blurs, and layering. Every pixel considered. Think Apple Game Center meets Stripe Dashboard meets a AAA mobile game.

**3. GAME, NOT TOOL**
The mental model is "I'm playing a game" not "I'm managing mining infrastructure." The dashboard IS the game. Checking your stats IS gameplay. The UI should make people want to check the app even when they know nothing has changed.

**4. PROGRESSIVE DISCLOSURE**
Nocoiners see a simple, beautiful lottery. Intermediate users see their mining dashboard. Power users can drill into share-level data. Complexity is always one click deeper, never in your face.

**5. BITCOIN ORANGE IS SACRED**
Orange (#F7931A) is used sparingly and always means something important — a reward, a milestone, Bitcoin itself. It is never used for backgrounds, borders, or decoration. When you see orange, it matters.

---

## 2. Design System Foundation

### 2.1 Color Palette

```
BACKGROUNDS (Layered depth system — like Apple's materials)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer 0 — Canvas:       #06080C    (Deepest black, page background)
Layer 1 — Surface:      #0D1117    (Card backgrounds, panels)
Layer 2 — Elevated:     #161B22    (Modals, dropdowns, hover states)
Layer 3 — Floating:     #1C2333    (Tooltips, popovers)
Layer 4 — Spotlight:    #252D3A    (Active/selected states)

ACCENT COLORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bitcoin Orange:         #F7931A    (Primary accent — rewards, BTC, milestones)
Bitcoin Orange Glow:    #F7931A40  (40% opacity — for glows and halos)
Electric Cyan:          #58A6FF    (Links, interactive elements, info)
Success Green:          #3FB950    (Valid shares, wins, online status)
Danger Red:             #F85149    (Errors, offline, losses)
Purple Royal:           #A371F7    (Rare/Epic badges, premium features)
Gold Legendary:         #D4A843    (Legendary badges, block finds)
Warm White:             #E6EDF3    (Primary text)
Muted Gray:             #8B949E    (Secondary text, labels)
Subtle Gray:            #30363D    (Borders, dividers)

GRADIENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Orange Reward:     linear-gradient(135deg, #F7931A, #E8720A)
Cyan Action:       linear-gradient(135deg, #58A6FF, #388BFD)
Purple Magic:      linear-gradient(135deg, #A371F7, #8957E5)
Gold Shimmer:      linear-gradient(135deg, #D4A843, #B8860B)
Dark Depth:        linear-gradient(180deg, #0D1117, #06080C)
Card Highlight:    linear-gradient(135deg, #161B2280, #1C233380)

GLASSMORPHISM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Glass Panel:       background: rgba(13, 17, 23, 0.7);
                   backdrop-filter: blur(20px) saturate(180%);
                   border: 1px solid rgba(255, 255, 255, 0.06);
```

### 2.2 Typography

```
FONT STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Primary:           Inter (UI text, body, buttons)
Monospace:         JetBrains Mono (hashes, difficulty values, technical data)
Display:           Clash Display or Satoshi (headlines, hero text, game titles)

SCALE (Based on Apple's type system)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hero:              56px / 64px line / -0.02em / Bold         (Landing page hero)
Display Large:     40px / 48px line / -0.02em / Bold         (Page titles)
Display Medium:    32px / 40px line / -0.01em / Semibold     (Section headers)
Title:             24px / 32px line / -0.01em / Semibold     (Card titles, game names)
Headline:          20px / 28px line / 0em / Semibold         (Subsections)
Body Large:        17px / 26px line / 0em / Regular          (Primary body text)
Body:              15px / 24px line / 0em / Regular          (Standard text)
Caption:           13px / 18px line / 0em / Medium           (Labels, metadata)
Micro:             11px / 16px line / 0.02em / Medium        (Timestamps, tiny labels)

MONOSPACE NUMBERS (Always use for)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Difficulty values, hashrate numbers, share counts, BTC amounts,
block heights, nonces, timers — anything that ticks or changes.
Use font-variant-numeric: tabular-nums for alignment.
```

### 2.3 Spacing & Layout Grid

```
BASE UNIT: 4px
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
xs:    4px       (Tight inline spacing)
sm:    8px       (Icon-to-text gaps)
md:    12px      (Internal card padding elements)
lg:    16px      (Standard gaps between elements)
xl:    24px      (Card internal padding)
2xl:   32px      (Section spacing)
3xl:   48px      (Major section breaks)
4xl:   64px      (Page-level vertical rhythm)

LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Max content width:     1280px
Sidebar width:         260px (collapsible to 72px icon-only)
Card border-radius:    16px (large cards), 12px (medium), 8px (small/buttons)
Page padding:          32px (desktop), 16px (mobile)
```

### 2.4 Elevation & Depth System

```
Every surface layer has increasing elevation. Depth is communicated through:

1. Background color shade (darker = further back)
2. Border (1px solid rgba(255,255,255,0.04–0.08))
3. Shadow (very subtle, only on floating elements)
4. Blur (glassmorphism on overlays)

SHADOWS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Subtle:    0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)
Medium:    0 4px 12px rgba(0,0,0,0.4)
Heavy:     0 8px 32px rgba(0,0,0,0.5)
Glow:      0 0 20px rgba(247,147,26,0.3)   (Orange glow for rewards)
CyanGlow:  0 0 20px rgba(88,166,255,0.2)    (Cyan glow for active states)
```

### 2.5 Iconography

- **Primary:** Phosphor Icons (beautiful, consistent, playful weight)
- **Mining-specific:** Custom icon set (pickaxe, ASIC chip, bitcoin node, hash, block)
- **Badge artwork:** 3D rendered icons (like Apple Game Center achievements)
- **Flags:** Twemoji or custom flag set for World Cup
- **Icon size:** 20px inline, 24px buttons, 32px navigation, 48px feature icons, 64px badge icons

### 2.6 Component Library Overview

```
BUTTONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Primary:      Bitcoin Orange gradient, white text, 12px radius, 44px height
              hover: scale(1.02) + glow shadow
              active: scale(0.98) + darker shade
              disabled: 50% opacity, no glow

Secondary:    Glass surface, cyan text, 1px border
              hover: border brightens, subtle cyan glow

Ghost:        Transparent, gray text
              hover: Layer 2 background appears

Danger:       Red gradient, used sparingly

Icon Button:  Circle, 40px, glass surface
              hover: scale(1.05) + icon color brightens

CARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Standard:     Layer 1 bg, 16px radius, 24px padding, subtle border
              hover: border brightens to rgba(255,255,255,0.08) + translate Y -2px

Interactive:  Standard + pointer cursor + scale(1.01) on hover
              Used for: game cards, lottery cards, leaderboard entries

Stat Card:    Standard + large monospace number + label below
              Number animates on value change (count-up effect)

Glass Card:   Glassmorphism bg, used for overlays and featured content

INPUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Text Input:   Layer 2 bg, 12px radius, 44px height, subtle border
              focus: cyan border + cyan glow shadow

Search:       Rounded pill shape, icon prefix, glass background

Toggle:       iOS-style toggle, orange when active

BADGES (Achievement Cards — Apple Game Center style)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Locked:       Grayscale icon, glass card, "???" text
Unlocked:     Full-color 3D icon, glow effect, date earned
              Circular mask on icon (Apple-style)
Rarity border colors:
  Common:     #8B949E (gray)
  Rare:       #58A6FF (cyan)
  Epic:       #A371F7 (purple)
  Legendary:  #D4A843 (gold) + shimmer animation

TAGS / PILLS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Online:       Green dot + "Online" text in green pill
Offline:      Gray dot + "Offline"
Block Found:  Gold pill with star icon
Streak:       Fire emoji + count in orange pill
Country:      Flag emoji + country code
```

---

## 3. Complete Route Map

### 3.1 Public Routes (No Auth Required)

```
/                                   Landing page — hero + feature showcase
/about                              About the project, team, mission
/how-it-works                       Animated explainer of solo mining + gamification
/leaderboard                        Public global leaderboard (limited view)
/blocks                             Recent blocks found by our miners
/world-cup                          Public World Cup standings & schedule
/world-cup/:competitionId           Specific competition overview
/world-cup/:competitionId/match/:id Public match details + AI recap
/stats                              Global pool statistics
/miner/:address                     Public miner profile (if user opted in)
/education                          Education landing page
/education/:trackId                 Specific track overview
/education/:trackId/:lessonId       Specific lesson (some free, some auth-required)
/connect                            Wallet connection / login page
/gift                               "Gift a Bitaxe" landing page for Bitcoiners
```

### 3.2 Authenticated Routes

```
DASHBOARD (Main Hub)
/dashboard                          Main mining dashboard — the "home screen"

MINING
/mining/workers                     All workers — list + detail views
/mining/workers/:workerId           Individual worker detail
/mining/shares                      Share history + analytics
/mining/shares/:shareId             Individual share detail (with hash visualization)
/mining/difficulty                  Difficulty tracker — personal bests, charts
/mining/blocks                      Blocks I've found (or my coop found)
/mining/setup                       Setup guide — connect your miner

GAMES (The Heart of the Experience)
/games                              Game hub — choose your weekly game
/games/hammer                       The Hammer Game (strongman)
/games/horse-race                   Horse Race
/games/slots                        Slot Machine
/games/scratch                      Scratch Card
/games/lottery-history              Past lottery results + replays

WORLD CUP & LEAGUES
/world-cup/my-team                  My country's team page
/world-cup/register                 Register for next World Cup
/world-cup/:id/live                 Live match view with real-time animation
/leagues                            Club leagues hub
/leagues/:leagueId                  Specific league standings
/leagues/:leagueId/team/:teamId     Team detail in league

PROFILE & ACHIEVEMENTS
/profile                            My profile — edit display name, country, avatar
/profile/badges                     My badge collection (Apple Game Center grid)
/profile/badges/:badgeId            Individual badge detail (3D view + how to earn)
/profile/stats                      Detailed personal statistics
/profile/streaks                    Streak dashboard
/profile/level                      XP progress + level details
/profile/history                    Activity feed / timeline

COOPERATIVES
/coop                               My cooperative dashboard
/coop/create                        Create a cooperative
/coop/:coopId                       Cooperative detail page
/coop/:coopId/members               Member list + hashrate contributions
/coop/:coopId/stats                 Cooperative statistics
/coop/:coopId/settings              Settings (admin only)
/coop/join/:inviteCode              Join via invite link

LEADERBOARD
/leaderboard/weekly                 This week's rankings
/leaderboard/monthly                Monthly rankings
/leaderboard/alltime                All-time rankings
/leaderboard/country                Country rankings (with map visualization)
/leaderboard/difficulty             Highest single difficulty shares ever

BETTING (Phase 10)
/betting                            Betting hub — available markets
/betting/match/:matchId             Bet on specific match
/betting/my-bets                    My bet history + active bets
/betting/wallet                     LN wallet for betting

EDUCATION (Authenticated for progress tracking)
/learn                              Learning hub with tracks
/learn/:trackId/:lessonId           Lesson view with progress

SHOP
/shop                               Hardware store
/shop/bitaxe                        Bitaxe product page
/shop/nodes                         Node hardware
/shop/bundles                       Starter kits
/shop/merch                         Merchandise (World Cup jerseys, etc.)

SETTINGS
/settings                           Account settings
/settings/notifications             Notification preferences
/settings/mining                    Mining configuration (coinbase sig, etc.)
/settings/privacy                   Privacy controls (public profile toggle)
/settings/api-keys                  API access for power users
```

---

## 4. Page-by-Page Design Specifications

### 4.1 Landing Page — `/`

**Purpose:** Convert visitors into users. Make solo mining look exciting, not boring.

```
┌──────────────────────────────────────────────────────────────────┐
│ HEADER (Sticky, glass background on scroll)                       │
│ [₿ Logo]  How It Works  Leaderboard  World Cup  Education  [Connect Wallet] │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ HERO SECTION (Full viewport height)                               │
│                                                                    │
│  Background: Animated particle field — thousands of tiny orange   │
│  dots floating upward (representing hashes being computed).       │
│  Occasionally, one particle turns bright gold and expands         │
│  (representing a block found). Subtle parallax on mouse move.    │
│                                                                    │
│  Center content:                                                   │
│  ┌────────────────────────────────────────────┐                   │
│  │  [Display font, 56px, white]                │                   │
│  │  "Mining Bitcoin is a game.                 │                   │
│  │   Start playing."                           │                   │
│  │                                              │                   │
│  │  [Body, 17px, muted gray]                   │                   │
│  │  "Turn your solo miner into a weekly lottery.│                  │
│  │   Compete with miners worldwide. Have fun."  │                  │
│  │                                              │                   │
│  │  [████████ Connect Your Miner ████████]      │ ← Orange CTA    │
│  │  [  How Does This Work?  ]                   │ ← Ghost button  │
│  └────────────────────────────────────────────┘                   │
│                                                                    │
│  Below hero: Live counter (animated count-up)                     │
│  "12,847 miners online • 2.4 EH/s total • 47 blocks found"      │
│                                                                    │
│  Scroll indicator: Gentle bouncing chevron                         │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SECTION: "Your Mining, Gamified" (Scroll-triggered animations)    │
│                                                                    │
│  Three feature cards, staggered entry from bottom:                │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  🎰           │  │  🏆           │  │  🌍           │           │
│  │  Weekly       │  │  Compete     │  │  World Cup   │           │
│  │  Lottery      │  │  & Earn      │  │  of Mining   │           │
│  │              │  │  Badges      │  │              │           │
│  │  Your best   │  │              │  │  Your country│           │
│  │  hash of the │  │  Apple Game  │  │  vs the world│           │
│  │  week becomes│  │  Center style│  │  in hashrate │           │
│  │  your lottery│  │  achievements│  │  battles     │           │
│  │  ticket      │  │  & streaks   │  │              │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                    │
│  Each card: Glass surface, hover lifts + subtle glow,             │
│  contains a looping micro-animation preview of the feature        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SECTION: "The Hammer Game" — Interactive Demo                     │
│                                                                    │
│  Left side: Animated demo of the Hammer Game playing              │
│  (auto-plays with sample data, user can click to "try")          │
│                                                                    │
│  Right side:                                                       │
│  "Every week, your miner searches for the hardest hash            │
│   it can find. On Sunday, you play the lottery to see             │
│   how close you came to finding a block."                         │
│                                                                    │
│  [Try the Demo →]                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SECTION: Live Leaderboard Preview                                 │
│                                                                    │
│  Animated table showing top 10 miners this week                   │
│  Entries slide in one by one on scroll                            │
│  Each row: rank, avatar, display name, country flag, best diff   │
│  Rows have a subtle shimmer animation                             │
│                                                                    │
│  [View Full Leaderboard →]                                        │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SECTION: World Cup Teaser                                         │
│                                                                    │
│  If active: Live match scoreboard with animated flags              │
│  If upcoming: Countdown timer with particle effects               │
│  If past: Highlight reel of last winner                           │
│                                                                    │
│  Globe visualization showing participating countries (Three.js)   │
│  Dots glow based on each country's hashrate                       │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SECTION: "For NoCoiners" — The Gift That Mines                    │
│                                                                    │
│  Illustration of a Bitaxe being gifted                            │
│  "Give someone their first Bitcoin experience."                    │
│  Step-by-step visual: Gift → Plug in → Play → Learn → Hodl      │
│                                                                    │
│  [Gift a Bitaxe →]                                                │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ SECTION: Recent Blocks Found                                      │
│                                                                    │
│  Horizontal scroll of "block cards" — each card shows:           │
│  Block height, finder's name, reward amount, time ago             │
│  Gold border + sparkle animation                                  │
│  Cards slide in from right, newest first                          │
│                                                                    │
│  "47 blocks found by our miners. You could be next."             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ FOOTER                                                             │
│  Links: About, GitHub (mining engine), API Docs, Education        │
│  Social: Nostr, X/Twitter, Telegram                               │
│  "Open source mining. Proprietary fun."                           │
│  [₿ TheBitcoinGame]                                               │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Connect / Login Page — `/connect`

**No email. No password. Pure Bitcoin.**

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                    │
│  Centered card (max 480px wide), glass surface:                   │
│                                                                    │
│  [₿ Logo animated — subtle pulse]                                 │
│                                                                    │
│  "Connect with Bitcoin"                                            │
│  "Sign a message with your Bitcoin wallet to log in."             │
│                                                                    │
│  ┌──────────────────────────────────────────┐                     │
│  │  Your Bitcoin Address                      │                     │
│  │  [bc1q... or 1... or 3...               ] │                     │
│  └──────────────────────────────────────────┘                     │
│                                                                    │
│  [████████ Generate Challenge ████████]                            │
│                                                                    │
│  ─── After address entered ───                                    │
│                                                                    │
│  "Sign this message in your wallet:"                               │
│  ┌──────────────────────────────────────────┐                     │
│  │  Sign in to TheBitcoinGame               │                     │
│  │  Nonce: a8f3...                          │ [Copy button]       │
│  │  Timestamp: 1707436800                   │                     │
│  └──────────────────────────────────────────┘                     │
│                                                                    │
│  ┌──────────────────────────────────────────┐                     │
│  │  Paste your signature here                │                     │
│  │  [                                      ] │                     │
│  └──────────────────────────────────────────┘                     │
│                                                                    │
│  [████████ Verify & Enter ████████]                               │
│                                                                    │
│  Bottom: "Don't have a wallet? Start here →"                     │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘

ANIMATION: On successful verification:
- The card compresses and explodes into orange particles
- Particles swirl into a vortex
- Dashboard fades in behind
- Welcome banner slides down: "Welcome back, [DisplayName] 🎮"
```

### 4.3 Main Dashboard — `/dashboard`

**The home screen. The command center. The game.**

This is the single most important page. When users open the app, this is what they see. It must be exciting every single time.

```
┌──────────────────────────────────────────────────────────────────┐
│ SIDEBAR (260px, collapsible)                                      │
│ ┌──────────┐                                                      │
│ │ [₿ LOGO] │  THE BITCOIN GAME                                   │
│ └──────────┘                                                      │
│                                                                    │
│ ──── PLAY ────                                                    │
│ 🏠 Dashboard          ← active state: left orange border          │
│ 🎮 Games              ← pulse animation if lottery available      │
│ 🏆 World Cup          ← live dot if match active                  │
│ 🏅 Leagues                                                        │
│                                                                    │
│ ──── MINE ────                                                    │
│ ⛏️ Workers                                                        │
│ 📊 Shares                                                         │
│ 💎 Difficulty                                                     │
│ 🧊 Blocks Found                                                  │
│                                                                    │
│ ──── SOCIAL ────                                                  │
│ 📋 Leaderboard                                                    │
│ 👥 Cooperative                                                    │
│ 🎓 Education                                                     │
│                                                                    │
│ ──── ME ────                                                      │
│ 🎖️ Badges             ← counter of new badges if earned           │
│ 👤 Profile                                                        │
│ ⚙️ Settings                                                      │
│                                                                    │
│ ─────────────                                                     │
│ Level 7: Solo Miner                                               │
│ [████████░░░░] 2,340/5,000 XP                                    │
│ 🔥 12-week streak                                                 │
│ ─────────────                                                     │
│ [🟢 3 workers online]                                             │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│ MAIN CONTENT AREA                                                  │
│                                                                    │
│ TOP BAR                                                            │
│ "Good morning, [Name]"          [🔔 Notifications] [🎮 Weekly Game Ready!] │
│ "Your miner has been hashing for 14 days straight 🔥"            │
│                                                                    │
│ ═══════════════════════════════════════════════════════════════   │
│                                                                    │
│ ROW 1: THE DIFFICULTY METER (Full width hero element)             │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │                                                              │   │
│ │  "Your Best Hash This Week"                                 │   │
│ │                                                              │   │
│ │  ┌─────────────────────────────────────────────────────┐   │   │
│ │  │ DIFFICULTY THERMOMETER                                │   │   │
│ │  │                                                        │   │   │
│ │  │  Full-width horizontal bar (like a progress bar)      │   │   │
│ │  │  Background: subtle grid pattern (like graph paper)   │   │   │
│ │  │  Fill: Orange gradient, animated particles flowing     │   │   │
│ │  │  left to right along the fill                         │   │   │
│ │  │                                                        │   │   │
│ │  │  [░░░░░░░░▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  │   │   │
│ │  │           ↑                                    ↑      │   │   │
│ │  │     Your best: 4.2B              Network: 100T       │   │   │
│ │  │                                                        │   │   │
│ │  │  Below bar: logarithmic scale markers                 │   │   │
│ │  │  1K    1M    1B    1T    10T    100T                  │   │   │
│ │  │                                                        │   │   │
│ │  └─────────────────────────────────────────────────────┘   │   │
│ │                                                              │   │
│ │  Left: "Best Difficulty: 4,231,847,293" (monospace, large)  │   │
│ │  Center: "That's 0.0042% of the way to a block!"           │   │
│ │  Right: [🎮 Play This Week's Game →]                        │   │
│ │                                                              │   │
│ │  ANIMATION: When a new share comes in that beats            │   │
│ │  your weekly best, the bar JUMPS forward with a             │   │
│ │  satisfying "thump" + screen flash + particle burst         │   │
│ │  + celebratory sound. Number counter spins up.              │   │
│ │                                                              │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ ROW 2: Stat Cards (4 columns)                                     │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ Hashrate     │ │ Shares Today│ │ Workers     │ │ Streak      │ │
│ │              │ │              │ │              │ │              │ │
│ │ 1.2 TH/s    │ │ 47,832      │ │ 3/3 Online  │ │ 🔥 12 weeks │ │
│ │ ↑ 3.2%      │ │ ↑ 12% vs avg│ │ All healthy │ │ Best ever!  │ │
│ │              │ │              │ │              │ │              │ │
│ │ [sparkline]  │ │ [sparkline]  │ │ [●●●]       │ │ [fire anim] │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                                    │
│  ANIMATION: Stat numbers have a count-up effect when page loads.  │
│  Sparklines draw themselves left-to-right. Percentage changes     │
│  are green (up) or red (down) with a tiny arrow animation.        │
│                                                                    │
│ ROW 3: Two columns                                                │
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐│
│ │ LIVE SHARE FEED               │ │ HASHRATE CHART               ││
│ │                                │ │                               ││
│ │ Real-time scrolling list of   │ │ Area chart, 24h default      ││
│ │ incoming shares               │ │ Toggle: 1h / 24h / 7d / 30d ││
│ │                                │ │                               ││
│ │ Each share entry:             │ │ Orange gradient fill          ││
│ │ [timestamp] [worker] [diff]   │ │ Animated cursor dot on line  ││
│ │                                │ │ Hover: tooltip with exact val││
│ │ Color coding:                 │ │                               ││
│ │ Gold = personal best          │ │ Y-axis: hashrate             ││
│ │ Green = above your average    │ │ X-axis: time                 ││
│ │ White = normal                │ │                               ││
│ │                                │ │ On new data point:           ││
│ │ NEW shares slide in from top  │ │ line extends with smooth     ││
│ │ with a subtle bounce          │ │ spring animation             ││
│ │                                │ │                               ││
│ │ [View All Shares →]           │ │                               ││
│ └──────────────────────────────┘ └──────────────────────────────┘│
│                                                                    │
│ ROW 4: Recent Activity & Upcoming                                 │
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐│
│ │ LATEST BADGES EARNED          │ │ UPCOMING                      ││
│ │                                │ │                               ││
│ │ Horizontal scroll of recent   │ │ • World Cup: 12 days away    ││
│ │ badge cards (Apple Game Center│ │   [Register Your Country →]  ││
│ │ style, circular artwork)      │ │                               ││
│ │                                │ │ • Weekly lottery: Sunday 8pm  ││
│ │ Tap to expand with animation  │ │   [Preview Your Ticket →]    ││
│ │                                │ │                               ││
│ │ [View All Badges →]           │ │ • Streak ends in: 2d 14h     ││
│ └──────────────────────────────┘ └──────────────────────────────┘│
│                                                                    │
│ ROW 5: Global Feed (Optional — collapsible)                       │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ 🧊 SatoshiFan42 found Block #891,234! — 2h ago            │   │
│ │ 🏆 Japan just overtook Brazil in World Cup standings!      │   │
│ │ 🎖️ CryptoMike earned "Trillion Club" badge — 4h ago       │   │
│ │ ⛏️ 3 new miners joined from Portugal today                 │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

**Dashboard special behaviors:**
- **First visit of the day:** Subtle "Good morning" animation with sunrise gradient wash
- **Block found globally:** Full-width toast notification with gold pulse
- **Block found by YOU:** Everything stops. Confetti. Fireworks. Sound. Full-screen celebration overlay (see Section 6)
- **New personal best difficulty:** The Difficulty Meter bar jumps with a "thump" + particle burst
- **Badge earned:** Toast notification slides in from top-right with badge icon spinning in 3D

### 4.4 Workers Page — `/mining/workers`

```
┌──────────────────────────────────────────────────────────────────┐
│ PAGE HEADER                                                        │
│ "Your Mining Fleet"                                                │
│ "3 workers online • Total: 1.2 TH/s"                             │
│ [+ Add Worker Guide]                                               │
│                                                                    │
│ WORKER CARDS (Grid of cards, one per worker)                      │
│ ┌────────────────────────────────────────────┐                    │
│ │  [🟢] bitaxe-living-room                    │                    │
│ │                                              │                    │
│ │  Hashrate:    480 GH/s    [mini sparkline]  │                    │
│ │  Difficulty:  1,024                          │                    │
│ │  Best Diff:   2,847,193,472                  │                    │
│ │  Shares/hr:   1,247                          │                    │
│ │  Uptime:      14d 7h 32m                     │                    │
│ │  Last Share:  3 seconds ago [live pulsing dot]│                   │
│ │  Accepted:    99.7%                          │                    │
│ │  Temperature: 47°C  [if available from UA]   │                    │
│ │                                              │                    │
│ │  [View Details →]                            │                    │
│ └────────────────────────────────────────────┘                    │
│                                                                    │
│  OFFLINE workers: Card has muted colors, red dot, "Last seen 2h" │
│  ANIMATION: Online workers have a subtle breathing glow on the   │
│  green indicator. The "last share" timestamp updates in real-time.│
│                                                                    │
│  DETAIL VIEW (slide-in panel or separate page):                   │
│  - Full hashrate chart (1h/24h/7d/30d)                           │
│  - Share distribution histogram                                    │
│  - Difficulty history chart                                        │
│  - Uptime calendar (GitHub-contribution-style grid)               │
│  - Recent shares list                                              │
└──────────────────────────────────────────────────────────────────┘
```

### 4.5 Difficulty Tracker — `/mining/difficulty`

**This page is specifically designed for the thrill of "how close did I get?"**

```
┌──────────────────────────────────────────────────────────────────┐
│ "Your Difficulty Journey"                                          │
│                                                                    │
│ HERO: ANIMATED MOUNTAIN VISUALIZATION                             │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │                                                              │   │
│ │  A stylized mountain (Three.js or SVG)                      │   │
│ │  The peak = network difficulty                              │   │
│ │  A glowing climber dot = your best difficulty               │   │
│ │  The path shows your historical bests                       │   │
│ │  Previous peaks are marked with flags                       │   │
│ │                                                              │   │
│ │  The mountain is impossibly tall (it IS impossible           │   │
│ │  for a Bitaxe to find a block), but the journey             │   │
│ │  itself is the point. Each new record moves                 │   │
│ │  the climber a tiny bit higher.                             │   │
│ │                                                              │   │
│ │  Parallax layers: background stars, mid mountains, snow     │   │
│ │                                                              │   │
│ │  Right side overlay stats:                                  │   │
│ │  "Your Summit: 4.2B"                                        │   │
│ │  "Network Peak: 100T"                                       │   │
│ │  "You've climbed 0.0042% of the way"                       │   │
│ │  "That's higher than 94% of all solo miners"               │   │
│ │                                                              │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ PERSONAL BESTS TABLE                                              │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ Period          │ Best Difficulty  │ Date Found  │ Rank    │   │
│ │ This Week       │ 4,231,847,293   │ Today 14:23 │ #12     │   │
│ │ Last Week       │ 3,892,104,556   │ Feb 2       │ #18     │   │
│ │ This Month      │ 4,231,847,293   │ Today 14:23 │ #8      │   │
│ │ All Time        │ 7,104,293,847   │ Jan 12      │ #45     │   │
│ │                                                              │   │
│ │ Each row: click to see the share details + hash             │   │
│ │ Rank column: clickable → jumps to leaderboard position      │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ DIFFICULTY HISTORY CHART                                          │
│ Scatter plot: each dot = a share, Y = difficulty, X = time       │
│ Best shares highlighted in orange                                  │
│ Hover: full share details                                         │
│ Toggle: linear / logarithmic Y-axis                               │
│                                                                    │
│ DIFFICULTY DISTRIBUTION HISTOGRAM                                 │
│ Shows how your shares distribute across difficulty ranges          │
│ Bell curve overlay showing expected distribution                   │
│ Outliers (high difficulty) highlighted in gold                     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.6 Leaderboard — `/leaderboard`

```
┌──────────────────────────────────────────────────────────────────┐
│ "Global Rankings"                                                  │
│                                                                    │
│ TAB BAR (Segmented control, Apple style):                         │
│ [ This Week | This Month | All Time | By Country ]               │
│                                                                    │
│ MY POSITION CARD (Sticky, always visible at top):                 │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ #12    [Avatar] YourName 🇵🇹    Best: 4.2B    ↑3 from #15  │   │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ LEADERBOARD TABLE (Smooth scroll, virtualized for performance)    │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ RANK  MINER              COUNTRY  BEST DIFF     SHARES    │   │
│ │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │   │
│ │                                                              │   │
│ │  🥇   SatoshiHunter      🇯🇵 JP   12.8T ✦       892,104   │   │
│ │       [Gold row glow, slightly larger text]                 │   │
│ │                                                              │   │
│ │  🥈   BlockChaser99      🇺🇸 US   11.2T         743,892   │   │
│ │       [Silver row glow]                                     │   │
│ │                                                              │   │
│ │  🥉   MiningViking       🇳🇴 NO   9.7T          681,234   │   │
│ │       [Bronze row glow]                                     │   │
│ │                                                              │   │
│ │  4    HashMaster         🇩🇪 DE   8.4T          612,847   │   │
│ │  5    BitaxeBob          🇬🇧 GB   7.9T          587,293   │   │
│ │  ...                                                         │   │
│ │  12   YourName           🇵🇹 PT   4.2B    ← YOU (highlighted)│  │
│ │  ...                                                         │   │
│ │                                                              │   │
│ │ ANIMATIONS:                                                  │   │
│ │ - Top 3 rows have animated metallic gradient borders        │   │
│ │ - Rows slide in with staggered delay on page load           │   │
│ │ - Position change arrows animate (↑↓) with count-up         │   │
│ │ - Clicking a row expands it with miner mini-profile         │   │
│ │ - Your own row has a subtle orange left border pulse        │   │
│ │ - Hovering a row shows quick stats tooltip                  │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ COUNTRY LEADERBOARD VIEW (when "By Country" tab selected):       │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │                                                              │   │
│ │  INTERACTIVE GLOBE (Three.js / react-globe.gl)              │   │
│ │  - Countries with miners are highlighted                    │   │
│ │  - Dot size = total hashrate from that country              │   │
│ │  - Dot color = orange intensity based on miner count        │   │
│ │  - Click a country → zoom in → show country stats panel     │   │
│ │  - Auto-rotates slowly, stops on hover                      │   │
│ │  - Arc lines connecting countries (during World Cup)         │   │
│ │                                                              │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ Below globe: Country ranking table                                │
│ 🇺🇸 USA: 847 miners, 12.4 PH/s total                             │
│ 🇯🇵 Japan: 623 miners, 8.7 PH/s total                            │
│ 🇩🇪 Germany: 512 miners, 6.2 PH/s total                          │
│ ...                                                                │
└──────────────────────────────────────────────────────────────────┘
```

### 4.7 Badge Collection — `/profile/badges`

**Apple Game Center style — collectible card grid with 3D badge artwork**

```
┌──────────────────────────────────────────────────────────────────┐
│ "Your Collection"                                                  │
│ "23 / 47 badges earned"                                           │
│ [████████████████░░░░░░░░░░░░░] 49% complete                     │
│                                                                    │
│ FILTER TABS:                                                      │
│ [ All | Mining ⛏️ | Streaks 🔥 | Competition 🏆 | Social 👥 ]    │
│                                                                    │
│ RARITY FILTER:                                                    │
│ [ ⬜ Common | 🔵 Rare | 🟣 Epic | 🟡 Legendary ]                │
│                                                                    │
│ BADGE GRID (3-4 columns, responsive):                             │
│ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐        │
│ │           │ │           │ │           │ │           │        │
│ │  [3D icon │ │  [3D icon │ │  [LOCKED] │ │  [LOCKED] │        │
│ │  in circle│ │  in circle│ │  grayscale│ │  ???      │        │
│ │  mask]    │ │  mask]    │ │  circle]  │ │           │        │
│ │           │ │           │ │           │ │           │        │
│ │ "First    │ │ "Block    │ │ "Trillion │ │ "????????"│        │
│ │  Hash"    │ │  Finder"  │ │  Club"    │ │           │        │
│ │           │ │           │ │           │ │           │        │
│ │ ⬜ Common  │ │ 🟡 Legend.│ │ 🟣 Epic   │ │ 🟣 Epic   │        │
│ │ Feb 1 '26 │ │ Jan 15    │ │ Locked    │ │ Hidden    │        │
│ └───────────┘ └───────────┘ └───────────┘ └───────────┘        │
│                                                                    │
│ INTERACTIONS:                                                      │
│ - Hover: card lifts (translateY -4px) + rarity-colored glow      │
│ - Unlocked badges: icon subtly rotates on hover (3D perspective) │
│ - Locked badges: slight "shake" on click with "Keep mining!" msg │
│ - Click unlocked → opens badge detail modal                      │
│                                                                    │
│ BADGE DETAIL MODAL:                                               │
│ ┌────────────────────────────────────────────┐                    │
│ │                                              │                    │
│ │   [LARGE 3D BADGE — interactive!]           │                    │
│ │   User can rotate it by dragging            │                    │
│ │   (Three.js scene with metallic material)   │                    │
│ │   Catches light, has depth, feels physical  │                    │
│ │                                              │                    │
│ │   "Block Finder"                             │                    │
│ │   🟡 Legendary                               │                    │
│ │                                              │                    │
│ │   "Found a Bitcoin block solo mining"        │                    │
│ │                                              │                    │
│ │   Earned: January 15, 2026                   │                    │
│ │   Block #891,234 — 3.125 BTC                │                    │
│ │                                              │                    │
│ │   "Only 0.3% of miners have this badge"     │                    │
│ │                                              │                    │
│ │   [Share to Nostr]  [Download Image]         │                    │
│ │                                              │                    │
│ └────────────────────────────────────────────┘                    │
│                                                                    │
│ BADGE EARN ANIMATION (when badge is first earned):                │
│ 1. Screen dims slightly                                           │
│ 2. Badge card flies to center of screen from bottom               │
│ 3. Card flips from back (showing "?") to front (showing badge)   │
│ 4. 3D badge icon expands and rotates once                         │
│ 5. Rarity-colored particles explode outward                       │
│ 6. "Achievement Unlocked!" text fades in                         │
│ 7. Sound effect plays (rarity-appropriate chime)                  │
│ 8. +XP counter animates upward                                   │
│ 9. Tap anywhere to dismiss (badge flies to collection corner)     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.8 Profile Page — `/profile`

```
┌──────────────────────────────────────────────────────────────────┐
│ PROFILE HEADER (Full width, hero style)                           │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │  Background: Subtle animated mesh gradient (personal color) │   │
│ │                                                              │   │
│ │  [Avatar circle — generated from BTC address, Blockies-style│   │
│ │   or custom upload. Circular mask with rarity border         │   │
│ │   based on highest badge rarity earned]                     │   │
│ │                                                              │   │
│ │  "SatoshiHunter" ✏️                                         │   │
│ │  bc1q...abcd 🇵🇹 Portugal                                   │   │
│ │                                                              │   │
│ │  Level 7: Solo Miner                                        │   │
│ │  [████████████░░░░░░░░] 2,340 / 5,000 XP                   │   │
│ │  XP bar has animated particles flowing along it              │   │
│ │                                                              │   │
│ │  Quick stats row:                                           │   │
│ │  ⛏️ 892K shares  💎 7.1B best  🔥 12wk streak  🎖️ 23 badges │   │
│ │                                                              │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ TAB BAR: [ Overview | Badges | Stats | Activity | Settings ]     │
│                                                                    │
│ OVERVIEW TAB:                                                     │
│                                                                    │
│ "Featured Badges" (Horizontal scroll, 3-5 most impressive)       │
│ [badge] [badge] [badge] [badge] [badge]                          │
│                                                                    │
│ "Mining Summary"                                                   │
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐│
│ │ Hashrate (24h average)       │ │ Total Shares (all time)      ││
│ │ 1.2 TH/s                    │ │ 892,104                      ││
│ │ [24h sparkline chart]        │ │ [monthly bar chart]           ││
│ └──────────────────────────────┘ └──────────────────────────────┘│
│                                                                    │
│ "Streak Calendar" (Like GitHub contributions)                     │
│ ┌────────────────────────────────────────────────────────────┐   │
│ │ Each day = a square. Color intensity = share count          │   │
│ │ ░░▓▓▓▓▓░░▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓░░▓▓▓▓▓▓▓  │   │
│ │ Orange squares = days you mined                             │   │
│ │ Bright orange = high share count                            │   │
│ │ Hover: "Feb 5: 2,847 shares, best diff: 1.2B"             │   │
│ └────────────────────────────────────────────────────────────┘   │
│                                                                    │
│ "Competition History"                                             │
│ List of World Cups / leagues participated in with results         │
│                                                                    │
│ "Cooperative"                                                     │
│ [Card showing coop name, role, members, combined hashrate]        │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Game Experiences — Full Design

### 5.1 Game Hub — `/games`

The game hub is where users go to play the weekly lottery. It's designed to feel like entering an arcade.

```
┌──────────────────────────────────────────────────────────────────┐
│ GAME HUB                                                          │
│                                                                    │
│ Background: Subtle animated arcade-style neon grid                │
│ (very faint, like Tron but tasteful)                              │
│                                                                    │
│ "This Week's Results Are Ready! 🎮"                               │
│ "Your best hash: 4,231,847,293 • Network target: 100,847,293,444"│
│                                                                    │
│ "Choose Your Game:"                                                │
│                                                                    │
│ ┌────────────────┐  ┌────────────────┐                            │
│ │                │  │                │                            │
│ │   🔨           │  │   🏇           │                            │
│ │                │  │                │                            │
│ │  THE HAMMER    │  │  HORSE RACE    │                            │
│ │                │  │                │                            │
│ │  Strongman     │  │  Watch your    │                            │
│ │  style — how   │  │  difficulty    │                            │
│ │  high can your │  │  race against  │                            │
│ │  hash launch   │  │  the odds      │                            │
│ │  the weight?   │  │                │                            │
│ │                │  │                │                            │
│ │  [PLAY NOW]    │  │  [PLAY NOW]    │                            │
│ └────────────────┘  └────────────────┘                            │
│                                                                    │
│ ┌────────────────┐  ┌────────────────┐                            │
│ │                │  │                │                            │
│ │   🎰           │  │   🎫           │                            │
│ │                │  │                │                            │
│ │  SLOT MACHINE  │  │  SCRATCH CARD  │                            │
│ │                │  │                │                            │
│ │  Visual hash   │  │  Scratch to    │                            │
│ │  matching on   │  │  reveal your   │                            │
│ │  spinning      │  │  weekly        │                            │
│ │  reels         │  │  difficulty    │                            │
│ │                │  │                │                            │
│ │  [PLAY NOW]    │  │  [PLAY NOW]    │                            │
│ └────────────────┘  └────────────────┘                            │
│                                                                    │
│ Game cards have a 3D perspective tilt on hover                    │
│ (react-tilt style, like a holographic trading card)               │
│ Each card has a looping preview animation in the icon area        │
│                                                                    │
│ BELOW: "Past Results"                                             │
│ Horizontal scroll of past weeks with thumbnail replays            │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 The Hammer Game — `/games/hammer`

**Full-screen game experience. This is the flagship.**

```
SCENE: Carnival strongman game at a Bitcoin-themed fair

VISUAL ELEMENTS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Background:   Carnival/fair atmosphere — string lights (orange), dark sky
              with Bitcoin symbols as stars, subtle parallax layers

The Tower:    Tall vertical structure (center of screen)
              Bottom: platform with "HIT" button
              Segments marked with difficulty milestones:
                1K → 1M → 1B → 1T → 10T → 100T → BLOCK!
              Each segment has a different color/texture
              Top: Golden bell with Bitcoin logo

The Puck:     Glowing orange disc that travels up the tower
              Trail of particles behind it as it moves
              Physically simulated — accelerates then decelerates

The Mallet:   Visible at bottom, animated swing when user clicks

YOUR STATS:   Panel on the left showing:
              - Your best difficulty this week
              - Network difficulty
              - Ratio (how far the puck will go)

GAMEPLAY FLOW:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. INTRO ANIMATION (2 seconds)
   Camera pans up the tower from bottom to top
   Bell glints at the top
   Text: "Let's see how close you got this week!"

2. ANTICIPATION (1 second)
   Button appears: "SWING THE HAMMER 🔨"
   Button has a pulsing glow
   Crowd murmur ambient sound

3. THE SWING (User clicks)
   - Mallet swings down with satisfying WHACK sound
   - Screen shakes briefly (CSS transform)
   - Puck launches upward
   - Speed proportional to difficulty ratio
   - As it passes milestones, text labels zoom past
   - Particle trail intensifies
   - Crowd reacts: gasps, cheers at each milestone
   - Camera follows the puck up

4. THE RESULT
   A) Normal result (puck stops partway):
      - Puck decelerates, wobbles, stops
      - Difficulty number counter animates to final value
      - "4.2 Billion — That's higher than 94% of miners!"
      - Crowd applause sound
      - Confetti appropriate to how high you got

   B) BLOCK FOUND (impossibly rare):
      - Puck SLAMS into the bell
      - MASSIVE bell ring sound
      - Screen goes white for a flash
      - Fireworks explode everywhere
      - "🎉 YOU FOUND A BLOCK! 🎉"
      - BTC reward amount falls from top of screen
      - Crowd goes absolutely wild
      - Screen recording prompt (share this moment!)

5. POST-GAME
   - "This Week's Rankings" — where you placed
   - [Play Again] (replay animation, same result)
   - [Share Result] (generates shareable image card)
   - [Try a Different Game →]

TECHNICAL NOTES:
- Built with Three.js (React Three Fiber) or PixiJS
- Physics: simple spring simulation for puck movement
- Sound: Howler.js with positional audio
- The game result is predetermined by your actual mining data
- Animation duration: ~4-6 seconds total
- Mobile: Touch-to-swing, full-screen portrait mode
```

### 5.3 Horse Race — `/games/horse-race`

```
SCENE: A horse racing track viewed from the side

VISUAL STYLE: Stylized pixel art or low-poly 3D
              7 lanes, each representing a day of the week

HORSES: Named after the user's workers or days of the week
        Colors: Monday=red, Tuesday=blue... Sunday=gold
        Each horse's speed = proportional to best difficulty
        found on that day of the week

GAMEPLAY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. STARTING GATE
   Horses at the gate, jittering with anticipation
   Announcer text: "And they're OFF!"
   Starting gun sound

2. THE RACE (10-15 seconds)
   Horses gallop at different speeds
   Camera tracks alongside the lead horse
   Live commentary text bubbles:
   "Monday is pulling ahead!"
   "Wednesday is making a move!"
   Crowd noise intensifies near finish

   TENSION BUILDING:
   If the user's best difficulty was found on, say, Wednesday,
   Wednesday's horse gradually pulls ahead during the race.
   But it's not immediate — other horses stay competitive
   to build suspense.

3. FINISH
   Winning horse crosses the line
   Photo finish animation if it's close
   Results board slides in:
   
   1st: Wednesday  — Diff: 4.2B 🏆
   2nd: Monday     — Diff: 3.8B
   3rd: Friday     — Diff: 2.1B
   ...
   
   "Your best race was on Wednesday!"

4. BLOCK FOUND VARIANT
   If a block was found, the winning horse transforms into
   a unicorn mid-race, leaves others in the dust, and
   flies across the finish line with wings unfurling.

EXTRA: Users can "bet" (no real money, just for fun XP)
on which day next week will have their highest difficulty.
```

### 5.4 Slot Machine — `/games/slots`

```
VISUAL: Classic 3-reel slot machine, Bitcoin themed

REELS: Each reel shows hexadecimal characters (0-9, a-f)
       The reels represent the first N characters of:
       - Your best hash
       - The target hash (block difficulty)

GAMEPLAY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Machine idle — coin slot glowing, handle ready

2. User pulls lever (click/drag interaction)
   - Lever animates down with satisfying click
   - Reels start spinning with characteristic sound

3. Reels stop one by one (left to right)
   - Each matching character = lights flash, cha-ching
   - More leading zeros = better result
   - The number of matches directly correlates to difficulty

4. RESULT DISPLAY
   Matching chars highlighted in gold
   Score shown as difficulty value
   
   "3 matching characters! Difficulty: 4.2B"
   vs
   "If you had matched all 64 characters...
    that would be a BLOCK! (reward: 3.125 BTC)"

5. BLOCK FOUND: All 64 characters match
   Machine goes haywire — lights flash, coins pour out,
   jackpot alarm sounds, coins literally overflow the screen

VISUAL QUALITY:
- Realistic metallic slot machine body with reflections
- Chrome handle with spring physics
- LED light strips that animate with results
- Satisfying mechanical sounds for each reel stop
```

### 5.5 Scratch Card — `/games/scratch`

```
VISUAL: A golden scratch card with Bitcoin branding

INTERACTION: User physically scratches (mouse drag / touch)
the gray coating to reveal their weekly difficulty result.

BEHIND THE SCRATCH:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The card has several zones:

ZONE 1: "YOUR BEST HASH"
  Scratch to reveal the full hash (hex string)
  Revealed character by character as you scratch

ZONE 2: "YOUR DIFFICULTY"
  Large number that appears
  Animated counter spinning to final value

ZONE 3: "YOUR RANK"
  "#12 this week"

ZONE 4: "PRIZE"
  For lottery mode: actual BTC amount
  For solo mode: badge earned / XP gained

SCRATCH PHYSICS:
- Canvas-based scratch effect
- Metallic particles fly off as you scratch
- Satisfying ASMR-like scratch sound
- Haptic feedback on mobile (vibration)
- Progressive reveal creates suspense

POST-SCRATCH:
- Card flips to show full results on the back
- Shareable image generated
- "Scratch again next Sunday!"
```

---

## 6. Animation System

### 6.1 Global Animation Principles

```
TIMING CURVES (Inspired by Apple's spring animations):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Smooth:       cubic-bezier(0.25, 0.1, 0.25, 1.0)    — standard transitions
Snappy:       cubic-bezier(0.2, 0, 0, 1.0)           — button clicks, card lifts
Bouncy:       spring(stiffness: 300, damping: 20)     — badge reveals, notifications
Dramatic:     cubic-bezier(0.7, 0, 0.3, 1.0)         — game results, block found
Gentle:       cubic-bezier(0.4, 0, 0.2, 1.0)         — page transitions, fades

DURATION GUIDELINES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Micro (hover, focus):         100-150ms
Small (button, toggle):       200-250ms
Medium (card, modal):         300-400ms
Large (page transition):      400-600ms
Dramatic (game result):       800-2000ms
Epic (block found):           3000-5000ms
```

### 6.2 Page Transitions

```
ROUTE CHANGES:
- Content area crossfades (300ms)
- New page content slides up subtly (translateY: 20px → 0)
- Sidebar active indicator slides vertically to new position (spring)

MODAL OPENS:
- Backdrop fades in (200ms, black at 60% opacity)
- Modal scales from 0.95 → 1.0 + fades in (300ms, bouncy spring)
- Content inside modal staggers in (50ms delay between elements)

MODAL CLOSES:
- Modal scales 1.0 → 0.95 + fades out (200ms)
- Backdrop fades out (200ms)
```

### 6.3 Special Event Animations

**BLOCK FOUND BY YOU — The Ultimate Animation:**
```
This is the rarest and most rewarding moment. It must be UNFORGETTABLE.

SEQUENCE (5-8 seconds total):

0.0s  — Everything pauses. Music/sounds fade out.
0.3s  — Screen edges start glowing gold
0.5s  — A deep bass rumble sound begins
0.8s  — The golden glow pulses inward
1.0s  — FLASH — screen goes bright white for 200ms
1.2s  — Dark background returns, but now has gold particle rain
1.5s  — Giant Bitcoin symbol materializes in center (3D, rotating)
2.0s  — Text appears below: "YOU FOUND A BLOCK"
        (Typewriter effect, each letter has a small flash)
2.5s  — Block height number flies in: "#891,234"
3.0s  — Reward amount falls from above with weight: "3.125 BTC"
        (Physically simulated — bounces slightly on landing)
3.5s  — Equivalent fiat value fades in below: "≈ $312,500"
4.0s  — Confetti cannons from both sides of screen
        (mix of orange Bitcoin B shapes and gold sparkles)
4.5s  — Badge earned card slides in (if first block)
5.0s  — Buttons appear: [Share This Moment] [View Block Details]

SOUND DESIGN for this sequence:
- Deep bass rumble building
- Bright bell chime on flash
- Orchestral swell during reveal
- Crowd cheering on confetti
- Cash register "cha-ching" on reward amount

NOTE: This entire animation should be replayable from their
profile history. Users will want to relive this forever.
```

**NEW PERSONAL BEST DIFFICULTY:**
```
0.0s  — Difficulty meter bar jumps forward
0.1s  — Screen has a brief orange tint flash (100ms)
0.2s  — Particle burst from the bar's new position
0.3s  — Previous best number counts up to new value (300ms)
0.5s  — "🎉 New Personal Best!" toast slides in from top
0.6s  — If it's also weekly/monthly best: additional gold sparkle
0.8s  — Everything settles, toast auto-dismisses after 3s

SOUND: Satisfying "level up" chime (think Zelda item get, but subtle)
```

**BADGE EARNED:**
```
0.0s  — Toast notification begins sliding in from top-right
0.2s  — Badge icon in toast does a 360° spin
0.4s  — Toast fully visible with badge name + icon
0.5s  — "+50 XP" floats upward from toast and fades
3.0s  — Toast auto-dismisses (slide out)

If user taps the toast:
- Full badge reveal animation plays (see Section 4.7)
```

**STREAK MILESTONE:**
```
When reaching streak multiples of 4 (4, 8, 12, 16...):
0.0s  — Fire emoji 🔥 appears at cursor/center
0.2s  — Fire grows larger
0.4s  — Fire morphs into a number (the streak count)
0.6s  — "12-Week Streak! 🔥🔥🔥" text appears
0.8s  — Fire particles disperse outward
1.0s  — Counter settles in UI

SOUND: Crackling fire intensifying, then a satisfying "whoosh"
```

**LEVEL UP:**
```
0.0s  — XP bar fills completely
0.3s  — XP bar flashes white
0.5s  — Level number explodes and reforms as new number
0.8s  — "LEVEL 8: Difficulty Hunter" text sweeps in
1.0s  — New level perks list fades in below
1.5s  — Subtle fireworks behind the text
2.0s  — XP bar resets (empties) with new target

SOUND: Ascending chime sequence (do-re-mi-fa-sol)
```

---

## 7. Notification & Reward System

### 7.1 Notification Types & Designs

```
TOAST NOTIFICATIONS (Top-right, stack vertically):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Mining:
┌──────────────────────────────────┐
│ 🟢 Worker Online                 │  (green left border)
│ bitaxe-living-room connected     │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ 🔴 Worker Offline                │  (red left border)
│ bitaxe-bedroom disconnected 2m   │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ 💎 New Best Difficulty!          │  (orange left border + glow)
│ 4,231,847,293 — Your new record!│
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ 🧊 Block Found!                  │  (gold border, animated sparkle)
│ SatoshiFan42 found Block 891234! │
│ [View Block →]                   │
└──────────────────────────────────┘

Gamification:
┌──────────────────────────────────┐
│ 🎖️ Badge Earned!                 │  (rarity-colored border)
│ [Badge Icon] "Megahash"          │
│ +100 XP                          │
└──────────────────────────────────┘

┌──────────────────────────────────┐
│ 🔥 Streak Extended!              │  (orange border)
│ 12-week mining streak!           │
└──────────────────────────────────┘

Competition:
┌──────────────────────────────────┐
│ ⚽ Match Starting!                │  (cyan border)
│ 🇵🇹 Portugal vs 🇪🇸 Spain — NOW  │
│ [Watch Live →]                   │
└──────────────────────────────────┘

BELL ICON NOTIFICATION CENTER (Dropdown panel):
- Grouped by category
- Unread indicator (orange dot)
- Each item has icon, text, timestamp, action
- "Mark all as read" at top
```

### 7.2 Push Notifications (Mobile / Web Push)

```
CRITICAL (Always send):
- Block found by you
- Worker offline for > 30 minutes
- Streak about to expire (< 24h remaining in week)

HIGH (Default on, user can disable):
- New personal best difficulty
- Badge earned
- World Cup match starting (if registered)
- Weekly lottery results ready

MEDIUM (Default off, user can enable):
- Block found by any miner on the platform
- Leaderboard position change
- Cooperative member activity
- Education track recommendation

NEVER SEND:
- Individual share submissions
- Minor stat changes
- Marketing
```

---

## 8. Sound Design

### 8.1 Sound Palette

```
AMBIENT (Very subtle, toggleable in settings):
- Dashboard: Soft electronic hum with occasional "data" blips
- Game Hub: Distant carnival/arcade ambiance
- World Cup: Stadium crowd murmur

UI SOUNDS (Short, satisfying, non-intrusive):
- Button click:      Soft "tock" (like Apple keyboard)
- Toggle on:         Bright "pip"
- Toggle off:        Soft "pup"
- Navigation:        Subtle "whoosh" (200ms)
- Card hover:        Near-silent "tik"
- Notification in:   Gentle bell chime
- Share received:    Barely audible "tick" (like a clock)

REWARD SOUNDS (Memorable, dopamine-triggering):
- New best diff:     Rising chime sequence (3 notes)
- Badge earned:      Triumphant short fanfare (1s)
- Level up:          Ascending arpeggio (2s)
- Streak milestone:  Fire whoosh + deep bell
- Block found:       EPIC orchestral hit + crowd roar (3s)

GAME SOUNDS (Immersive, per-game):
- Hammer:     WHACK impact, crowd reactions, bell ring
- Horse Race: Galloping hooves, crowd cheering, announcer
- Slots:      Reel spinning, coin clinks, jackpot alarm
- Scratch:    Scratching ASMR, reveal sparkle

IMPORTANT: All sounds off by default for new users.
Toggle in settings: Off / Subtle / Full
```

---

## 9. Mobile Design

### 9.1 Responsive Breakpoints

```
Mobile:      320px — 767px     (Single column, tab bar navigation)
Tablet:      768px — 1023px    (Sidebar collapses, 2-column grid)
Desktop:     1024px — 1440px   (Full sidebar, 3-4 column grids)
Wide:        1441px+           (Max-width content, extra whitespace)
```

### 9.2 Mobile Navigation

```
Replace sidebar with bottom tab bar (iOS style):

┌─────────────────────────────────────────────┐
│                                               │
│               [Page Content]                  │
│                                               │
├─────────────────────────────────────────────┤
│  ⛏️       🎮       🏆       🎖️       👤    │
│ Mine     Games    Cup     Badges   Profile │
│                                               │
│  Active tab: orange icon, text               │
│  Inactive: gray icon, no text                │
│  Badge on Games if lottery ready             │
│  Badge on Badges if new badge earned         │
└─────────────────────────────────────────────┘

"Mine" tab shows condensed dashboard
Pull-to-refresh for latest data
Haptic feedback on tab switch
```

### 9.3 Mobile-Specific Patterns

```
CARDS:        Full-width, stacked vertically
CHARTS:       Horizontal scroll or simplified sparklines
GAMES:        Full-screen takeover, portrait optimized
LEADERBOARD:  Simplified columns (rank, name, diff only)
DIFFICULTY METER: Vertical orientation on mobile (tall thermometer)
BADGES:       2-column grid instead of 3-4
SHARE FEED:   Simplified — just diff value and timestamp
```

---

## 10. Onboarding Flows

### 10.1 First-Time User (Bitcoiner)

```
STEP 1: Connect Wallet
  "Connect your Bitcoin wallet to get started"
  [Instructions for signing a message]

STEP 2: Set Your Profile
  "What should we call you?"  [Display Name input]
  "Where are you mining from?" [Country selector with flag preview]
  
STEP 3: Connect Your Miner (THE KEY STEP)
  "Point your miner at our stratum server"
  ┌──────────────────────────────────────┐
  │ stratum+tcp://mine.thebitcoingame.com:3333  │
  │ Username: [your-btc-address]                │
  │ Password: x                                 │
  │                                              │
  │ [Copy Configuration]                         │
  └──────────────────────────────────────┘
  
  Device-specific guides:
  [Bitaxe] [Antminer] [Whatsminer] [NerdAxe] [Other]
  
  "Waiting for your first share..."
  [Animated radar scanning animation]
  
  When first share arrives:
  🎉 "Your miner is connected!"
  Badge earned: "First Hash" (with full animation)
  
STEP 4: Tour (Optional, skippable)
  Spotlight tour highlighting:
  1. Difficulty Meter ("This is where the magic happens")
  2. Games tab ("Check here every Sunday")
  3. Badge collection ("Earn these as you mine")
  4. Leaderboard ("See how you rank globally")
```

### 10.2 First-Time User (NoCoiners — Gifted Bitaxe)

```
SIMPLIFIED FLOW — Maximum hand-holding, minimum jargon

STEP 1: Welcome
  "Someone gave you a Bitcoin miner! 🎁"
  "Let's set it up and start playing."
  
  [Animated Bitaxe illustration]

STEP 2: Plug It In
  "Your Bitaxe should already be configured.
   Just plug it into power and WiFi."
  
  [Setup animation showing physical steps]
  
  "Waiting for your miner..."
  
STEP 3: Choose a Username
  "Pick a fun name for the leaderboard"
  (No wallet connection needed initially — 
   address is preconfigured on the Bitaxe)

STEP 4: The Lottery Explained
  "Your miner is now searching for a Bitcoin block.
   It's like a lottery — running 24/7.
   Every Sunday, we show you how close you got."
  
  [Mini Hammer Game demo]
  
  "If you ever find a block, you win the Bitcoin reward!"
  "Current prize: ~$300,000"

STEP 5: Dashboard (Simplified NoCoiners Mode)
  - Show only: hashrate, best difficulty, weekly game
  - Hide: technical details, shares, advanced stats
  - Prominent: "Want to learn more about Bitcoin?" link
  
  Mode can be switched to full in settings
```

---

## 11. Micro-Interactions Catalog

```
Every small interaction should feel intentional and satisfying:

BUTTONS:
- Hover: scale(1.02), background lightens, cursor pointer
- Click: scale(0.98) for 100ms, then back to 1.0
- Primary buttons: orange glow shadow appears on hover
- Disabled: 50% opacity, cursor not-allowed, no hover effect

CARDS:
- Hover: translateY(-2px), border brightens, shadow deepens
- Click: scale(0.99) brief compression
- Interactive cards: subtle pointer cursor + right arrow hint

LINKS:
- Hover: underline appears (sliding animation left-to-right)
- Color: Cyan (#58A6FF), visited: slightly muted

TOGGLES:
- iOS-style switch with spring physics
- Track color: off=gray, on=orange
- Thumb overshoots slightly (bouncy spring)

INPUTS:
- Focus: cyan border + cyan glow shadow
- Error: red border + shake animation (3 cycles)
- Success: green border + checkmark icon appears

TOOLTIPS:
- Appear after 500ms hover delay
- Fade in + scale from 0.9 to 1.0
- Arrow pointing to trigger element
- Dismiss on mouse leave (100ms fade out)

LOADING STATES:
- Skeleton screens (animated gradient shimmer, not spinners)
- Skeleton shapes match the content they'll become
- Shimmer: left-to-right sweep, 1.5s duration, infinite

NUMBER ANIMATIONS:
- All numbers that change use count-up/count-down animation
- Duration: 500ms for small changes, 1000ms for large
- Easing: ease-out (fast start, gentle stop)
- Always use tabular-nums font feature for alignment

SCROLL:
- Smooth scroll (scroll-behavior: smooth)
- Pull-to-refresh on mobile (custom animation, not browser default)
- Infinite scroll for lists (share history, leaderboard)
- Scroll position remembered per route

COPY TO CLIPBOARD:
- Click: icon changes from "copy" to "check" with morph animation
- Tooltip: "Copied!" appears briefly
- Subtle haptic on mobile
```

---

## 12. Accessibility

```
WCAG 2.1 AA COMPLIANCE:

COLOR:
- All text meets 4.5:1 contrast ratio minimum
- Never rely on color alone to convey information
- Colorblind-safe palette (tested with Sim Daltonism)
- High contrast mode toggle in settings

MOTION:
- Respect prefers-reduced-motion media query
- Reduced motion mode: no particle effects, no spring animations,
  simple fade transitions instead
- Game animations: simplified versions with just result display
- Streak fires become static icons in reduced motion

KEYBOARD:
- Full keyboard navigation (Tab, Enter, Escape, Arrow keys)
- Visible focus indicators (cyan ring, 2px offset)
- Skip to main content link
- Modal focus trap
- Game controls: spacebar to trigger actions

SCREEN READERS:
- Semantic HTML throughout
- ARIA labels on all interactive elements
- Live regions for real-time updates (share feed, notifications)
- Alt text for all badge artwork
- Game results announced as text (not just animation)

TEXT:
- Minimum touch target: 44x44px
- Resizable text up to 200% without layout breaking
- No text in images (except badge artwork, which has alt text)
```

---

## 13. Design Tooling & Handoff

```
DESIGN TOOLS:
- Figma (primary design tool)
- Figma with auto-layout + component variants
- Design token JSON export for dev consumption

COMPONENT LIBRARY:
- Built in Figma as a shared library
- Mirrors the React component library 1:1
- Every component has: default, hover, active, disabled, focus states
- Every component has light descriptions of animation behavior

PROTOTYPING:
- Figma prototypes for key flows (onboarding, game experiences)
- Framer for high-fidelity animation prototyping
- ProtoPie for game interaction prototyping

HANDOFF:
- Design tokens exported as CSS custom properties + Tailwind config
- Component specs with exact spacing, colors, typography
- Animation specs with duration, easing, and keyframe descriptions
- Lottie files for complex SVG animations
- Sound files provided as .mp3 (compressed) and .wav (source)

ASSET FORMAT:
- Icons: SVG (Phosphor + custom)
- Badge artwork: PNG @1x, @2x, @3x + 3D model files (.glb) for interactive view
- Illustrations: SVG or Lottie JSON
- Backgrounds: WebP (compressed) or CSS gradients
- Game assets: Sprite sheets (PixiJS) or 3D models (Three.js .glb)
```

---

## Summary: The Design Promise

Every pixel of The Bitcoin Game exists to make solo mining feel like the most exciting game in the world. The dashboard isn't a monitoring tool — it's a scoreboard. The difficulty meter isn't a chart — it's a progress bar in an infinite game. The weekly lottery isn't a data visualization — it's a carnival ride.

When a user opens this app on a Sunday evening to check their weekly results, they should feel the same anticipation as checking lottery numbers. When they earn a badge, it should feel as satisfying as unlocking an achievement on PlayStation or Xbox. When their country is playing in the World Cup, they should feel national pride driving them to plug in one more Bitaxe.

**The interface IS the game. The design IS the product. Ship beautiful, or don't ship at all.**

---

*Design System v1.0 — The Bitcoin Game*
*"Decentralizing hashrate, one game at a time." ⛏️🎮*