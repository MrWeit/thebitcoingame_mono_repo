# Phase 8 — Onboarding & Education

## Duration: ~2 weeks
## Dependencies: Phase 3 (Layout & Navigation Shell)
## Goal: Build the connect wallet flow, first-time user onboarding (Bitcoiner + NoCoiners), and education tracks

---

## 8.1 Connect / Login Page — `/connect`

**No email. No password. Pure Bitcoin.**

### Layout

Centered card (max-width: 480px) on canvas background with subtle particle animation.

```
┌──────────────────────────────────────────────────────────┐
│                                                            │
│  [Bitcoin Logo — subtle pulse animation]                   │
│                                                            │
│  "Connect with Bitcoin"                                    │
│  "Sign a message with your Bitcoin wallet to log in."     │
│                                                            │
│  Step 1: Enter Address                                    │
│  ┌────────────────────────────────────────┐               │
│  │  Your Bitcoin Address                    │               │
│  │  [bc1q... or 1... or 3...             ] │               │
│  └────────────────────────────────────────┘               │
│  [Generate Challenge]                                     │
│                                                            │
│  Step 2: Sign the Challenge (appears after Step 1)        │
│  "Sign this message in your wallet:"                       │
│  ┌────────────────────────────────────────┐               │
│  │  Sign in to TheBitcoinGame              │               │
│  │  Nonce: a8f3...                         │  [Copy]      │
│  │  Timestamp: 1707436800                  │               │
│  └────────────────────────────────────────┘               │
│                                                            │
│  Step 3: Paste Signature                                  │
│  ┌────────────────────────────────────────┐               │
│  │  Paste your signature here              │               │
│  │  [                                    ] │               │
│  └────────────────────────────────────────┘               │
│  [Verify & Enter]                                         │
│                                                            │
│  Bottom: "Don't have a wallet? Start here"               │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Step Transitions

- Step 1 -> 2: challenge message slides in from below with spring animation
- Step 2 -> 3: signature input expands/slides in below
- Each step completion: green checkmark animates in on the completed field

### Success Animation

```
On successful signature verification:
0.0s  Card border flashes green
0.3s  Card compresses slightly (scale 0.95)
0.5s  Card explodes into orange particles
0.8s  Particles swirl into a vortex (center of screen)
1.2s  Vortex implodes, dashboard starts fading in behind
1.5s  Dashboard fully visible
1.8s  Welcome banner slides down: "Welcome back, [DisplayName]"
```

### Error States

- Invalid address format: red border + shake + "Please enter a valid Bitcoin address"
- Expired challenge: orange warning + "Challenge expired. Generate a new one."
- Invalid signature: red border + shake + "Signature doesn't match. Try again."
- Each error has a subtle screen-shake (3 oscillations, 300ms)

### Tasks

- [ ] Build `/connect` page with 3-step progressive form
- [ ] Build step transition animations
- [ ] Implement address validation (bc1q, 1..., 3... format check)
- [ ] Build challenge display card with copy button
- [ ] Build success explosion/vortex animation
- [ ] Build error state animations (shake, red border)
- [ ] Handle "Don't have a wallet?" link to education content
- [ ] Mobile: full-screen card, no particles on background for performance

---

## 8.2 First-Time Onboarding — Bitcoiner Flow

Triggered after first successful login when user has no profile set up.

### Step 1: Welcome

```
"Welcome to The Bitcoin Game!"
"Let's get you set up in 60 seconds."
[Continue →]
```

### Step 2: Profile Setup

```
"What should we call you?"
[Display Name input — max 64 chars]

"Where are you mining from?"
[Country selector with flag preview]
(Country is used for World Cup eligibility)
```

### Step 3: Connect Your Miner

**THE KEY STEP — This is where the user points their hardware at us.**

```
"Point your miner at our stratum server"

┌──────────────────────────────────────────┐
│ URL:       stratum+tcp://mine.thebitcoingame.com:3333  [Copy]
│ Username:  [your-btc-address]                          [Copy]
│ Password:  x                                           [Copy]
│
│ [Copy Full Configuration]
└──────────────────────────────────────────┘

