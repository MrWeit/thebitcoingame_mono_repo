# Phase 5 — Game Experiences

## Duration: ~3.5 weeks
## Dependencies: Phase 4 (Dashboard & Mining Pages)
## Goal: Build all four weekly lottery games — the heart of the product's engagement loop

---

## 5.1 Game Hub — `/games`

**The arcade entrance. This page should feel like walking into a neon-lit game room.**

### Visual Design

- Background: subtle animated arcade-style neon grid (faint Tron aesthetic, very tasteful — not overwhelming)
- CSS: thin lines on dark background with slow drift animation

### Header

```
"This Week's Results Are Ready!"
"Your best hash: 4,231,847,293 - Network target: 100,847,293,444,000"
```

### Game Selection Grid

2x2 grid of game cards, each representing one lottery game:

| Game | Icon | Tagline |
|------|------|---------|
| The Hammer | Hammer icon | "How high can your hash launch the weight?" |
| Horse Race | Horse icon | "Watch your difficulty race against the odds" |
| Slot Machine | Slot machine icon | "Visual hash matching on spinning reels" |
| Scratch Card | Ticket icon | "Scratch to reveal your weekly difficulty" |

**Card Interactions:**
- 3D perspective tilt on hover (react-tilt / CSS perspective transforms)
- Each card has a looping preview animation in the icon area (PixiJS sprite or CSS animation)
- "PLAY NOW" button on each card (primary orange)
- Subtle holographic shimmer effect on card surface

### Past Results Section

- Below game grid: horizontal scroll of past week cards
- Each past week: thumbnail showing the game played + result
- Click to replay the animation with that week's data

### Tasks

- [ ] Build `<GameHub>` page with neon grid background
- [ ] Build `<GameCard>` with 3D perspective tilt and preview animation
- [ ] Build past results horizontal scroll section
- [ ] Create the core ratio calculation utility:
  ```typescript
  function calculateProgressRatio(bestDiff: number, networkDiff: number): number
  ```
