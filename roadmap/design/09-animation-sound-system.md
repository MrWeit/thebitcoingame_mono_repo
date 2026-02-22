# Phase 9 — Animation & Sound System

## Duration: ~2 weeks
## Dependencies: Phase 5 (Game Experiences), Phase 6 (Gamification UI)
## Goal: Polish all animations to production quality, implement the sound engine, build the block-found mega-celebration

---

## 9.1 Animation Timing Curves

### Standard Curves (CSS / Framer Motion)

| Name | Curve | Duration | Use Case |
|------|-------|----------|----------|
| Smooth | `cubic-bezier(0.25, 0.1, 0.25, 1.0)` | 200-300ms | Standard transitions, page fades |
| Snappy | `cubic-bezier(0.2, 0, 0, 1.0)` | 100-200ms | Button clicks, card lifts, toggles |
| Bouncy | `spring(stiffness: 300, damping: 20)` | ~400ms | Badge reveals, notifications, modals |
| Dramatic | `cubic-bezier(0.7, 0, 0.3, 1.0)` | 800-2000ms | Game results, block found reveal |
| Gentle | `cubic-bezier(0.4, 0, 0.2, 1.0)` | 400-600ms | Page transitions, content fades |

### Duration Guidelines

| Category | Duration | Examples |
|----------|----------|---------|
| Micro | 100-150ms | Hover states, focus rings |
| Small | 200-250ms | Button press, toggle, tooltip |
| Medium | 300-400ms | Card expand, modal open, content fade |
| Large | 400-600ms | Page transition, panel slide |
| Dramatic | 800-2000ms | Game result reveal, countdown |
| Epic | 3000-5000ms | Block found celebration |

### Implementation

```typescript
// animation-config.ts
export const timing = {
  smooth: [0.25, 0.1, 0.25, 1.0],
  snappy: [0.2, 0, 0, 1.0],
  dramatic: [0.7, 0, 0.3, 1.0],
  gentle: [0.4, 0, 0.2, 1.0],
} as const;

export const spring = {
  bouncy: { stiffness: 300, damping: 20 },
  stiff: { stiffness: 400, damping: 30 },
  gentle: { stiffness: 200, damping: 25 },
} as const;

export const duration = {
  micro: 0.12,
  small: 0.2,
  medium: 0.35,
  large: 0.5,
  dramatic: 1.2,
  epic: 4.0,
} as const;
```

### Tasks

- [ ] Create centralized animation config file with all curves and durations
- [ ] Create Framer Motion variants for common patterns (fadeIn, slideUp, scaleIn, etc.)
- [ ] Create reusable animation wrapper components:
  - [ ] `<FadeIn>` — opacity 0->1 with optional Y offset
  - [ ] `<StaggerChildren>` — children animate in with configurable delay
  - [ ] `<CountUp>` — animated number counter
  - [ ] `<SpringScale>` — scale with spring physics
- [ ] Build Storybook "Animation" page demonstrating all timing curves

---

## 9.2 Particle System

### Engine

Lightweight particle system for:
- Difficulty meter particles (flowing along the bar)
- Share submission micro-effect (small burst on new share)
- Badge earn explosion (rarity-colored particles outward)
- Block found confetti (full-screen)
- Game effects (hammer trail, horse dust, slot coins)

### Implementation Options

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| Canvas 2D | Fast, lightweight | Limited effects | UI particles (meter, shares) |
| Three.js Points | GPU accelerated, 3D | Heavy dependency | Game scenes, block celebration |
| CSS only | Zero dependency | Limited count, CPU | Simple bursts (<20 particles) |
| tsParticles | Feature-rich, maintained | Bundle size | Confetti, fireworks |

**Recommendation:** Canvas 2D for UI effects + tsParticles for celebrations.

### Particle Presets

| Preset | Count | Colors | Behavior | Used In |
|--------|-------|--------|----------|---------|
| `meterFlow` | 20-50 | Orange, gold | Flow left-to-right along bar | Difficulty meter |
| `shareBurst` | 10-15 | Green/gold | Burst outward from point, fade | Share feed |
| `badgeExplode` | 30-50 | Rarity color | Radial explosion outward | Badge earn |
| `confetti` | 100-200 | Orange, gold, white | Fall from top with rotation | Block found, level up |
| `fireworks` | 50-100 per burst | Gold, orange | Shoot up, explode, trail | Block found |
| `vortex` | 50-100 | Orange | Spiral inward to point | Login success |
| `xpFloat` | 1 | Gold | Single text particle floats up | XP gain |

