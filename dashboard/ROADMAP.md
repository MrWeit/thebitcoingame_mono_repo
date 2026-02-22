# The Bitcoin Game — Public Pages Roadmap

## Overview

This document tracks the public-facing marketing pages for The Bitcoin Game platform.
These pages are unauthenticated, served under `PublicLayout`, and designed to convert
visitors into connected miners.

---

## Completed Pages

### Landing Page (`/`)
- **Component**: `HowItWorksPage` (reused from `/how-it-works`)
- **Sections**: Hero with parallax scroll, 4-step mining explainer (Hash Stream, Difficulty Meter, Game Carousel, Leaderboard Preview), Block Dream (3.125 BTC animation), Getting Started (3-step cards), Final CTA
- **Route change**: Index route switched from Placeholder to `<HowItWorksPage />`

### How It Works (`/how-it-works`)
- **Component**: `HowItWorksPage`
- **Same component as landing page** — both `/` and `/how-it-works` render it

### Stats Page (`/stats`)
- **Component**: `StatsPage`
- **Sections (7)**:
  1. Hero Stats Bar — 4 animated stat cards (Total Miners, Hashrate, Blocks Found, Shares)
  2. Network Hashrate Chart — Recharts AreaChart with 4 time range toggles (24H/7D/30D/All)
  3. Mining Activity — Shares-per-hour bar chart + difficulty distribution horizontal bars
  4. Country Leaderboard — Top 10 countries with flags, miner counts, proportional bars
  5. Recent Blocks — 6 block cards with gold border, horizontal scroll on mobile
  6. Milestones Timeline — Vertical timeline with alternating layout
  7. CTA Banner — Connect Your Miner + How It Works buttons
- **Mock data**: `src/mocks/stats.ts`

### Blocks Page (`/blocks`)
- **Component**: `PublicBlocksPage`
- **Sections (5)**:
  1. Hero — Title, subtitle, 4 stat cards (Total Blocks, Total BTC, Latest Block, Countries)
  2. Latest Block Highlight — Featured card for most recent block with gold border, copy hash
  3. All Blocks List — 47 blocks table (desktop) / cards (mobile), show-more pagination
  4. Block Statistics — Monthly timeline chart + aggregate stats + top countries by blocks
  5. CTA Banner — "The next block could be yours"
- **Mock data**: `src/mocks/blocks.ts` (47 blocks, timeline, aggregates)

### Public Leaderboard (`/leaderboard`)
- **Component**: `PublicLeaderboardPage`
- **Existing**: Top 12 miners table with country flags, CTA to connect

### Public Miner Profile (`/miner/:address`)
- **Component**: `PublicMinerPage`
- **Existing**: Public view of a miner's profile

### Connect (`/connect`)
- **Component**: `ConnectPage`
- **Existing**: 3-step wallet connection flow

### Gift (`/gift`)
- **Component**: `GiftPage`
- **Existing**: Public onboarding landing for gifted Bitaxe

### Education (`/education`)
- **Component**: `EducationLanding`
- **Existing**: Learning tracks landing page

### World Cup (`/world-cup`)
- **Component**: `WorldCupPage` (lazy-loaded)
- **Existing**: Tournament brackets, match details

---

## Remaining Public Page Placeholders

These routes still render `<Placeholder>` and need implementation:

| Route | Placeholder Name | Priority | Description |
|-------|-----------------|----------|-------------|
| `/about` | About | Medium | Company/project story, team, mission |

---

## Remaining Authenticated Placeholders

| Route | Placeholder Name | Priority | Description |
|-------|-----------------|----------|-------------|
| `/games/lottery-history` | Lottery History | Low | Past lottery draw results |
| `/coop/:coopId/settings` | Coop Settings | Low | Cooperative management |
| `/shop` | Shop | Medium | Hardware shop landing |
| `/shop/bitaxe` | Bitaxe Shop | Medium | Bitaxe product listings |
| `/shop/nodes` | Nodes Shop | Low | Node hardware listings |
| `/shop/bundles` | Bundles Shop | Low | Bundle deals |
| `/shop/merch` | Merch Shop | Low | Merchandise store |

---

## Technical Debt & Future Improvements

### Shared Helper Extraction
`ScrollSection`, `FloatingParticles`, and `useCountUp` are duplicated across HowItWorksPage, StatsPage, and PublicBlocksPage. Extract to:
- `src/components/shared/ScrollSection.tsx`
- `src/components/shared/FloatingParticles.tsx`
- `src/hooks/useCountUp.ts`

### API Integration
All pages currently use mock data from `src/mocks/`. When the backend is ready:
- Replace mock imports with API hooks (React Query or SWR)
- Add loading skeletons (Skeleton component exists)
- Add error boundaries

### Performance
- Consider lazy-loading StatsPage and PublicBlocksPage (Recharts adds bundle weight)
- Current bundle: ~405KB gzipped (target: <500KB)

### SEO
- Add `<title>` and `<meta>` tags per page (react-helmet or router meta)
- Open Graph tags for social sharing
- Structured data for block explorer pages
