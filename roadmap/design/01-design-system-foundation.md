# Phase 1 — Design System Foundation [COMPLETED]

## Duration: ~1.5 weeks
## Dependencies: None
## Status: COMPLETED
## Goal: Establish the visual DNA of the entire application as code

---

## 1.1 Color Tokens

Define all color values as CSS custom properties and Tailwind config extensions. These are the single source of truth for every color in the app.

### Background Layers (Depth System)

| Token Name | Hex | Usage |
|------------|-----|-------|
| `--bg-canvas` | `#06080C` | Page background, deepest layer |
| `--bg-surface` | `#0D1117` | Card backgrounds, panels (Layer 1) |
| `--bg-elevated` | `#161B22` | Modals, dropdowns, hover states (Layer 2) |
| `--bg-floating` | `#1C2333` | Tooltips, popovers (Layer 3) |
| `--bg-spotlight` | `#252D3A` | Active/selected states (Layer 4) |

### Accent Colors

| Token Name | Hex | Usage |
|------------|-----|-------|
| `--accent-orange` | `#F7931A` | Bitcoin Orange — rewards, BTC, milestones ONLY |
| `--accent-orange-glow` | `#F7931A40` | 40% opacity — glows and halos |
| `--accent-cyan` | `#58A6FF` | Links, interactive elements, info |
| `--accent-green` | `#3FB950` | Valid shares, wins, online status |
| `--accent-red` | `#F85149` | Errors, offline, losses |
| `--accent-purple` | `#A371F7` | Rare/Epic badges, premium features |
| `--accent-gold` | `#D4A843` | Legendary badges, block finds |

### Text Colors

| Token Name | Hex | Usage |
|------------|-----|-------|
| `--text-primary` | `#E6EDF3` | Primary body text (Warm White) |
| `--text-secondary` | `#8B949E` | Labels, metadata (Muted Gray) |
| `--text-subtle` | `#30363D` | Borders, dividers (Subtle Gray) |

### Gradients

| Token Name | Value | Usage |
|------------|-------|-------|
| `--gradient-orange` | `linear-gradient(135deg, #F7931A, #E8720A)` | Primary CTAs, reward highlights |
| `--gradient-cyan` | `linear-gradient(135deg, #58A6FF, #388BFD)` | Secondary actions |
| `--gradient-purple` | `linear-gradient(135deg, #A371F7, #8957E5)` | Premium/rare content |
| `--gradient-gold` | `linear-gradient(135deg, #D4A843, #B8860B)` | Legendary/block-found |
| `--gradient-dark` | `linear-gradient(180deg, #0D1117, #06080C)` | Background depth |
| `--gradient-card` | `linear-gradient(135deg, #161B2280, #1C233380)` | Card overlays |

### Glassmorphism

```css
.glass-panel {
  background: rgba(13, 17, 23, 0.7);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
```

### Tasks

- [ ] Create `tokens/colors.css` with all CSS custom properties
- [ ] Create `tailwind.config.ts` color extensions matching tokens exactly
- [ ] Create `tokens/colors.ts` TypeScript enum/object for programmatic access (Three.js, charts)
- [ ] Build a Storybook "Color Palette" page that renders every token for visual verification
- [ ] Validate all text-on-background combos meet WCAG 4.5:1 contrast ratio

---

## 1.2 Typography

### Font Loading

| Font | Weight(s) | Usage | Source |
|------|-----------|-------|--------|
| Inter | 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold) | All UI text, body, buttons | Google Fonts / self-hosted |
| JetBrains Mono | 400, 500 | Hashes, difficulty, hashrate, BTC amounts, counters | Google Fonts / self-hosted |
| Clash Display | 600 (Semibold), 700 (Bold) | Hero headlines, game titles, page display text | Fontshare / self-hosted |

### Type Scale

| Token Name | Size | Line Height | Letter Spacing | Weight | Usage |
|------------|------|-------------|----------------|--------|-------|
| `--text-hero` | 56px | 64px | -0.02em | Bold | Landing hero only |
| `--text-display-lg` | 40px | 48px | -0.02em | Bold | Page titles |
| `--text-display-md` | 32px | 40px | -0.01em | Semibold | Section headers |
| `--text-title` | 24px | 32px | -0.01em | Semibold | Card titles, game names |
| `--text-headline` | 20px | 28px | 0em | Semibold | Subsections |
| `--text-body-lg` | 17px | 26px | 0em | Regular | Primary body text |
| `--text-body` | 15px | 24px | 0em | Regular | Standard text |
| `--text-caption` | 13px | 18px | 0em | Medium | Labels, metadata |
| `--text-micro` | 11px | 16px | 0.02em | Medium | Timestamps, tiny labels |

### Monospace Rule

Any value that ticks, changes, or represents numerical mining data MUST use `JetBrains Mono` with `font-variant-numeric: tabular-nums`. This includes:
- Difficulty values
- Hashrate numbers
- Share counts
- BTC amounts
- Block heights
- Nonces
- Timers/countdowns
- Leaderboard ranks

### Tasks

- [ ] Self-host all three font families (Inter, JetBrains Mono, Clash Display) — avoid FOUT
- [ ] Configure `@font-face` with `font-display: swap` and preload critical weights
- [ ] Create Tailwind typography plugin with the exact scale above
- [ ] Create a `<Mono>` wrapper component that applies JetBrains Mono + tabular-nums
- [ ] Create a `<Display>` wrapper that applies Clash Display
- [ ] Build Storybook "Typography" page showing all scale levels with both fonts