### Tasks

- [ ] Set up particle system (Canvas 2D for UI + tsParticles for celebrations)
- [ ] Build all particle presets listed above
- [ ] Create `<ParticleBurst>` component (trigger-able via ref/callback)
- [ ] Create `<ConfettiCannon>` component for block found / level up
- [ ] Create `<FloatingText>` component for XP gain display
- [ ] Performance: cap particle count, pool/reuse particles, skip on reduced-motion
- [ ] Mobile: reduce particle counts by 50-70% for performance

---

## 9.3 Block Found Celebration — The Ultimate Animation

**The rarest and most rewarding moment. Must be UNFORGETTABLE.**

### Full Sequence (5-8 seconds)

```
0.0s  Everything pauses. All ambient sounds fade out.
      Current animations freeze.

0.3s  Screen edges start glowing gold (CSS box-shadow inset, animated)

0.5s  Deep bass rumble sound begins (low frequency, building)

0.8s  Golden glow pulses inward (narrowing, intensifying)

1.0s  FLASH — screen goes bright white for 200ms
      (CSS: background flash, opacity overlay)

1.2s  Dark background returns, but now has gold particle rain
      (tsParticles config: falling golden dots, slow, gentle)

1.5s  Giant Bitcoin symbol materializes in center
      (3D model rotating slowly, or SVG with glow effect)
      Scale: 0 -> 1.2 -> 1.0 with spring overshoot

2.0s  Text appears below Bitcoin symbol:
      "YOU FOUND A BLOCK"
      (Typewriter effect, each letter appears with small flash)

2.5s  Block height number flies in from top:
      "#891,234" (spring animation, slight bounce on landing)

3.0s  Reward amount drops from above with physics:
      "3.125 BTC" (heavier spring, bounces on landing)
      Physics: simulated gravity, 1 bounce, settle

3.5s  Fiat equivalent fades in below:
      "~$312,500" (gentle fade, 500ms)

4.0s  Confetti cannons fire from both screen edges
      (Mix of orange Bitcoin "B" shapes and gold sparkles)
      Sound: cannon pop + crowd roar

4.5s  Badge earned card slides in (if first block):
      "Block Finder" legendary badge animation overlay

5.0s  Buttons fade in:
      [Share This Moment] [View Block Details]

TOTAL: ~5 seconds to interactive, ~8 seconds full sequence
```

### Sound Design for Block Found

| Time | Sound | Description |
|------|-------|-------------|
| 0.0s | Silence | Everything fades out |
| 0.5s | Bass rumble | Building low frequency (100-200Hz) |
| 1.0s | Bright bell | Crystal chime on flash (C major) |
| 1.5s | Orchestral swell | Building strings/brass, rising |
| 2.0s | Typewriter clicks | Per-letter sound for text |
| 3.0s | Cash register | "Cha-ching" on reward amount |
| 4.0s | Cannon pops | Two pops for confetti |
| 4.0s | Crowd roar | Stadium-level cheering, sustains 3s |
| 5.0s | Fade to ambient | Gentle fade to normal |

### Replay System

- Block found animation MUST be replayable from profile/blocks history
- "Replay Celebration" button on each block found card
- Replays the full animation with the original data (height, reward, timestamp)
- Users will want to relive this moment forever

### Tasks

- [ ] Build `<BlockFoundCelebration>` as a full-screen overlay component
- [ ] Implement the exact timing sequence above with Framer Motion orchestration
- [ ] Build golden screen-edge glow effect (animated CSS box-shadow/SVG)
- [ ] Build screen flash effect (white overlay, 200ms)
- [ ] Build Bitcoin symbol entrance (3D or SVG with scale spring)
- [ ] Build typewriter text effect component
- [ ] Build physics-based number drop (gravity simulation for "3.125 BTC")
- [ ] Integrate confetti cannon (tsParticles, Bitcoin-B shaped particles)
- [ ] Build replay functionality (store animation data, re-trigger on demand)
- [ ] Coordinate with badge system to trigger "Block Finder" badge
- [ ] Build "Share This Moment" card generation
- [ ] Sound: compose/source all audio clips for the sequence
- [ ] Reduced motion version: simple modal with text, no particles/physics