Device-specific guide tabs:
[Bitaxe] [Antminer] [Whatsminer] [NerdAxe] [Other]

Each tab: step-by-step instructions with screenshots
for that specific device type.
```

### Step 4: Waiting for First Share

```
"Waiting for your first share..."
[Animated radar scanning animation — concentric rings pulsing outward]

"Make sure your miner is powered on and configured."

[Skip for now →] (allows user to proceed without connecting)
```

**When first share arrives:**
```
0.0s  Radar animation stops
0.3s  Green pulse expands from center
0.5s  "Your miner is connected!" text appears
0.8s  Confetti burst
1.0s  Badge earned: "First Hash" (full badge animation from Phase 6)
2.0s  [Continue to Dashboard →]
```

### Step 5: Tour (Optional, Skippable)

Spotlight/coach-mark tour highlighting 4 key areas:

1. **Difficulty Meter**: "This is where the magic happens. Your best hash of the week lives here."
2. **Games tab**: "Check here every Sunday to play the weekly lottery with your mining results."
3. **Badge collection**: "Earn badges as you mine. Collect them all!"
4. **Leaderboard**: "See how you rank against miners worldwide."

Implementation: overlay with spotlight hole (CSS mask) + tooltip positioned next to highlighted element. Click to advance, "Skip Tour" button.

### Tasks

- [ ] Build onboarding flow as a multi-step modal/wizard
- [ ] Build profile setup step (name + country)
- [ ] Build stratum config display with per-device guide tabs
- [ ] Build waiting-for-share radar animation
- [ ] Build first-share celebration (connects to badge system from Phase 6)
- [ ] Build spotlight/coach-mark tour component
- [ ] Build "Skip" functionality for each step
- [ ] Store onboarding completion flag (don't show again)

---

## 8.3 First-Time Onboarding — NoCoiners Flow

**Triggered when a user arrives from a gift link or pre-configured Bitaxe.**

This flow uses maximum hand-holding and minimum jargon.

### Step 1: Welcome

```
"Someone gave you a Bitcoin miner!"
"Let's set it up and start playing."

[Illustrated Bitaxe image — friendly, approachable]

[Get Started →]
```

### Step 2: Plug It In

```
"Your Bitaxe should already be configured.
 Just plug it into power and WiFi."

[Step-by-step illustration animation:
 1. Unbox
 2. Plug USB-C power
 3. Connect to WiFi (instructions)
 4. Wait for lights]

"Waiting for your miner..."
[Same radar animation as Bitcoiner flow]
```

### Step 3: Choose a Username

```
"Pick a fun name for the leaderboard"
[Display Name input]

(No wallet connection needed initially —
 address is preconfigured on the Bitaxe by the gifter)
```

### Step 4: The Lottery Explained

```
"Your miner is now searching for a Bitcoin block.
 It's like a lottery — running 24/7.
 Every Sunday, we show you how close you got."

[Mini Hammer Game demo — auto-plays with sample data]

"If you ever find a block, you win the Bitcoin reward!"
"Current prize: ~$300,000"

