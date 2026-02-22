# Phase 10 — Mobile & Accessibility

## Duration: ~2 weeks
## Dependencies: All previous phases
## Goal: Polish responsive design across all breakpoints, establish React Native foundation, achieve WCAG 2.1 AA compliance

---

## 10.1 Responsive Breakpoints

### Breakpoint Definitions

| Name | Range | Layout | Navigation |
|------|-------|--------|------------|
| Mobile | 320px — 767px | Single column, full-width cards | Bottom tab bar |
| Tablet | 768px — 1023px | 2-column grid, collapsed sidebar (72px) | Collapsed sidebar |
| Desktop | 1024px — 1440px | Full sidebar (260px), 3-4 column grids | Full sidebar |
| Wide | 1441px+ | Max-width content (1280px), centered | Full sidebar |

### Mobile Layout Adaptations

| Component | Desktop | Mobile |
|-----------|---------|--------|
| Sidebar | 260px left panel | Hidden, replaced by bottom tab bar |
| Top Bar | Full greeting + actions | Simplified: title + bell only |
| Stat Cards | 4-column row | 2x2 grid or horizontal scroll |
| Live Share Feed | Left column with worker names | Simplified: diff + time only |
| Hashrate Chart | Large area chart | Smaller, simplified sparkline |
| Difficulty Meter | Horizontal full-width bar | Vertical thermometer (tall) |
| Leaderboard Table | Full columns (rank, name, country, diff, shares) | 3 columns (rank, name, diff) |
| Badge Grid | 3-4 columns | 2 columns |
| Game Cards | 2x2 grid | Vertical stack |
| Game Experiences | Landscape-optimized | Portrait, full-screen takeover |
| Worker Cards | 3-column grid | Single column stack |
| Charts | Full interactive charts | Simplified sparklines + tap-to-expand |

### Tasks

- [ ] Audit every page for mobile layout at 320px, 375px, 414px widths
- [ ] Implement mobile difficulty meter (vertical thermometer)
- [ ] Implement 2-column badge grid for mobile
- [ ] Simplify share feed entries for mobile (less data per row)
- [ ] Implement horizontal scroll for stat cards on mobile
- [ ] Test all charts at mobile widths (ensure no overflow, readable axes)
- [ ] Test game experiences in portrait mode on mobile devices
- [ ] Implement pull-to-refresh on mobile dashboard
- [ ] Handle safe areas (`env(safe-area-inset-*)`) for notched devices

---

## 10.2 Mobile-Specific Interactions

### Touch Interactions

| Interaction | Implementation |
|-------------|---------------|
| Pull-to-refresh | Custom pull animation (not browser default), triggers data refresh |
| Swipe between tabs | Horizontal swipe on tab content areas |
| Haptic feedback | `navigator.vibrate()` on tab switches, game interactions |
| Long-press | Context menus for share/copy on worker cards, leaderboard rows |
| Pinch-to-zoom | Disabled on app pages, enabled on charts |
| Touch-to-swing (Hammer) | Single tap triggers hammer swing |
| Scratch interaction | Touch-drag for scratch card |

### Mobile Performance Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint | < 1.5s |
| Largest Contentful Paint | < 2.5s |
| Time to Interactive | < 3.5s |
| Animation frame rate | 60fps (drop to 30fps for complex particles) |
| Total bundle size (initial) | < 500KB gzipped |
| WebSocket reconnection | Automatic with exponential backoff |

### Mobile-Specific Optimizations

- **Particles:** Reduce count by 50-70% on mobile
- **Three.js scenes:** Use lower poly count models, reduce shadow quality
- **Charts:** Use canvas rendering instead of SVG on mobile
- **Images:** WebP format, lazy-loaded, responsive `srcset`
- **Fonts:** Subset fonts to Latin characters only (~30% size reduction)
- **Code splitting:** Lazy-load game components, education content, settings

### Tasks

- [ ] Implement pull-to-refresh on dashboard
- [ ] Implement haptic feedback for key interactions
- [ ] Add long-press context menus where appropriate
- [ ] Profile and optimize mobile performance
- [ ] Implement code splitting for non-critical routes
- [ ] Lazy-load Three.js and game assets
- [ ] Reduce particle counts for mobile viewport detection
- [ ] Test on real devices: iPhone SE (small), iPhone 14 (medium), iPad (tablet)

---

## 10.3 React Native Foundation (Future Mobile App)

### Shared Code Strategy

```
packages/
├── shared/              ← Shared TypeScript code
│   ├── types/           ← All type definitions
│   ├── utils/           ← Pure utility functions
│   ├── hooks/           ← Shared React hooks (data fetching, state)
│   ├── api/             ← API client (fetch wrapper)
│   └── game-logic/      ← Game calculation logic
│
├── web/                 ← React web app (Vite)
│   └── (Phase 4-9 work)
│
└── mobile/              ← React Native app (Expo)
    ├── components/      ← RN-specific components
    ├── navigation/      ← React Navigation setup
    └── screens/         ← Screen wrappers using shared hooks
```