---

## 9.4 Other Special Event Animations

### New Personal Best Difficulty

```
0.0s  Difficulty meter bar jumps forward (spring animation)
0.1s  Screen has brief orange tint flash (100ms, 10% opacity overlay)
0.2s  Particle burst from bar's new position
0.3s  Previous best number counts up to new value (300ms)
0.5s  Toast: "New Personal Best!" slides in from top
0.6s  If also weekly/monthly best: additional gold sparkle on meter
0.8s  Everything settles, toast auto-dismisses after 3s

Sound: "Level up" chime — short, bright, satisfying
```

### Streak Milestone (4, 8, 12, 16... weeks)

```
0.0s  Fire emoji appears at streak indicator position
0.2s  Fire grows larger (scale 1.0 -> 2.0)
0.4s  Fire morphs into the streak number
0.6s  Text: "12-Week Streak!" appears alongside
0.8s  Fire particles disperse outward
1.0s  Counter settles in UI

Sound: Crackling fire intensifying, then a "whoosh"
```

### Level Up

```
0.0s  XP bar fills to 100%
0.3s  XP bar flashes white
0.5s  Level number explodes (particles) and reforms as new number
0.8s  "LEVEL 8: Difficulty Hunter" text sweeps in
1.0s  Level perks fade in below (staggered)
1.5s  Subtle fireworks behind text
2.0s  XP bar drains empty, new target displayed

Sound: Ascending chime: do-re-mi-fa-sol
```

### Tasks

- [ ] Build personal best difficulty animation
- [ ] Build streak milestone animation
- [ ] Build level up animation
- [ ] Build shared animation trigger system (event bus / context)
- [ ] Ensure all animations can be triggered from WebSocket events

---

## 9.5 Sound Engine

### Architecture

```typescript
// sound-engine.ts
import { Howl, Howler } from 'howler';

type SoundMode = 'off' | 'subtle' | 'full';

class SoundEngine {
  private mode: SoundMode = 'off';  // Default: off for new users
  private sounds: Map<string, Howl>;

  // Sound categories with volume levels
  private volumes = {
    ambient: { subtle: 0.05, full: 0.15 },
    ui:      { subtle: 0.1,  full: 0.3 },
    reward:  { subtle: 0.3,  full: 0.6 },
    game:    { subtle: 0.2,  full: 0.5 },
  };
}
```

### Sound Catalog

**Ambient (very subtle, only in 'full' mode):**

| Sound | Context | Duration | Loop |
|-------|---------|----------|------|
| `ambient-dashboard` | Dashboard page | Continuous | Yes |
| `ambient-arcade` | Game Hub | Continuous | Yes |
| `ambient-stadium` | World Cup pages | Continuous | Yes |

**UI Sounds (short, satisfying):**

| Sound | Trigger | Duration |
|-------|---------|----------|
| `click-tock` | Button click | ~50ms |
| `toggle-on` | Toggle switch on | ~80ms |
| `toggle-off` | Toggle switch off | ~60ms |
| `nav-whoosh` | Page navigation | ~200ms |
| `hover-tick` | Card hover | ~30ms |
| `notification-bell` | Notification arrives | ~400ms |
| `share-tick` | Share received (live feed) | ~30ms |
| `copy-success` | Copy to clipboard | ~100ms |

**Reward Sounds (memorable, dopamine-triggering):**

| Sound | Trigger | Duration |
|-------|---------|----------|
| `best-diff-chime` | New personal best | ~800ms |
| `badge-fanfare` | Badge earned | ~1200ms |
| `level-up-arpeggio` | Level up | ~2000ms |
| `streak-fire-whoosh` | Streak milestone | ~1000ms |
| `block-found-full` | Block found sequence | ~5000ms |

**Game Sounds (per-game, immersive):**