[Cool! Let's Go →]
```

### Step 5: Simplified Dashboard

NoCoiners get a simplified dashboard that shows only:
- Hashrate (with simple explanation: "Your miner is working!")
- Best difficulty this week (with visual meter)
- Weekly game CTA ("Play your lottery on Sunday!")
- Hide: technical details, shares, advanced stats

Prominent link: "Want to learn more about Bitcoin?" -> Education tracks

Simplified mode can be switched to full mode in settings.

### Tasks

- [ ] Build NoCoiners onboarding flow (separate from Bitcoiner flow)
- [ ] Build friendly welcome screen with Bitaxe illustration
- [ ] Build plug-in guide with step-by-step illustrations
- [ ] Build simplified username-only registration (no wallet signing)
- [ ] Build lottery explanation screen with mini game demo
- [ ] Build simplified dashboard mode (less technical, more game-focused)
- [ ] Build toggle in settings to switch between simplified/full mode
- [ ] Detect if user arrived from gift link and route to NoCoiners flow

---

## 8.4 Education Pages

### Education Landing — `/education` (public) and `/learn` (authenticated)

```
┌────────────────────────────────────────────────────────────┐
│  "Learn Bitcoin"                                             │
│  "From mining basics to running your own node"              │
│                                                              │
│  LEARNING TRACKS                                             │
│                                                              │
│  ┌──────────────────────────────┐                           │
│  │  Track 1                      │                           │
│  │  "What's Happening on My      │                           │
│  │   Bitaxe?"                    │                           │
│  │                                │                           │
│  │  5 lessons • ~20 min          │                           │
│  │  [████████░░] 80% complete    │                           │
│  │                                │                           │
│  │  [Continue →]                  │                           │
│  └──────────────────────────────┘                           │
│                                                              │
│  ┌──────────────────────────────┐                           │
│  │  Track 2                      │                           │
│  │  "Understanding Bitcoin"      │                           │
│  │  8 lessons • ~45 min          │                           │
│  │  [░░░░░░░░░░] Not started    │                           │
│  │  [Start →]                    │                           │
│  └──────────────────────────────┘                           │
│                                                              │
│  Track 3: "Securing Your Bitcoin" (5 lessons)              │
│  Track 4: "Running a Node" (6 lessons)                     │
│                                                              │
│  Completing a track = XP + badge eligibility               │
└────────────────────────────────────────────────────────────┘
```

### Track Content

**Track 1: "What's Happening on My Bitaxe?"**

| Lesson | Title | Content Type |
|--------|-------|-------------|
| 1.1 | What is Mining? | Visual explainer using user's actual hashrate |
| 1.2 | What is a Hash? | Interactive demo — type text, see hash change |
| 1.3 | What is Difficulty? | Visual comparison: user's diff vs network |
| 1.4 | The Block Lottery | How probability works in mining |
| 1.5 | Why This Matters for Bitcoin | Decentralization, security, censorship resistance |

**Track 2: "Understanding Bitcoin"**

| Lesson | Title |
|--------|-------|
| 2.1 | What is Money? Why Bitcoin? |
| 2.2 | How Bitcoin Works (blocks, transactions) |
| 2.3 | What is the Halving? |
| 2.4 | Bitcoin vs Traditional Finance |
| 2.5 | What is a Wallet? |
| 2.6 | Sending and Receiving Bitcoin |
| 2.7 | The Lightning Network |
| 2.8 | Bitcoin's Future |

**Track 3: "Securing Your Bitcoin"**

| Lesson | Title |
|--------|-------|
| 3.1 | Hardware Wallets Explained |
| 3.2 | Seed Phrases — Your Master Key |
| 3.3 | Self-Custody Best Practices |
| 3.4 | Setting Up Your First Wallet |
| 3.5 | Backup Strategies |

**Track 4: "Running a Node"**

| Lesson | Title |
|--------|-------|
| 4.1 | Why Run a Node? |
| 4.2 | Hardware Requirements |
| 4.3 | Step-by-Step Node Setup |
| 4.4 | Connecting Your Miner to Your Node |
| 4.5 | Node Maintenance |
| 4.6 | Earn the "Node Runner" Badge |

### Lesson Page — `/learn/:trackId/:lessonId`

```
┌────────────────────────────────────────────────────────────┐
│  Track 1 > Lesson 3                                         │
│  "What is Difficulty?"                                      │
│                                                              │
│  PROGRESS: Lesson 3 of 5                                    │
│  [██████████████░░░░░░░░░░░░░░] 3/5                        │
│                                                              │
│  CONTENT AREA                                                │
│  (Rich text with interactive elements)                      │
│                                                              │
│  - Illustrated explanations                                 │
│  - Interactive demos embedded in content                    │
│  - Highlighted key terms with tooltip definitions           │
│  - Progress checkpoints within long lessons                 │
│                                                              │
│  YOUR MINING CONTEXT                                        │
│  "Your miner currently finds shares at difficulty 1,024.   │
│   The network difficulty is 100,847,293,444,000.           │
│   That means the network is [ratio] times harder than      │
│   your shares."                                              │
│  (Personalized with user's actual data)                    │
│                                                              │
│  BOTTOM BAR                                                  │
│  [← Previous]                    [Mark Complete ✓]          │
│                                                              │
│  On Mark Complete:                                           │
│  - Checkmark animation                                      │
│  - "+100 XP" float-up                                       │
│  - Auto-advance to next lesson                              │
│  - On final lesson: track completion celebration            │
│    + badge check (e.g., "Rabbit Hole" badge)               │
└────────────────────────────────────────────────────────────┘
```

### Tasks

- [ ] Build `/education` public landing page with track cards
- [ ] Build `/learn` authenticated hub with progress tracking
- [ ] Build `/learn/:trackId/:lessonId` lesson view
- [ ] Build progress tracking system (lesson completion stored per user)
- [ ] Build lesson content renderer (markdown + interactive components)
- [ ] Build "Mark Complete" interaction with XP gain animation
- [ ] Build track completion celebration + badge trigger
- [ ] Build interactive demo components:
  - [ ] Hash demo (type text -> see hash)
  - [ ] Difficulty comparison visual
  - [ ] Mining probability calculator
- [ ] Personalize content with user's actual mining data where possible

---

## 8.5 Gift a Bitaxe Page — `/gift`

Public page for Bitcoiners who want to gift a Bitaxe to a nocoiner:

```
┌────────────────────────────────────────────────────────────┐
│  "Give Someone Their First Bitcoin Experience"              │
│                                                              │
│  Step-by-step visual flow:                                  │
│  1. Buy a Bitaxe (link to shop)                            │
│  2. Configure it to mine at thebitcoingame.com             │
│  3. Gift it to a friend or family member                   │
│  4. They plug it in and start playing                      │
│  5. They learn about Bitcoin through the game              │
│                                                              │
│  "You'll earn the 'Orange Piller' badge!"                  │
│                                                              │
│  [Buy a Pre-Configured Bitaxe →] (links to shop)          │
│  [Configure Guide (I already have one) →]                  │
│                                                              │
│  TESTIMONIALS                                                │
│  "I gave my dad a Bitaxe for Christmas..."                 │
│                                                              │
│  STARTER KITS (partnership)                                 │
│  Bitaxe + Hardware Wallet + Metal Seed Backup              │
│  [View Starter Kits →]                                     │
└────────────────────────────────────────────────────────────┘
```

### Tasks

- [ ] Build `/gift` landing page with visual flow illustration
- [ ] Build pre-configuration guide for gifting a Bitaxe
- [ ] Link to shop for Bitaxe purchase
- [ ] Build starter kit display (partnership integration)

---

## 8.6 Deliverables Checklist

- [ ] `/connect` — Bitcoin wallet login with 3-step flow + success animation
- [ ] Bitcoiner onboarding wizard (profile, stratum config, waiting, tour)
- [ ] NoCoiners onboarding wizard (welcome, plug-in, username, explanation)
- [ ] Simplified dashboard mode for NoCoiners
- [ ] `/education` — Public education landing
- [ ] `/learn` — Authenticated education hub with progress tracking
- [ ] `/learn/:trackId/:lessonId` — Lesson view with completion tracking
- [ ] Interactive education demos (hash, difficulty, probability)
- [ ] `/gift` — Bitaxe gifting landing page
- [ ] All flows work on mobile

---

## Definition of Done

Phase 8 is complete when:
1. A new user can log in via Bitcoin message signing end-to-end
2. Bitcoiner onboarding wizard guides user from login to connected miner
3. NoCoiners flow provides a non-technical path to using the platform
4. Education tracks render with progress tracking and XP rewards
5. Interactive demos work (hash demo, difficulty comparison)
6. Gift page provides clear instructions for the Bitaxe gifting use case