### React Native Priority Screens

| Priority | Screen | Notes |
|----------|--------|-------|
| P0 | Dashboard | Simplified, core mining stats + difficulty meter |
| P0 | Games | All 4 games adapted for mobile (portrait) |
| P1 | Badges | Collection grid with detail modal |
| P1 | Leaderboard | Simplified table |
| P1 | Notifications | Push notification integration |
| P2 | World Cup | Match view + standings |
| P2 | Worker management | Worker cards + status |
| P3 | Education | Lesson viewer |
| P3 | Settings | Sound, notifications, profile |

### React Native Technical Notes

- **Navigation:** React Navigation (stack + tab)
- **Animations:** React Native Reanimated 3 (replaces Framer Motion)
- **Games:** Use react-native-skia for 2D games, expo-gl for Three.js
- **Sounds:** expo-av
- **Push notifications:** expo-notifications + FCM/APNs
- **Charts:** Victory Native or react-native-chart-kit

### Tasks (Foundation Only — Full RN app is a separate project)

- [ ] Set up monorepo structure with `shared/` package
- [ ] Extract shared types, API client, and game logic to `shared/`
- [ ] Ensure shared code has zero DOM dependencies
- [ ] Set up React Native / Expo project in `mobile/`
- [ ] Build basic navigation (bottom tabs matching web)
- [ ] Build one proof-of-concept screen (dashboard) using shared hooks
- [ ] Test on iOS simulator and Android emulator

---

## 10.4 WCAG 2.1 AA Accessibility Compliance

### Color Contrast

| Combination | Minimum Ratio | Status |
|-------------|--------------|--------|
| Primary text (`#E6EDF3`) on Canvas (`#06080C`) | 4.5:1 | Must verify |
| Primary text on Surface (`#0D1117`) | 4.5:1 | Must verify |
| Secondary text (`#8B949E`) on Surface | 4.5:1 | Must verify |
| Orange accent (`#F7931A`) on Surface | 3:1 (large text) | Must verify |
| Green (`#3FB950`) on Surface | 4.5:1 | Must verify |
| All text on all backgrounds | 4.5:1 for normal, 3:1 for large | Must verify |

**Never rely on color alone to convey information:**
- Online/offline: dot color + text label + icon
- Valid/invalid shares: color + icon (check/x) + text
- Leaderboard changes: color + arrow icon + number

### Tasks

- [ ] Run automated contrast checker on all color token combinations
- [ ] Fix any combinations that fail 4.5:1 ratio
- [ ] Add high-contrast mode toggle in settings (increases contrast, removes transparency)
- [ ] Test with color blindness simulators (protanopia, deuteranopia, tritanopia)
- [ ] Verify no information is conveyed by color alone

---

### Keyboard Navigation

**Full keyboard accessibility for all interactive elements:**

| Key | Action |
|-----|--------|
| Tab | Move focus to next interactive element |
| Shift+Tab | Move focus to previous interactive element |
| Enter/Space | Activate focused element (buttons, links, toggles) |
| Escape | Close modal/dialog, dismiss tooltip |
| Arrow keys | Navigate within lists, tabs, radio groups |
| Home/End | Jump to first/last item in lists |

**Focus Indicators:**
- Visible focus ring: 2px solid `--accent-cyan`, 2px offset
- Never hidden (no `outline: none` without replacement)
- Focus ring visible on all interactive elements
- Tab order follows logical reading order

**Focus Traps:**
- Modals: Tab cycles within modal only
- Dialogs: Tab cycles within dialog
- Slide-overs: Tab cycles within panel
- On close: focus returns to trigger element

### Tasks

- [ ] Audit all interactive components for keyboard accessibility
- [ ] Add visible focus indicators to all focusable elements
- [ ] Implement focus trap on all modals/dialogs/slide-overs
- [ ] Verify logical tab order on all pages
- [ ] Test complete keyboard-only navigation through all core flows
- [ ] Add skip-to-main-content link at top of page

---

### Screen Reader Support

**Semantic HTML:**
- Use correct heading hierarchy (h1 > h2 > h3, no skipping)
- Use `<nav>`, `<main>`, `<aside>`, `<section>`, `<article>` landmarks
- Use `<button>` for actions, `<a>` for navigation
- Use `<table>` with `<thead>`/`<tbody>` for tabular data