| Sound | Game | Description |
|-------|------|-------------|
| `hammer-whack` | Hammer | Impact sound |
| `hammer-crowd-*` | Hammer | Multiple crowd reaction levels |
| `hammer-bell` | Hammer | Bell ring at top |
| `horse-gallop` | Horse Race | Galloping hooves loop |
| `horse-crowd` | Horse Race | Crowd cheering |
| `horse-gun` | Horse Race | Starting gun |
| `slot-spin` | Slots | Reel spinning |
| `slot-stop` | Slots | Reel snap-stop |
| `slot-match` | Slots | Character match cha-ching |
| `slot-jackpot` | Slots | Jackpot alarm |
| `scratch-asmr` | Scratch Card | Scratching sound |
| `scratch-reveal` | Scratch Card | Sparkle reveal |

### Sound Settings

```
Settings > Sound:

[Toggle] Sound Effects        [Off / Subtle / Full]
[Toggle] Ambient Sounds       [Off / On] (only if effects = full)
[Toggle] Game Sounds          [Off / On]
[Slider] Master Volume        [0-100%]

Default for new users: ALL OFF
```

### Implementation Notes

- **Preload:** All UI sounds + reward sounds preloaded on app init
- **Game sounds:** Lazy-loaded when entering a game page
- **Ambient:** Loaded on demand, crossfade between pages
- **Mobile:** Require user interaction before playing audio (browser policy)
- **Sprite sheets:** Combine small UI sounds into a single audio sprite for fewer HTTP requests
- **Format:** .mp3 (primary) + .ogg (fallback), all <100KB per sound

### Tasks

- [ ] Build `SoundEngine` class with Howler.js
- [ ] Implement sound mode system (off / subtle / full)
- [ ] Create/source all UI sound effects
- [ ] Create/source all reward sound effects
- [ ] Create/source all game sound effects
- [ ] Build sound settings UI in `/settings`
- [ ] Integrate sound triggers into all interactive components
- [ ] Build audio sprite sheet for UI sounds
- [ ] Ensure mobile compatibility (user-interaction-first policy)
- [ ] Preload critical sounds, lazy-load game sounds

---

## 9.6 Reduced Motion Support

All animations must respect `prefers-reduced-motion: reduce`:

### Fallback Behavior

| Animation Type | Full Motion | Reduced Motion |
|---------------|-------------|----------------|
| Page transitions | Crossfade + slide up | Instant show/hide |
| Particle effects | Full particles | Disabled entirely |
| Spring animations | Spring physics | Simple linear transition |
| Game animations | Full sequences | Jump to result screen |
| Number count-up | Animated counter | Instant final value |
| Hover transforms | Scale/translate | Color change only |
| Confetti/fireworks | Full celebration | Static "Congratulations" modal |
| Loading skeletons | Animated shimmer | Static gray blocks |

### Implementation

```typescript
// useReducedMotion.ts
import { useMediaQuery } from 'react-responsive';

export function useReducedMotion(): boolean {
  return useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
}

// Usage in components:
const reduced = useReducedMotion();
const transition = reduced
  ? { duration: 0 }
  : { type: 'spring', stiffness: 300, damping: 20 };
```

### Tasks

- [ ] Build `useReducedMotion()` hook
- [ ] Audit all animation components for reduced-motion fallbacks
- [ ] Test all pages/games in reduced-motion mode
- [ ] Ensure game results are still communicated clearly without animation

---

## 9.7 Deliverables Checklist

- [ ] Centralized animation config (timing curves, durations, spring presets)
- [ ] Reusable animation wrapper components (FadeIn, StaggerChildren, CountUp, SpringScale)
- [ ] Particle system with all presets (meterFlow, shareBurst, badgeExplode, confetti, etc.)
- [ ] Block Found Celebration — complete 5-8 second sequence with replay
- [ ] Personal Best, Streak, Level Up animation sequences
- [ ] Sound engine with Howler.js + all sound files
- [ ] Sound settings (off/subtle/full) in settings page
- [ ] Reduced motion support across all animated components
- [ ] All animations tested on mobile (performance + touch interaction)

---

## Definition of Done

Phase 9 is complete when:
1. Block found celebration plays the full 5-8 second sequence flawlessly
2. All reward animations trigger correctly on their corresponding events
3. Sound engine plays appropriate sounds in "subtle" and "full" modes
4. `prefers-reduced-motion` is respected — all animations have fallbacks
5. Mobile performance is acceptable (60fps on mid-range devices)
6. All sound files are loaded and play without delay
