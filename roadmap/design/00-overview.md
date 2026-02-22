# Design Implementation Roadmap — Overview

## THE BITCOIN GAME — Design Phases

This roadmap breaks the full UI/UX design plan into 10 sequential implementation phases. Each phase builds on the previous one and delivers a usable increment toward the final product.

---

## Phase Map

| Phase | Name | Est. Duration | Dependencies | Status | Deliverables |
|-------|------|---------------|--------------|--------|--------------|
| 1 | [Design System Foundation](./01-design-system-foundation.md) | 1.5 weeks | None | **DONE** | Tokens, Tailwind config, CSS variables, font setup |
| 2 | [Core Component Library](./02-core-component-library.md) | 2 weeks | Phase 1 | **DONE** | Buttons, Cards, Inputs, Tags, Badges, Modals |
| 3 | [Layout & Navigation Shell](./03-layout-navigation-shell.md) | 1.5 weeks | Phase 2 | **DONE** | Sidebar, TopBar, MobileTabBar, responsive grid, page transitions |
| 4 | [Dashboard & Mining Pages](./04-dashboard-mining-pages.md) | 3 weeks | Phase 3 | **DONE** | Dashboard, Workers, Shares, Difficulty Tracker, Blocks, Setup |
| 5 | [Game Experiences](./05-game-experiences.md) | 3.5 weeks | Phase 4 | TODO | Game Hub, Hammer Game, Horse Race, Slot Machine, Scratch Card |
| 6 | [Gamification UI](./06-gamification-ui.md) | 2 weeks | Phase 4 | TODO | Badge Collection, Streaks, XP/Levels, Reward Animations |
| 7 | [Competition & Social Pages](./07-competition-social-pages.md) | 3 weeks | Phase 6 | TODO | World Cup, Leagues, Leaderboards, Globe, Cooperatives |
| 8 | [Onboarding & Education](./08-onboarding-education.md) | 2 weeks | Phase 3 | TODO | Connect Wallet, Onboarding flows, Education tracks |
| 9 | [Animation & Sound System](./09-animation-sound-system.md) | 2 weeks | Phase 5, 6 | TODO | Spring physics, particle effects, sound engine, special events |
| 10 | [Mobile & Accessibility](./10-mobile-accessibility.md) | 2 weeks | All above | TODO | Responsive polish, React Native shell, WCAG 2.1 AA compliance |

---

## Dependency Graph

```
Phase 1 ──► Phase 2 ──► Phase 3 ──┬──► Phase 4 ──┬──► Phase 5 ──┐
                                   │               │              │
                                   │               ├──► Phase 6 ──┤
                                   │               │              │
                                   └──► Phase 8    │              ▼
                                                   │         Phase 9
                                                   │              │
                                                   ├──► Phase 7   │
                                                   │              │
                                                   └──────────────┴──► Phase 10
```

## Parallel Work Opportunities

- **Phase 8** (Onboarding) can start as soon as Phase 3 is done, in parallel with Phase 4.
- **Phase 6** (Gamification UI) and **Phase 5** (Games) can run in parallel once Phase 4 delivers the dashboard shell.
- **Phase 9** (Animation/Sound) can begin design and asset prep during Phase 5/6 implementation, with integration after.
- **Phase 10** (Mobile/A11y) is a cross-cutting polish pass that touches all previous work.

## Total Estimated Duration

- **Sequential:** ~22 weeks
- **With parallelism (2 frontend devs + 1 designer):** ~14 weeks
- **MVP slice (Phases 1-4 + partial 6 + 8):** ~9 weeks

---

## Guiding Principles (from Design Plan)

1. **Delight First** — Every interaction produces a small dopamine hit
2. **Apple-Level Polish** — 60fps animations, depth through shadows/blurs, every pixel considered
3. **Game, Not Tool** — The dashboard IS the game
4. **Progressive Disclosure** — Complexity always one click deeper
5. **Bitcoin Orange is Sacred** — #F7931A only for rewards, milestones, Bitcoin itself
