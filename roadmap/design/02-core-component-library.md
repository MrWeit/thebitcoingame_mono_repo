# Phase 2 — Core Component Library [COMPLETED]

## Duration: ~2 weeks
## Dependencies: Phase 1 (Design System Foundation)
## Status: COMPLETED
## Goal: Build every reusable UI primitive the app needs, with all interaction states

---

## 2.1 Button Components

### Variants

| Variant | Background | Text | Border | Use Case |
|---------|-----------|------|--------|----------|
| `primary` | Orange gradient (`--gradient-orange`) | White | None | Main CTAs: "Connect Wallet", "Play Now" |
| `secondary` | Glass surface | Cyan (`--accent-cyan`) | 1px subtle white | Secondary actions: "View Details", "Copy" |
| `ghost` | Transparent | Muted gray | None | Tertiary actions: "Cancel", inline links |
| `danger` | Red gradient | White | None | Destructive: "Leave Cooperative", "Disconnect" |
| `icon` | Circle, glass surface | Accent color | Subtle border | Icon-only actions: notifications, settings |

### States (All Variants)

| State | Transform | Visual | Duration |
|-------|-----------|--------|----------|
| Default | `scale(1)` | Base styles | — |
| Hover | `scale(1.02)` | Glow shadow appears (variant-colored) | 150ms |
| Active/Pressed | `scale(0.98)` | Darker shade | 100ms |
| Focused | `scale(1)` | Cyan focus ring (2px offset) | 150ms |
| Disabled | `scale(1)` | 50% opacity, no glow, `cursor: not-allowed` | — |
| Loading | `scale(1)` | Spinner replaces text, disabled interaction | — |

### Size Scale

| Size | Height | Padding | Font Size | Icon Size | Border Radius |
|------|--------|---------|-----------|-----------|---------------|
| `sm` | 32px | 12px horizontal | 13px | 16px | 8px |
| `md` | 40px | 16px horizontal | 15px | 20px | 12px |
| `lg` | 44px | 20px horizontal | 15px | 20px | 12px |
| `xl` | 52px | 24px horizontal | 17px | 24px | 12px |

### Props Interface

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'danger';
  size: 'sm' | 'md' | 'lg' | 'xl';
  leftIcon?: IconName;
  rightIcon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}