---

## 1.3 Spacing & Layout Grid

### Base Unit: 4px

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | Tight inline spacing |
| `--space-sm` | 8px | Icon-to-text gaps |
| `--space-md` | 12px | Internal card padding elements |
| `--space-lg` | 16px | Standard gaps between elements |
| `--space-xl` | 24px | Card internal padding |
| `--space-2xl` | 32px | Section spacing |
| `--space-3xl` | 48px | Major section breaks |
| `--space-4xl` | 64px | Page-level vertical rhythm |

### Layout Constants

| Constant | Value | Notes |
|----------|-------|-------|
| Max content width | 1280px | Centered with auto margins |
| Sidebar width (expanded) | 260px | Desktop only |
| Sidebar width (collapsed) | 72px | Icon-only mode |
| Card border-radius (large) | 16px | Main cards, panels |
| Card border-radius (medium) | 12px | Smaller cards, buttons |
| Card border-radius (small) | 8px | Tags, small elements |
| Page padding (desktop) | 32px | Left/right of content area |
| Page padding (mobile) | 16px | Left/right on small screens |

### Tasks

- [ ] Configure Tailwind spacing scale matching these tokens exactly
- [ ] Define layout constants as CSS variables
- [ ] Create a `<Container>` component that enforces max-width + page padding
- [ ] Build Storybook "Spacing" page showing the scale visually

---

## 1.4 Elevation & Depth System

### Shadows

| Token | Value | Usage |
|-------|-------|-------|
| `--shadow-subtle` | `0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)` | Default card shadow |
| `--shadow-medium` | `0 4px 12px rgba(0,0,0,0.4)` | Hover-lifted elements |
| `--shadow-heavy` | `0 8px 32px rgba(0,0,0,0.5)` | Modals, floating panels |
| `--shadow-glow-orange` | `0 0 20px rgba(247,147,26,0.3)` | Reward glows |
| `--shadow-glow-cyan` | `0 0 20px rgba(88,166,255,0.2)` | Active/focus states |

### Border System

Borders are used sparingly, always `1px solid` with varying white alpha:
- Default: `rgba(255,255,255,0.04)`
- Hover: `rgba(255,255,255,0.08)`
- Active: `rgba(255,255,255,0.12)`
- Accent: Use accent color at reduced opacity

### Tasks

- [ ] Define all shadow tokens as Tailwind `boxShadow` extensions
- [ ] Create border utility classes matching the alpha system
- [ ] Build Storybook "Elevation" page showing layers stacked with shadows

---

## 1.5 Iconography Setup

### Icon Library

- **Primary:** Phosphor Icons (React package `@phosphor-icons/react`)
- **Size scale:** 20px (inline), 24px (buttons), 32px (navigation), 48px (features), 64px (badges)
- **Flags:** `twemoji` or `country-flag-icons` for World Cup
- **Custom icons:** Mining-specific set (pickaxe, ASIC chip, bitcoin node, hash symbol, block cube)

### Tasks

- [ ] Install Phosphor Icons package
- [ ] Create icon size utility classes: `icon-inline`, `icon-button`, `icon-nav`, `icon-feature`, `icon-badge`
- [ ] Design or source 5-8 custom mining-specific icons (SVG format)
- [ ] Set up flag emoji/icon system for country representation
- [ ] Create an `<Icon>` wrapper component with size prop

---

## 1.6 Tailwind Configuration File

The single `tailwind.config.ts` must encode the entire design system:

### Structure

```
tailwind.config.ts
├── theme.extend.colors        → All color tokens
├── theme.extend.fontFamily     → Inter, JetBrains Mono, Clash Display
├── theme.extend.fontSize       → Full type scale with line-heights
├── theme.extend.spacing        → 4px base unit scale
├── theme.extend.borderRadius   → 8/12/16px system
├── theme.extend.boxShadow      → All shadow tokens
├── theme.extend.backgroundImage → Gradient tokens
├── theme.extend.screens        → 320/768/1024/1441 breakpoints
└── plugins                     → Typography plugin, glass-panel plugin
```

### Tasks

- [ ] Write full `tailwind.config.ts` encoding all of the above
- [ ] Create `globals.css` with CSS custom properties for tokens that need runtime access
- [ ] Verify the config produces correct classes with a test page
- [ ] Document any custom Tailwind plugins needed

---

## 1.7 Deliverables Checklist

- [ ] `tokens/colors.css` — CSS custom properties
- [ ] `tokens/colors.ts` — TypeScript color constants
- [ ] `tailwind.config.ts` — Full Tailwind configuration
- [ ] `globals.css` — Base styles, font imports, CSS variables
- [ ] Font files self-hosted and preloaded
- [ ] Storybook pages: Colors, Typography, Spacing, Elevation
- [ ] Icon system installed and wrapper component ready
- [ ] All text/background combos validated for WCAG contrast
- [ ] Design token JSON export for Figma sync (optional)

---

## Definition of Done

Phase 1 is complete when:
1. A developer can build any component using only Tailwind classes and CSS variables from this system
2. Every color, font size, spacing value, and shadow has a single named token
3. The Storybook design system pages render correctly and match the design plan spec
4. No hardcoded color/size values exist anywhere — everything references tokens