- [ ] Set up shared game state (user's weekly data) passed to all games

---

## 5.2 The Hammer Game — `/games/hammer`

**The flagship game. Full-screen cinematic experience.**

### Scene Description

Carnival strongman game at a Bitcoin-themed fair:
- Background: carnival/fair atmosphere — string lights (orange tint), dark sky with Bitcoin symbols as stars, subtle parallax layers
- The Tower: tall vertical structure (center), segments marked with difficulty milestones (1K -> 1M -> 1B -> 1T -> 10T -> 100T -> BLOCK!)
- The Puck: glowing orange disc that travels up the tower
- The Mallet: animated swing at the bottom
- Golden bell at the top with Bitcoin logo

### Gameplay Flow

**1. INTRO (2s)**
- Camera pans up the tower from bottom to top
- Bell glints at the top
- Text fades in: "Let's see how close you got this week!"

**2. ANTICIPATION (1s)**
- Button appears at bottom: "SWING THE HAMMER"
- Button has a pulsing orange glow
- Ambient crowd murmur sound starts

**3. THE SWING (on user click)**
- Mallet swings down with WHACK sound
- Screen shakes briefly (CSS transform vibration, 100ms)
- Puck launches upward from the platform
- Speed proportional to `progress_ratio = best_diff / network_diff`
- As puck passes milestone markers, text labels zoom past with woosh sounds
- Particle trail behind the puck intensifies as it rises
- Crowd gasps/cheers at each milestone passed
- Camera follows the puck upward (viewport scrolls or scene pans)

**4a. NORMAL RESULT (puck stops partway)**
- Puck decelerates with realistic physics (spring + friction)
- Wobbles at peak height, then stabilizes
- Difficulty number counter animates to final value (1s count-up)
- Result text: "4.2 Billion — That's higher than 94% of miners!"
- Crowd applause sound
- Appropriate confetti amount (more confetti = higher result)

**4b. BLOCK FOUND (puck hits the bell)**
- Puck SLAMS into bell at top
- MASSIVE bell ring sound (reverberating)
- Screen flashes white for 200ms
- Fireworks explode everywhere (full particle system)
- Text: "YOU FOUND A BLOCK!"
- BTC reward amount falls from top with physics bounce: "3.125 BTC"
- Crowd goes absolutely wild (roaring cheer sound)
- Prompt: "Share this moment!"

**5. POST-GAME**
- "This Week's Rankings" — where the user placed
- Buttons: [Play Again] [Share Result] [Try Different Game]
- "Play Again" replays the animation with the same data (it's predetermined)

### Technical Implementation

| Aspect | Technology | Notes |
|--------|-----------|-------|
| Rendering | Three.js (React Three Fiber) OR PixiJS | 3D preferred for premium feel, 2D fallback OK |
| Physics | Simple spring simulation | Puck: initial velocity based on ratio, deceleration curve |
| Sound | Howler.js | Pre-loaded, positional audio if 3D |
| Particles | Three.js particles or canvas 2D particles | Trail behind puck, confetti on result |
| Animation duration | 4-6 seconds total | Pacing is critical — not too fast, not too slow |
| Mobile | Touch-to-swing, full-screen portrait | Simplified particles for performance |

### Assets Needed

- [ ] Tower model/sprite with milestone markers
- [ ] Puck model/sprite with glow shader
- [ ] Mallet model/sprite with swing animation
- [ ] Bell model/sprite at top
- [ ] Background layers for parallax (stars, lights, fair elements)
- [ ] Particle textures (orange dots, confetti shapes)
- [ ] Sound: crowd murmur, whack, whoosh, crowd reactions, bell ring, fireworks

### Tasks

- [ ] Build `<HammerGame>` full-screen game component
- [ ] Implement tower with logarithmic milestone markers
- [ ] Build puck physics simulation (velocity = f(ratio), deceleration, wobble)
- [ ] Build swing animation (mallet + screen shake)
- [ ] Implement particle trail system
- [ ] Add milestone zoom-past text labels
- [ ] Build result display with count-up number
- [ ] Build block-found variant (bell, flash, fireworks)
- [ ] Build post-game results overlay
- [ ] Build share card generation (screenshot-able result image)
- [ ] Add all sound effects
- [ ] Mobile adaptation (portrait, touch controls, reduced particles)

---

## 5.3 Horse Race — `/games/horse-race`

### Scene Description

Horse racing track viewed from the side, stylized pixel art or low-poly 3D.

- 7 lanes, one per day of the week (Monday through Sunday)
- Each horse named after the day
- Horse colors: Mon=red, Tue=blue, Wed=green, Thu=purple, Fri=orange, Sat=cyan, Sun=gold
- Track has distance markers and finish line

### Data Mapping

Each horse's speed is proportional to the user's best difficulty found on that day:
```typescript
const horseSpeeds = {
  monday:    bestDiffOnMonday / maxDayDiff,
  tuesday:   bestDiffOnTuesday / maxDayDiff,
  // ... etc
  sunday:    bestDiffOnSunday / maxDayDiff,
};
```

### Gameplay Flow

**1. STARTING GATE (2s)**
- Horses at the gate, jittering with anticipation (subtle idle animation)
- Announcer text: "And they're OFF!"
- Starting gun sound effect

**2. THE RACE (10-15s)**
- Horses gallop at different speeds across the track
- Camera tracks alongside the lead horse (viewport pans right)
- Live commentary text bubbles:
  - "Monday is pulling ahead!"
  - "Wednesday is making a move!"
  - "It's neck and neck!"
- Crowd noise intensifies as horses approach the finish

**Tension Building:**
- Even though the result is predetermined, the animation builds suspense
- Horses stay relatively close for the first 60% of the race
- Differentiation increases in the final 40%
- The eventual winner pulls ahead dramatically near the finish

**3. FINISH**
- Winning horse crosses the line with a burst of particles
- Photo finish animation if top 2 are close
- Results board slides in:
  ```
  1st: Wednesday  — Diff: 4.2B
  2nd: Monday     — Diff: 3.8B
  3rd: Friday     — Diff: 2.1B
  ...
  ```
- "Your best race was on Wednesday!"

**4. BLOCK FOUND VARIANT**
- The winning horse transforms into a unicorn mid-race
- Unicorn grows wings and flies across the finish line
- Extra dramatic particle effects and crowd reaction

### Tasks

- [ ] Build `<HorseRace>` full-screen game component
- [ ] Design 7 horse sprites (day-colored) with gallop animation
- [ ] Build track and lane layout
- [ ] Implement race physics: speed mapping from difficulty data + suspense curve
- [ ] Build camera tracking/panning system
- [ ] Add commentary text bubbles
- [ ] Build finish line / photo finish animation
- [ ] Build results board overlay
- [ ] Build block-found unicorn variant
- [ ] Add sound effects: galloping, crowd, starting gun, cheering
- [ ] Mobile: simplified track, portrait orientation, touch to start

---

## 5.4 Slot Machine — `/games/slots`

### Scene Description

Classic 3-reel slot machine, Bitcoin-themed. Premium look — realistic metallic body, chrome details, LED strips.

### Data Mapping

Reels display hexadecimal characters (0-9, a-f). The reels represent characters from:
- User's best hash this week
- The target hash (network difficulty)
- Number of matching leading characters = the visual "score"

### Gameplay Flow

**1. IDLE**
- Machine sitting in a spotlight, chrome reflections
- Coin slot glowing with subtle pulse
- Handle on the right side, slightly bobbing

**2. PULL LEVER (click/drag interaction)**
- Handle animated down with satisfying mechanical click
- Reels start spinning with characteristic slot machine whir sound
- LED lights on machine start cycling

**3. REEL STOP (one by one, left to right)**
- Each reel decelerates and snaps to a hex character
- Each matching character (compared to target): lights flash, "cha-ching" sound
- Matching characters highlighted in gold
- Non-matching characters stay white
- The more matching characters = higher difficulty share

**4. RESULT**
- Final display: matched characters count
- Score: difficulty value with count-up animation
- "3 matching characters! Difficulty: 4.2B"
- Comparison text: "If you matched all 64 characters... that would be a BLOCK!"

**5. BLOCK FOUND (jackpot)**
- All characters match (64 matching hex chars)
- Machine goes haywire: lights flash rapidly, alarms sound
- Coins pour out of the machine, overflowing the screen
- "JACKPOT" text flashes

### Tasks

- [ ] Build `<SlotMachine>` full-screen game component
- [ ] Design slot machine body with metallic materials (Three.js or SVG/CSS)
- [ ] Build reel spinning animation with snap-to-character physics
- [ ] Implement hex character matching logic
- [ ] Build per-reel stop animation with highlights for matches
- [ ] Build lever pull interaction (click or drag)
- [ ] Add LED light strip animations
- [ ] Build jackpot variant
- [ ] Add sound effects: mechanical click, reel spin, reel stop, cha-ching, jackpot alarm
- [ ] Mobile: machine rotated or simplified, touch-to-pull

---

## 5.5 Scratch Card — `/games/scratch`

### Scene Description

A golden scratch card with Bitcoin branding, lying on a dark surface with subtle lighting.

### Zones

The card has 4 scratchable zones:

| Zone | Revealed Content |
|------|-----------------|
| "YOUR BEST HASH" | Full hash string (hex), revealed character by character |
| "YOUR DIFFICULTY" | Large number with animated counter |
| "YOUR RANK" | "#12 this week" |
| "PRIZE" | Badge earned / XP gained / BTC amount (lottery mode) |

### Interaction

- User physically scratches the gray coating by mouse drag / touch
- Canvas-based scratch effect (erasing a mask layer to reveal content below)
- Metallic particles fly off as user scratches
- Satisfying ASMR-like scratch sound tied to touch/drag events
- Haptic feedback on mobile (vibration API)
- Progressive reveal creates suspense

### Post-Scratch

- Once >80% of a zone is scratched, the rest auto-reveals with a sparkle
- Once all zones revealed, card flips to show summary on the back
- Shareable image generated from the result
- "Scratch again next Sunday!"

### Tasks

- [ ] Build `<ScratchCard>` full-screen game component
- [ ] Implement canvas-based scratch mask (draw-to-erase pattern)
- [ ] Design card artwork: front (scratchable) and back (results)
- [ ] Build progressive reveal logic (auto-reveal at 80% threshold)
- [ ] Add scratch particle effects (metallic flakes flying off)
- [ ] Build card flip animation for final results
- [ ] Add sound effects: scratch sounds (tied to touch velocity), sparkle reveal
- [ ] Mobile: touch-optimized scratch interaction, haptic feedback
- [ ] Build shareable result card image generation (html2canvas or server-side)

---

## 5.6 Shared Game Infrastructure

### Game Data Provider

All games consume the same data. Build a shared provider:

```typescript
interface WeeklyGameData {
  weekStart: Date;
  weekEnd: Date;
  bestDifficulty: number;
  bestDifficultyTime: Date;
  bestHash: string;
  networkDifficulty: number;
  progressRatio: number;             // bestDiff / networkDiff
  dailyBestDiffs: Record<DayOfWeek, number>;
  totalShares: number;
  weeklyRank: number;
  percentile: number;                // "higher than X% of miners"
  blockFound: boolean;
  blockData?: BlockFoundData;
}
```

### Share Card Generator

All games have a "Share Result" button that generates a shareable image:
- Card with game-specific visual + user's result
- Includes: username, difficulty, rank, game name, week date
- Branded: TheBitcoinGame logo, Bitcoin orange accents
- Sized for social media (1200x630 for link previews, 1080x1080 for square)

### Replay System

- All game results are predetermined (from mining data)
- "Play Again" replays the same animation
- Past weeks' results accessible from Game Hub
- Results stored locally + server-side for history

### Tasks

- [ ] Build `<GameDataProvider>` context with `useGameData()` hook
- [ ] Build `<ShareCardGenerator>` utility
- [ ] Build replay/history system
- [ ] Create game wrapper component that handles full-screen mode, exit, and common UI

---

## 5.7 Deliverables Checklist

- [ ] `/games` — Game Hub with 4 game cards and past results
- [ ] `/games/hammer` — Complete Hammer Game with all states
- [ ] `/games/horse-race` — Complete Horse Race with all states
- [ ] `/games/slots` — Complete Slot Machine with all states
- [ ] `/games/scratch` — Complete Scratch Card with all states
- [ ] Game data provider and shared infrastructure
- [ ] Share card generation for all games
- [ ] All games work on mobile (touch controls, portrait mode)
- [ ] All games have sound effects (loadable, toggleable)
- [ ] Block-found variants for all 4 games
- [ ] Replay functionality for past weeks

---

## Definition of Done

Phase 5 is complete when:
1. All 4 games play from start to finish with real mining data
2. Each game has satisfying animations and sound design
3. Block-found variant works (testable with mock data where blockFound=true)
4. Games work on mobile with touch interactions
5. Results are shareable as image cards
6. Users can replay past weeks' results from the Game Hub