```

### Tasks

- [ ] Build `<Button>` component with all variants and sizes
- [ ] Implement hover/active/focus/disabled/loading states with correct animations
- [ ] Build `<IconButton>` for circular icon-only buttons
- [ ] Write Storybook stories showing every variant x size x state combination
- [ ] Ensure keyboard accessibility (Enter/Space triggers, visible focus ring)

---

## 2.2 Card Components

### Variants

**Standard Card**
- Background: `--bg-surface` (Layer 1)
- Border: `1px solid rgba(255,255,255,0.04)`
- Border radius: 16px
- Padding: 24px
- Hover: border brightens to `rgba(255,255,255,0.08)`, `translateY(-2px)`, shadow deepens
- Transition: 200ms snappy ease

**Interactive Card**
- Extends Standard Card
- `cursor: pointer`
- Hover: `scale(1.01)` + border glow
- Active: `scale(0.99)` brief compression
- Used for: game cards, lottery cards, leaderboard entries

**Stat Card**
- Extends Standard Card
- Contains: large monospace number + label below + optional sparkline
- Number uses count-up animation on value change (`react-countup` or custom)
- Change indicator: green arrow up / red arrow down with percentage

**Glass Card**
- Glassmorphism background: `rgba(13, 17, 23, 0.7)` + `backdrop-filter: blur(20px)`
- Used for: overlays, featured content, hero sections, modals

### Props Interface

```typescript
interface CardProps {
  variant: 'standard' | 'interactive' | 'stat' | 'glass';
  padding?: 'sm' | 'md' | 'lg';  // 16px / 24px / 32px
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

interface StatCardProps {
  label: string;
  value: number | string;
  format?: 'number' | 'hashrate' | 'difficulty' | 'btc' | 'percentage';
  change?: { value: number; direction: 'up' | 'down' };
  sparklineData?: number[];
  icon?: IconName;
}
```

### Tasks

- [ ] Build `<Card>` with all 4 variants
- [ ] Build `<StatCard>` with animated count-up number, change indicator, sparkline slot
- [ ] Implement hover lift/glow transitions on interactive cards
- [ ] Write Storybook stories for each variant

---

## 2.3 Input Components

### Text Input

- Background: `--bg-elevated` (Layer 2)
- Border radius: 12px
- Height: 44px
- Border: `1px solid rgba(255,255,255,0.06)`
- Focus: cyan border + cyan glow shadow (`--shadow-glow-cyan`)
- Error: red border + shake animation (3 oscillation cycles, 300ms)
- Success: green border + checkmark icon animates in
- Placeholder: `--text-secondary` color

### Search Input

- Pill shape (border-radius: 9999px)
- Icon prefix (magnifying glass)
- Glass background
- Full-width on mobile, fixed-width on desktop
- Debounced onChange (300ms)

### Select / Dropdown

- Custom styled (not native `<select>`)
- Same styling as text input
- Dropdown panel: `--bg-elevated` with shadow-heavy
- Options: hover highlight with `--bg-spotlight`
- Selected: checkmark icon + cyan text

### Toggle Switch

- iOS-style switch
- Track: off = `--text-subtle`, on = `--accent-orange`
- Thumb: white circle, overshoots slightly on toggle (spring physics)
- Size: 48px wide, 28px tall

### Tasks

- [ ] Build `<TextInput>` with label, error, success, and helper text states
- [ ] Build `<SearchInput>` with icon prefix and debounced callback
- [ ] Build `<Select>` with custom dropdown
- [ ] Build `<Toggle>` with spring animation
- [ ] Build `<TextArea>` for multi-line input (e.g., signature paste)
- [ ] Ensure all inputs have proper `aria-label`, `aria-describedby`, focus management

---

## 2.4 Badge Display Components

### Badge Card (Collection Grid Item)

Two states:

**Unlocked Badge Card**
- Full-color 3D icon in a circular mask (Apple Game Center style)
- Rarity-colored border glow:
  - Common: `#8B949E` (gray)
  - Rare: `#58A6FF` (cyan)
  - Epic: `#A371F7` (purple)
  - Legendary: `#D4A843` (gold) + shimmer animation
- Badge name below icon
- Date earned
- Hover: card lifts + rarity glow intensifies + icon subtly rotates 3D perspective

**Locked Badge Card**
- Grayscale icon or `???` placeholder
- Glass card, muted
- Click: slight shake animation + "Keep mining!" tooltip
- No rarity glow

### Badge Detail Modal

- Large 3D badge icon (interactive — user can rotate by dragging, using Three.js or CSS 3D transforms)
- Metallic material that catches light
- Badge name, rarity tag, description
- Date earned, metadata (e.g., block number)
- Rarity percentage: "Only 0.3% of miners have this badge"
- Share buttons: [Share to Nostr] [Download Image]

### Props Interface

```typescript
interface BadgeCardProps {
  badge: {
    slug: string;
    name: string;
    description: string;
    iconUrl: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
  };
  earned?: {
    date: Date;
    metadata?: Record<string, any>;
  };
  onClick?: () => void;
}
```

### Tasks

- [ ] Build `<BadgeCard>` with unlocked/locked states
- [ ] Implement rarity border glow (including legendary shimmer via CSS animation)
- [ ] Build `<BadgeDetailModal>` with 3D interactive icon (start with CSS 3D transforms, upgrade to Three.js later)
- [ ] Create badge card hover/click interactions
- [ ] Write Storybook stories for all rarity levels x locked/unlocked

---

## 2.5 Tags & Pills

| Type | Visual | Usage |
|------|--------|-------|
| Online | Green dot + "Online" in green pill | Worker status |
| Offline | Gray dot + "Offline" in gray pill | Worker status |
| Block Found | Gold pill with star icon | Block events |
| Streak | Fire icon + count in orange pill | Streak display |
| Country | Flag emoji + country code | User/leaderboard |
| Rarity | Rarity-colored pill | Badge rarity labels |
| Level | Accent-colored pill with level number | User level |

### Tasks

- [ ] Build `<Tag>` component with variant prop matching all types above
- [ ] Each tag should have appropriate icon/emoji prefix
- [ ] Ensure tags work inline with text and in lists

---

## 2.6 Modal & Dialog

### Modal

- Backdrop: black at 60% opacity, `fade-in` 200ms
- Panel: `--bg-elevated`, border-radius 16px, shadow-heavy
- Open animation: `scale(0.95 -> 1.0)` + `fade-in` with bouncy spring, 300ms
- Close animation: `scale(1.0 -> 0.95)` + `fade-out`, 200ms
- Content staggers in: 50ms delay between child elements
- Focus trap: keyboard focus locked inside modal
- Close on Escape key and backdrop click

### Confirmation Dialog

- Smaller modal variant (max-width: 400px)
- Icon + title + description + action buttons
- Used for: destructive actions, important confirmations

### Slide-Over Panel

- Slides in from right edge
- Width: 400-500px
- Used for: worker detail, share detail, notifications panel
- Backdrop same as modal

### Tasks

- [ ] Build `<Modal>` with open/close animations and focus trap
- [ ] Build `<ConfirmDialog>` with icon/title/description/actions pattern
- [ ] Build `<SlideOver>` panel with right-edge slide animation
- [ ] Ensure all modals respect `Escape` key and `prefers-reduced-motion`

---

## 2.7 Toast Notifications

### Structure

- Positioned: top-right, stacked vertically with 8px gap
- Width: 360px (desktop), full-width (mobile)
- Background: `--bg-elevated` with glassmorphism
- Left border: 3px solid, color varies by type
- Auto-dismiss: 5s default (configurable, critical = no auto-dismiss)
- Enter: slide in from right + `fade-in` (300ms)
- Exit: slide out right + `fade-out` (200ms)

### Types

| Type | Left Border | Icon | Sound |
|------|------------|------|-------|
| Success | Green | Checkmark | Gentle chime |
| Info | Cyan | Info circle | Soft "pip" |
| Warning | Orange | Warning triangle | Two-tone alert |
| Error | Red | X circle | Low tone |
| Mining | Green/Red | Pickaxe | Worker-specific |
| Reward | Gold | Star/Trophy | Fanfare |
| Badge | Rarity color | Badge icon (spinning) | Achievement chime |

### Tasks

- [ ] Build `<Toast>` component with all types
- [ ] Build `<ToastProvider>` context + `useToast()` hook for imperative toast creation
- [ ] Implement stacking, auto-dismiss, manual dismiss
- [ ] Support action buttons inside toasts (e.g., "View Block")

---

## 2.8 Chart Components

### Sparkline

- Tiny inline chart (height: 32px, width: 80-120px)
- SVG path with gradient fill below line
- Animated draw-on-load (path draws left-to-right)
- Colors: orange for primary metrics, cyan for secondary

### Area Chart (Hashrate)

- Recharts-based
- Orange gradient fill below the line
- Animated cursor dot that tracks the line
- Hover: tooltip with exact value
- Time range toggles: 1h / 24h / 7d / 30d
- Smooth spring animation when new data point arrives
- Y-axis: hashrate, X-axis: time

### Scatter Plot (Difficulty Distribution)

- Each dot = a share, Y = difficulty, X = time
- Orange highlights for best shares
- Toggle: linear / logarithmic Y-axis
- Hover: full share details tooltip

### Bar Chart (Monthly Shares)

- Simple vertical bar chart
- Orange bars with rounded tops
- Hover: exact count tooltip

### Tasks

- [ ] Build `<Sparkline>` component
- [ ] Build `<HashrateChart>` area chart with time range toggles
- [ ] Build `<DifficultyScatter>` plot (can be deferred to Phase 4)
- [ ] Build `<BarChart>` wrapper
- [ ] Apply design system colors and fonts to all chart axes/labels
- [ ] Ensure charts are responsive and don't overflow on mobile

---

## 2.9 Skeleton Loading States

All content areas must have skeleton screens (never spinners):
- Animated gradient shimmer: left-to-right sweep, 1.5s duration, infinite loop
- Skeleton shapes must match the content they replace
- Use `--bg-elevated` as skeleton base, shimmer highlight slightly lighter

### Tasks

- [ ] Build `<Skeleton>` base component with shimmer animation
- [ ] Build pre-composed skeletons: `<StatCardSkeleton>`, `<WorkerCardSkeleton>`, `<LeaderboardRowSkeleton>`, `<BadgeCardSkeleton>`
- [ ] Ensure skeletons match exact dimensions of loaded content (no layout shift)

---

## 2.10 Deliverables Checklist

- [ ] `<Button>` — all variants, sizes, states
- [ ] `<IconButton>` — circular icon-only
- [ ] `<Card>`, `<StatCard>` — all variants with animations
- [ ] `<TextInput>`, `<SearchInput>`, `<Select>`, `<Toggle>`, `<TextArea>`
- [ ] `<BadgeCard>`, `<BadgeDetailModal>`
- [ ] `<Tag>` — all types
- [ ] `<Modal>`, `<ConfirmDialog>`, `<SlideOver>`
- [ ] `<Toast>`, `<ToastProvider>`, `useToast()`
- [ ] `<Sparkline>`, `<HashrateChart>`, `<BarChart>`
- [ ] `<Skeleton>` + pre-composed skeleton variants
- [ ] Full Storybook documentation for every component
- [ ] All components keyboard accessible with visible focus indicators
- [ ] All components respect `prefers-reduced-motion`

---

## Definition of Done

Phase 2 is complete when:
1. Every component listed above renders correctly in Storybook with all variants and states
2. Components use only design system tokens (no hardcoded colors/sizes)
3. All interactive components have hover/active/focus/disabled states
4. Keyboard navigation works for all interactive components
5. A developer can compose any page layout using these primitives