**ARIA Labels:**
- All icon-only buttons: `aria-label="description"`
- All interactive elements without visible text: `aria-label`
- Charts: `aria-label` with data summary
- Badge images: `alt` text describing the badge
- Difficulty meter: `aria-valuenow`, `aria-valuemin`, `aria-valuemax`

**Live Regions:**
- Share feed: `aria-live="polite"` for new shares
- Notifications: `aria-live="assertive"` for critical alerts
- Score updates: `aria-live="polite"` for live match scores
- Game results: announced as text, not just animation

**Game Accessibility:**
- All game results available as text alongside/after animation
- Screen readers announce the result before animation plays
- Games usable with keyboard (Space to trigger actions)

### Tasks

- [ ] Audit all pages for semantic HTML correctness
- [ ] Add ARIA labels to all icon-only buttons and interactive elements
- [ ] Add ARIA live regions to real-time updating content
- [ ] Add descriptive alt text to all images and badge artwork
- [ ] Mark decorative images with `alt=""` or `role="presentation"`
- [ ] Implement `aria-valuenow/min/max` on progress bars and meters
- [ ] Test with VoiceOver (macOS/iOS) and NVDA (Windows)
- [ ] Ensure game results are communicated via screen reader

---

### Motion Sensitivity

Already covered in Phase 9, but verify:

- [ ] `prefers-reduced-motion` respected on ALL animated components
- [ ] Reduced motion toggle available in settings (independent of OS setting)
- [ ] No autoplaying video/animation that cannot be paused
- [ ] No flashing content (>3 flashes per second) — verify block found flash is <3 Hz

---

### Text & Touch Targets

- [ ] All text resizable to 200% without layout breaking
- [ ] Minimum touch target: 44x44px on all interactive elements
- [ ] No text rendered in images (except badge artwork, which has alt text)
- [ ] Readable font sizes at all breakpoints (minimum 11px, prefer 13px+)

---

## 10.5 Cross-Browser Testing

### Target Browsers

| Browser | Version | Priority |
|---------|---------|----------|
| Chrome | Latest 2 | P0 |
| Safari | Latest 2 (macOS + iOS) | P0 |
| Firefox | Latest 2 | P1 |
| Edge | Latest 2 | P1 |
| Samsung Internet | Latest | P2 |
| Brave | Latest | P2 |

### Known Compatibility Concerns

| Feature | Concern | Fallback |
|---------|---------|----------|
| `backdrop-filter` | Partial Safari support | Solid background fallback |
| WebSocket | Full support | Long-polling fallback |
| Canvas 2D | Full support | — |
| Three.js / WebGL | Some mobile GPUs struggle | 2D fallback for games |
| Web Audio | Requires user interaction | Delay until first interaction |
| `font-variant-numeric` | Full support | Standard font rendering |
| CSS container queries | Modern browsers only | Media queries fallback |

### Tasks

- [ ] Test all pages on Chrome, Safari, Firefox, Edge
- [ ] Test on iOS Safari (iPhone + iPad)
- [ ] Test on Android Chrome
- [ ] Add `backdrop-filter` fallback for unsupported browsers
- [ ] Add WebGL detection and 2D fallback for games
- [ ] Fix any browser-specific rendering issues

---

## 10.6 Deliverables Checklist

- [ ] All pages responsive at 320px, 375px, 768px, 1024px, 1440px+
- [ ] Mobile-specific layouts (vertical difficulty meter, 2-col badges, simplified tables)
- [ ] Bottom tab bar fully functional on mobile
- [ ] Pull-to-refresh on mobile dashboard
- [ ] Touch interactions (haptic, long-press, swipe)
- [ ] Mobile performance targets met (< 500KB initial, 60fps animations)
- [ ] React Native monorepo foundation (shared package + basic RN project)
- [ ] WCAG 2.1 AA: color contrast passes on all combinations
- [ ] WCAG 2.1 AA: full keyboard navigation on all interactive elements
- [ ] WCAG 2.1 AA: screen reader support (ARIA, live regions, alt text)
- [ ] WCAG 2.1 AA: motion sensitivity (reduced motion, no flashing)
- [ ] WCAG 2.1 AA: text resizable to 200%, 44px touch targets
- [ ] Cross-browser testing on Chrome, Safari, Firefox, Edge

---

## Definition of Done

Phase 10 is complete when:
1. All pages render correctly and are usable at every breakpoint (320px-1440px+)
2. WCAG 2.1 AA automated tests pass (axe-core, Lighthouse accessibility)
3. Manual keyboard-only navigation test passes for all core flows
4. Screen reader test (VoiceOver) passes for dashboard, games, badges, leaderboard
5. Mobile performance: initial load < 3s, animations at 60fps on mid-range device
6. React Native project builds and runs a proof-of-concept dashboard screen
7. All critical bugs from cross-browser testing are fixed
