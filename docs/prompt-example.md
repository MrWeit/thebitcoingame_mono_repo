Prompt: Stats Page + Landing Page Route Fix                                                                                                          
  
  You are building two things for The Bitcoin Game — a Bitcoin mining gamification platform frontend. All other pages are already built. Your job is:  
                                         
  1. Build the /stats page — A public global pool statistics page
  2. Make the landing page (/) use the existing HowItWorksPage component instead of the current Placeholder

  Your Stack

  - React 19 + TypeScript + Vite 7
  - Tailwind CSS v4 (CSS-first @theme blocks in src/styles/globals.css, NOT tailwind.config.ts)
  - Framer Motion for animations
  - Recharts for charts
  - Phosphor Icons (@phosphor-icons/react)
  - Path alias: @/* → ./src/*
  - cn() utility from src/lib/utils.ts (clsx + tailwind-merge)

  Before You Start — Read These Files

  1. src/styles/globals.css — Design tokens, colors, @theme block
  2. src/lib/animation.ts — Shared animation config (easings, springs, durations)
  3. src/lib/utils.ts — cn() utility
  4. src/pages/public/HowItWorksPage.tsx — Read this carefully. This is a polished page with scroll-triggered animations, ScrollSection helper,
  useCountUp hook, and Framer Motion patterns. Match this quality and style exactly for the Stats page. Also, this component will now serve double duty
   as both /how-it-works AND / (landing page).
  5. src/components/layout/PublicLayout.tsx — The public layout wrapper (header + footer)
  6. src/routes/router.tsx — Current routing config (you'll modify this)
  7. src/mocks/data.ts — Existing mock data (formatHashrate, formatDifficulty, formatNumber, formatBTC, formatTimeAgo helpers are all here — reuse
  them)
  8. src/components/ui/ — Button, Card, StatCard, Sparkline, Tag — reuse where appropriate
  9. src/components/shared/ — CountUp, Mono, Display, FadeIn — reuse where appropriate
  10. src/hooks/useReducedMotion.ts — Reduced motion hook

  Task 1: Route Fix — Make Landing Page Use HowItWorksPage

  In src/routes/router.tsx:

  Change the index route from <Placeholder name="Landing Page" /> to <HowItWorksPage />. The HowItWorksPage import already exists in the file. Keep the
   separate /how-it-works route as well so both / and /how-it-works show the same page.

  That's it — one line change in the router.

  Task 2: Build the Stats Page — /stats

  Create src/pages/public/StatsPage.tsx — A public-facing global pool statistics page that shows the platform's overall health and mining activity.
  This is a marketing page — it should make the platform look impressive and alive.

  Design approach: Follow the same visual patterns as HowItWorksPage.tsx — scroll-triggered sections, dark themed, glassmorphism cards, animated
  counters, Recharts charts with orange gradient fills. Match the existing ScrollSection pattern (or import it if extracted).

  Page Layout

  Section 1: Hero Stats Bar (Full-width, above the fold)

  "The Bitcoin Game — Global Stats"
  "Real-time overview of our mining network"

  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │ Total Miners │ │ Hashrate    │ │ Blocks Found│ │ Total Shares│
  │              │ │              │ │              │ │              │
  │  12,847      │ │  2.4 EH/s   │ │  47          │ │  1.2B        │
  │  ↑ 234 today │ │  ↑ 3.2%     │ │  Latest: 2d  │ │  This week   │
  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

  - 4 stat cards in a responsive grid (4-col desktop, 2-col tablet, 1-col mobile)
  - Each card: glass surface, large monospace animated count-up number, label below, change indicator
  - Numbers animate on page load with count-up effect

  Section 2: Network Hashrate Chart

  "Network Hashrate"
  "Combined hashrate from all connected miners"

  [Toggle: 24h | 7d | 30d | All Time]

  ┌────────────────────────────────────────────────────────────┐
  │  [Area chart — orange gradient fill, white line]           │
  │  Y-axis: hashrate (PH/s)                                  │
  │  X-axis: time                                              │
  │  Hover tooltip: exact hashrate + time                      │
  └────────────────────────────────────────────────────────────┘

  - Recharts AreaChart with orange gradient fill (#F7931A to transparent)
  - Time range toggle (segmented control style — similar to existing hashrate chart patterns)
  - Responsive: full-width, minimum height 300px
  - Generate mock hashrate data for each time range (24h = hourly points, 7d = 4-hour points, 30d = daily points, All Time = weekly points over 6
  months)

  Section 3: Mining Activity (Two-Column)

  Left: "Shares Today"                Right: "Difficulty Distribution"
  [Bar chart — shares per hour,       [Horizontal bar chart showing
   24 bars, orange fills,              distribution of share difficulties
   current hour highlighted]           across all miners: 1K, 1M, 1B, 1T+]

  - Left: Recharts BarChart with 24 bars (one per hour), current hour highlighted with brighter orange
  - Right: Recharts horizontal BarChart showing difficulty distribution buckets
  - Below 768px: stack vertically

  Section 4: Country Leaderboard (Compact)

  "Miners Around the World"
  "47 countries represented"

  ┌──────────────────────────────────────────────────────────┐
  │ 🇺🇸 United States   847 miners    12.4 PH/s    ████████ │
  │ 🇯🇵 Japan           623 miners     8.7 PH/s    ██████   │
  │ 🇩🇪 Germany         512 miners     6.2 PH/s    █████    │
  │ 🇬🇧 United Kingdom  489 miners     5.8 PH/s    ████     │
  │ 🇧🇷 Brazil          401 miners     4.9 PH/s    ████     │
  │ 🇵🇹 Portugal        287 miners     3.4 PH/s    ███      │
  │ 🇳🇴 Norway          256 miners     3.1 PH/s    ███      │
  │ 🇨🇦 Canada          234 miners     2.8 PH/s    ██       │
  │ 🇦🇺 Australia       198 miners     2.4 PH/s    ██       │
  │ 🇳🇱 Netherlands     176 miners     2.1 PH/s    ██       │
  └──────────────────────────────────────────────────────────┘

  [View Full Leaderboard →]

  - Top 10 countries in a list with inline hashrate bars (proportional width)
  - Each row: flag emoji + country name + miner count + hashrate + visual bar
  - Rows stagger in on scroll with Framer Motion
  - Link to /leaderboard at bottom

  Section 5: Recent Blocks Found

  "Blocks Found by Our Miners"
  "47 blocks and counting"

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ Block #891,234│  │ Block #889,102│  │ Block #887,456│
  │ SatoshiFan42 │  │ BlockChaser99 │  │ MiningViking  │
  │ 🇯🇵            │  │ 🇺🇸            │  │ 🇳🇴            │
  │ 3.125 BTC    │  │ 3.125 BTC    │  │ 3.125 BTC    │
  │ 2 days ago   │  │ 12 days ago  │  │ 3 weeks ago  │
  └──────────────┘  └──────────────┘  └──────────────┘

  [View All Blocks →]

  - Horizontal scroll on mobile, 3-column grid on desktop
  - Each card: gold left border, block height, finder name, country flag, reward, time ago
  - Cards stagger in from bottom on scroll
  - Reuse the mockBlocks data from src/mocks/data.ts and extend with more entries

  Section 6: Platform Milestones Timeline

  "Our Journey"

  Feb 2026 ─── Platform Launch
              First miner connected

  Mar 2026 ─── 1,000 Miners
              Hashrate crosses 1 PH/s

  May 2026 ─── First Block Found!
              SatoshiFan42, Block #891,234
              🇯🇵 Japan

  Jul 2026 ─── First World Cup
              32 countries competed
              🇺🇸 USA won

  Oct 2026 ─── 10,000 Miners
              47 blocks found total

  - Vertical timeline with alternating left/right on desktop, all-left on mobile
  - Each milestone: date pill + title + description
  - Connecting vertical line between milestones
  - Milestones fade in on scroll
  - Orange dot on the timeline for each milestone

  Section 7: CTA Banner

  ┌────────────────────────────────────────────────────────────┐
  │  "Join 12,847 miners making Bitcoin mining fun"            │
  │                                                              │
  │  [Connect Your Miner →]   (orange CTA)                      │
  │  [Learn How It Works →]   (ghost button)                    │
  └────────────────────────────────────────────────────────────┘

  - Glass card with gradient border
  - Two buttons: primary orange CTA linking to /connect, ghost button linking to /how-it-works

  Mock Data

  Create src/mocks/stats.ts (or add to existing data.ts) with:

  // Global platform stats
  export const mockGlobalStats = {
    totalMiners: 12847,
    newMinersToday: 234,
    totalHashrate: 2.4e18,           // 2.4 EH/s
    hashrateChange24h: 3.2,          // percent
    blocksFound: 47,
    latestBlockAge: 2 * 24 * 3600,   // 2 days in seconds
    totalSharesThisWeek: 1_247_832_104,
    countriesRepresented: 47,
  };

  // Hashrate history (generate for each time range)
  // Country stats (top 10 with miner count + hashrate)
  // Shares per hour (24 entries)
  // Difficulty distribution (buckets)
  // Platform milestones (5-6 entries)
  // Extended blocks list (6+ blocks)

  Use the formatting helpers from src/mocks/data.ts (formatHashrate, formatNumber, etc.).

  Route Update

  In src/routes/router.tsx, replace the stats Placeholder:

  import StatsPage from "../pages/public/StatsPage";

  Change element: <Placeholder name="Stats" /> to element: <StatsPage />.

  Rules

  1. Read HowItWorksPage.tsx fully first. It's your style reference. Match the visual quality, animation patterns, section spacing, typography, and
  glass card treatment exactly.
  2. Reuse existing helpers. The ScrollSection, useCountUp patterns from HowItWorksPage — either copy them into StatsPage or extract to a shared file
  if you prefer. Reuse formatHashrate, formatDifficulty, formatNumber from mocks/data.ts.
  3. Reuse components. <Button>, <Card>, <Mono>, <Display>, <Sparkline>, <CountUp> all exist. Use them.
  4. TypeScript strict. No any, no // @ts-ignore. Use type for type-only imports. Use ReturnType<typeof setTimeout> not NodeJS.Timeout.
  5. Phosphor Icons only. Import from @phosphor-icons/react. Pickaxe and Swords do NOT exist — use Hammer instead.
  6. Bitcoin Orange (#F7931A / text-bitcoin) is sacred — only for rewards, milestones, active states. Use it for the stat numbers and chart fills, but
  not generic decoration.
  7. Dark theme only. Canvas is #06080C. Use surface, elevated, glass classes.
  8. Responsive. All sections must work at 320px mobile. Use grid-cols-1 md:grid-cols-2 lg:grid-cols-4 patterns.
  9. No extra docs/README files. Only create the StatsPage component file, the mock data, and the router edits.
  10. Reduced motion: Use useReducedMotion hook. When true, skip scroll-triggered animations and count-up effects.
  11. Recharts styling: Dark background, no grid lines, orange/white colors only. Tooltips with dark glass background. Match any existing Recharts
  patterns in the codebase (check HashrateChart or DifficultyPage for reference).

  Files to Create/Edit
  ┌────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │ Action │                                                 File                                                  │
  ├────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ CREATE │ src/pages/public/StatsPage.tsx                                                                        │
  ├────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ CREATE │ src/mocks/stats.ts                                                                                    │
  ├────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ EDIT   │ src/routes/router.tsx — (1) Change index route to HowItWorksPage, (2) Change stats route to StatsPage │
  └────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────┘
  Definition of Done

  1. Navigating to / shows the HowItWorksPage (same content as /how-it-works)
  2. Navigating to /stats shows the new StatsPage with all 7 sections
  3. All stat numbers animate with count-up on page load
  4. Hashrate chart renders with time range toggle (24h/7d/30d/All)
  5. Country leaderboard rows stagger in on scroll
  6. Block cards display with gold border treatment
  7. Timeline milestones fade in on scroll
  8. CTA buttons link correctly to /connect and /how-it-works
  9. Everything works at 320px mobile
  10. Production build passes with 0 TypeScript errors

✻ Churned for 2m 21s                                                                                                                                   
                                                                    
❯ Another thing give me prompt to put like in top the stats, and also a specifal CTA button to basssicly go to a page shop, the button must have       
  like red special offer icon, must stand out bassically!                                                                                              
  Another thing is i want in this prompt to include the full extensive prompt so that it can generate the shop page full shop, product page,...        
  ⎿  [Image #1]                                                                                                                                        
                                                                                                                                                       
⏺ Let me check the existing shop routes and design plan specs.                                                                                         
                                                                                                                                                       
⏺ Searched for 2 patterns, read 2 files (ctrl+o to expand)                                                                                             
                                                                                                                                                       
⏺ Now I have everything. Here's the combined prompt:                                                                                                   
                                                                                                                                                       
  ---                                    
  Prompt: Navigation Update + Stats Page + Full Shop System                                                                                            
                                         
  You are building for The Bitcoin Game — a Bitcoin mining gamification platform frontend. All core pages are built. Your job is to: (1) update the    
  public navigation bar, (2) build the /stats page, (3) build the complete /shop system, and (4) make the landing page use the existing HowItWorksPage.

  Your Stack

  - React 19 + TypeScript + Vite 7
  - Tailwind CSS v4 (CSS-first @theme blocks in src/styles/globals.css, NOT tailwind.config.ts)
  - Framer Motion for animations
  - Recharts for charts
  - Phosphor Icons (@phosphor-icons/react)
  - Path alias: @/* → ./src/*
  - cn() utility from src/lib/utils.ts (clsx + tailwind-merge)

  Before You Start — Read These Files (in order)

  1. src/styles/globals.css — Design tokens, colors, @theme block
  2. src/lib/animation.ts — Shared animation config (easings, springs, durations)
  3. src/lib/utils.ts — cn() utility
  4. src/pages/public/HowItWorksPage.tsx — Read this fully. This is your quality reference. Match the visual style, scroll-triggered ScrollSection
  pattern, useCountUp hook, FloatingParticles, glassmorphism cards, and Framer Motion patterns exactly for all new pages.
  5. src/components/layout/PublicLayout.tsx — The public layout (header + footer). You will modify this.
  6. src/routes/router.tsx — Current routing config. You will modify this.
  7. src/mocks/data.ts — Existing mock data with formatHashrate, formatDifficulty, formatNumber, formatBTC, formatTimeAgo helpers — reuse them.
  8. src/components/ui/ — Button, Card, StatCard, Sparkline, Tag, Modal — reuse where appropriate.
  9. src/components/shared/ — CountUp, Mono, Display, FadeIn, SpringScale — reuse where appropriate.
  10. src/hooks/useReducedMotion.ts — Reduced motion hook.
  11. src/pages/games/GameHub.tsx — Reference for card grid patterns.
  12. src/pages/public/PublicLeaderboardPage.tsx — Reference for public page patterns.

  ---
  TASK 1: Update PublicLayout Navigation Bar

  Edit src/components/layout/PublicLayout.tsx:

  Add "Stats" to the navigation — Insert a Stats link pointing to /stats in both the desktop nav and mobile menu, right after "Education".

  Add a special "Shop" CTA button that stands out dramatically from the rest of the nav. This is NOT a regular nav link — it's a flashy promotional
  button designed to grab attention:

  Desktop header should look like:
  [Logo] TheBitcoinGame    How It Works  Leaderboard  World Cup  Education  Stats    [🔴 Shop — Special Offer!]  [Connect Wallet]

  Shop button specs:
  - Positioned to the LEFT of "Connect Wallet", separated by a small gap
  - Background: a subtle pulsing gradient — dark red to deep crimson (from-red-600 to-red-500 or similar)
  - A small red dot/badge in the top-right corner of the button that pulses (like a notification indicator) — this is the "special offer" eye-catcher
  - Text: "Shop" with a Storefront or ShoppingCart icon from Phosphor
  - On hover: slight scale up (1.03) + brighter glow shadow
  - The button should feel premium and urgent, NOT cheap or spammy. Think Apple product launch promo button, not Black Friday popup.
  - Links to /shop
  - On mobile: add "Shop" to the mobile dropdown menu as well, with a red "NEW" tag next to it

  Also update the footer: Add a "Stats" link under the "Learn" column if not already there.

  ---
  TASK 2: Landing Page Route Fix

  In src/routes/router.tsx, change the index route from <Placeholder name="Landing Page" /> to <HowItWorksPage />. The import already exists. Keep the
  /how-it-works route too — both / and /how-it-works show the same page.

  ---
  TASK 3: Build the Stats Page — /stats

  Create src/pages/public/StatsPage.tsx — A public-facing global pool statistics page that shows platform health and mining activity. Marketing page —
  make it look impressive and alive.

  Follow the same visual patterns as HowItWorksPage.tsx — scroll-triggered sections, dark themed, glassmorphism cards, animated counters, Recharts
  charts.

  Section 1: Hero Stats Bar (above the fold)

  "The Bitcoin Game — Global Stats"
  "Real-time overview of our mining network"

  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
  │ Total Miners │ │ Hashrate    │ │ Blocks Found│ │ Total Shares│
  │  12,847      │ │  2.4 EH/s   │ │  47          │ │  1.2B        │
  │  ↑ 234 today │ │  ↑ 3.2%     │ │  Latest: 2d  │ │  This week   │
  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘

  - 4 glass stat cards, responsive grid (4→2→1 columns)
  - Large monospace animated count-up numbers
  - Change indicators below

  Section 2: Network Hashrate Chart

  - Recharts AreaChart with orange gradient fill
  - Time range toggle: 24h / 7d / 30d / All Time
  - Full-width, min-height 300px
  - Dark background, no grid lines, orange/white only

  Section 3: Mining Activity (Two-Column)

  - Left: Shares per hour bar chart (24 bars, current hour highlighted)
  - Right: Difficulty distribution horizontal bar chart
  - Stack vertically below 768px

  Section 4: Country Leaderboard

  - Top 10 countries with flag, name, miner count, hashrate, and inline proportional bar
  - Rows stagger in on scroll
  - Link to /leaderboard

  Section 5: Recent Blocks Found

  - 3-column grid (horizontal scroll on mobile)
  - Gold left border, block height, finder, country flag, reward, time ago
  - Stagger animation from bottom

  Section 6: Platform Milestones Timeline

  - Vertical timeline with alternating left/right on desktop, all-left on mobile
  - Date pill + title + description for each milestone
  - Orange dots on the connecting line
  - Fade-in on scroll

  Section 7: CTA Banner

  - Glass card with gradient border
  - "Join 12,847 miners" + two buttons: orange CTA /connect, ghost /how-it-works

  Mock Data

  Create src/mocks/stats.ts with:
  - mockGlobalStats (miners, hashrate, blocks, shares, countries)
  - mockHashrateHistory for each time range (24h=hourly, 7d=4h, 30d=daily, all=weekly over 6 months)
  - mockSharesPerHour (24 entries)
  - mockDifficultyDistribution (buckets: 1K, 10K, 100K, 1M, 10M, 100M, 1B, 10B+)
  - mockCountryStats (top 10 countries with minerCount, hashrate, countryCode, name)
  - mockPlatformBlocks (6+ blocks with height, hash, finder, country, reward, date)
  - mockMilestones (5-6 timeline entries)

  ---
  TASK 4: Build the Full Shop System

  This is the biggest task. The shop is The Bitcoin Game's hardware store — selling Bitcoin mining equipment, nodes, starter kits, and merchandise. It
  should feel premium, not like a generic e-commerce site. Think Apple Store aesthetic meets Bitcoin culture.

  4A: Shop Hub — /shop

  Create src/pages/shop/ShopPage.tsx — The main shop landing page.

  Hero Section:

  "The Bitcoin Game Store"
  "Everything you need to start mining, secure your sats, and represent."

  [Subtle animated background — floating Bitcoin/mining icons, very subtle]

  Category Cards (2x2 grid, full-width on mobile):

  ┌─────────────────────────┐  ┌─────────────────────────┐
  │  ⛏️ MINERS               │  │  🖥️ NODES                │
  │                           │  │                           │
  │  Bitaxe, NerdAxe, and    │  │  Run your own Bitcoin     │
  │  other solo mining        │  │  full node. Be sovereign. │
  │  hardware                 │  │                           │
  │                           │  │  3 products               │
  │  6 products               │  │  From $199                │
  │  From $59                 │  │                           │
  │  [Browse Miners →]        │  │  [Browse Nodes →]         │
  └─────────────────────────┘  └─────────────────────────┘

  ┌─────────────────────────┐  ┌─────────────────────────┐
  │  🎁 STARTER KITS         │  │  👕 MERCH                 │
  │                           │  │                           │
  │  Perfect gift bundles     │  │  World Cup jerseys,       │
  │  for new Bitcoiners.      │  │  badge pins, mining gear. │
  │  Miner + wallet + guide.  │  │                           │
  │                           │  │  12 products              │
  │  4 bundles                │  │  From $19                 │
  │  From $149                │  │                           │
  │  [Browse Kits →]          │  │  [Browse Merch →]         │
  └─────────────────────────┘  └─────────────────────────┘

  - Glass card hover: lifts up + subtle glow
  - Each card has a large Phosphor icon, category name, description, product count, starting price, CTA link
  - Icons: Hammer (miners), Desktop (nodes), Gift (kits), TShirt (merch)

  Featured Products Section:

  "Featured"

  [Horizontal scroll of 4-6 featured product cards]
  Each card: product image placeholder (colored gradient rectangle with icon), name, short desc, price, [Add to Cart] or [View →]

  Special Offer Banner (if active):

  ┌──────────────────────────────────────────────────────────────┐
  │  🔴 LIMITED TIME: Bitaxe Ultra Bundle                         │
  │  Bitaxe Ultra + Trezor Safe 3 + Steel Seed Plate             │
  │  $299 (Save $80)                          [Grab This Deal →] │
  └──────────────────────────────────────────────────────────────┘

  - Red/crimson gradient left border
  - Pulsing red dot icon matching the nav button
  - Urgency messaging

  4B: Category Pages — /shop/bitaxe, /shop/nodes, /shop/bundles, /shop/merch

  Create src/pages/shop/CategoryPage.tsx — A single component that renders different content based on the route parameter or path.

  Layout:

  "Miners" (or "Nodes" / "Starter Kits" / "Merchandise")
  "6 products"

  [Filter/Sort bar: Sort by: Popular | Price Low-High | Price High-Low | New]

  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
  │ [Image area]   │  │ [Image area]   │  │ [Image area]   │
  │                │  │                │  │                │
  │ Bitaxe Ultra   │  │ Bitaxe Gamma   │  │ NerdAxe        │
  │ 1.2 TH/s      │  │ 500 GH/s       │  │ 480 GH/s       │
  │                │  │                │  │                │
  │ "The fastest   │  │ "Best value    │  │ "Open source   │
  │  home miner"   │  │  for beginners"│  │  champion"     │
  │                │  │                │  │                │
  │ $249           │  │ $89            │  │ $59            │
  │ ★★★★★ (124)   │  │ ★★★★☆ (89)    │  │ ★★★★★ (201)   │
  │                │  │                │  │                │
  │ [View Product] │  │ [View Product] │  │ [View Product] │
  │                │  │ 🔴 BEST SELLER │  │                │
  └────────────────┘  └────────────────┘  └────────────────┘

  - Responsive grid: 3-col desktop, 2-col tablet, 1-col mobile
  - Product cards: glass surface, image placeholder (gradient rect with category icon), name, hashrate/spec (monospace), short description, price, star
   rating, optional badge ("BEST SELLER", "NEW", "SALE")
  - Clicking a card navigates to the product detail page

  4C: Product Detail Page — /shop/:category/:productSlug

  Create src/pages/shop/ProductPage.tsx

  Layout:

  ┌──────────────────────────────────────────────────────────────┐
  │                                                                │
  │  [LEFT: Product Image Gallery]     [RIGHT: Product Info]      │
  │                                                                │
  │  ┌─────────────────────┐          Bitaxe Ultra               │
  │  │                       │          ★★★★★ (124 reviews)       │
  │  │   [Large image        │                                     │
  │  │    placeholder —      │          $249                       │
  │  │    gradient + icon]   │          🟢 In Stock                │
  │  │                       │                                     │
  │  │                       │          "The most powerful open    │
  │  └─────────────────────┘           source Bitcoin miner for   │
  │  [thumb] [thumb] [thumb]            home use."                │
  │                                                                │
  │                                     SPECS                      │
  │                                     Hashrate:  1.2 TH/s       │
  │                                     Power:     15W             │
  │                                     Chip:      BM1368          │
  │                                     Algo:      SHA-256         │
  │                                     Interface: WiFi + USB-C   │
  │                                     Weight:    240g            │
  │                                                                │
  │                                     [████ Add to Cart ████]   │
  │                                     [    Buy Now — LN ⚡    ] │
  │                                                                │
  │  ──────────────────────────────────────────────────────────── │
  │                                                                │
  │  TAB BAR: [ Description | Specs | Reviews | Setup Guide ]     │
  │                                                                │
  │  Description tab:                                              │
  │  "The Bitaxe Ultra is the flagship open-source Bitcoin         │
  │   miner designed for home use. With 1.2 TH/s of SHA-256       │
  │   hashrate at just 15 watts, it's the perfect device to        │
  │   start solo mining and join The Bitcoin Game..."              │
  │                                                                │
  │  "What's included:"                                            │
  │  ✓ Bitaxe Ultra unit                                          │
  │  ✓ USB-C cable                                                 │
  │  ✓ Quick start guide                                           │
  │  ✓ Pre-configured for TheBitcoinGame.com                      │
  │                                                                │
  │  ──────────────────────────────────────────────────────────── │
  │                                                                │
  │  "YOU MAY ALSO LIKE"                                           │
  │  [Related product card] [Related product card] [Related card] │
  │                                                                │
  └──────────────────────────────────────────────────────────────┘

  Product image area: Since we have no real images, use gradient-filled rectangles with a large product category icon (Phosphor) centered. Use
  different gradient colors per category:
  - Miners: orange gradient
  - Nodes: cyan gradient
  - Kits: purple gradient
  - Merch: green gradient

  Specs table: Monospace values, alternating row backgrounds

  Tab content: Description (rich text), Full Specs (detailed table), Reviews (mock reviews with star ratings, user names, dates), Setup Guide (for
  mining hardware — step-by-step with icons)

  "Add to Cart" and "Buy Now": These are UI-only buttons. Show a toast ("Coming soon — shop launching soon!") on click. Do NOT build an actual cart
  system.

  Related products: 3 cards at the bottom (reuse product card component)

  4D: Mock Data

  Create src/mocks/shop.ts with complete product catalog:

  Miners (6 products):
  ┌──────────────────────┬──────────┬───────┬───────┬────────┬─────────┐
  │       Product        │ Hashrate │ Power │ Price │ Rating │ Reviews │
  ├──────────────────────┼──────────┼───────┼───────┼────────┼─────────┤
  │ Bitaxe Ultra         │ 1.2 TH/s │ 15W   │ $249  │ 4.9    │ 124     │
  ├──────────────────────┼──────────┼───────┼───────┼────────┼─────────┤
  │ Bitaxe Gamma         │ 500 GH/s │ 12W   │ $89   │ 4.7    │ 89      │
  ├──────────────────────┼──────────┼───────┼───────┼────────┼─────────┤
  │ NerdAxe              │ 480 GH/s │ 10W   │ $59   │ 4.8    │ 201     │
  ├──────────────────────┼──────────┼───────┼───────┼────────┼─────────┤
  │ Bitaxe Hex           │ 3.0 TH/s │ 18W   │ $399  │ 4.9    │ 47      │
  ├──────────────────────┼──────────┼───────┼───────┼────────┼─────────┤
  │ Lucky Miner LV06     │ 500 GH/s │ 12W   │ $69   │ 4.5    │ 156     │
  ├──────────────────────┼──────────┼───────┼───────┼────────┼─────────┤
  │ Antminer S9 (Refurb) │ 14 TH/s  │ 1400W │ $149  │ 4.2    │ 312     │
  └──────────────────────┴──────────┴───────┴───────┴────────┴─────────┘
  Nodes (3 products):
  ┌────────────────────┬────────────────────────────────────────┬───────┬────────┐
  │      Product       │              Description               │ Price │ Rating │
  ├────────────────────┼────────────────────────────────────────┼───────┼────────┤
  │ Start9 Embassy     │ Plug-and-play Bitcoin + Lightning node │ $499  │ 4.8    │
  ├────────────────────┼────────────────────────────────────────┼───────┼────────┤
  │ Umbrel Home        │ Beautiful home server for Bitcoin      │ $449  │ 4.7    │
  ├────────────────────┼────────────────────────────────────────┼───────┼────────┤
  │ RaspiBlitz DIY Kit │ DIY Raspberry Pi node kit              │ $199  │ 4.6    │
  └────────────────────┴────────────────────────────────────────┴───────┴────────┘
  Starter Kits (4 bundles):
  ┌──────────────────────┬───────────────────────────────────────────────────────────────┬───────┬─────────┐
  │        Bundle        │                           Contents                            │ Price │ Savings │
  ├──────────────────────┼───────────────────────────────────────────────────────────────┼───────┼─────────┤
  │ Beginner Bundle      │ NerdAxe + Quick Start Guide + Stickers                        │ $69   │ $10     │
  ├──────────────────────┼───────────────────────────────────────────────────────────────┼───────┼─────────┤
  │ Solo Miner Kit       │ Bitaxe Gamma + Trezor Safe 3 + Steel Plate                    │ $199  │ $40     │
  ├──────────────────────┼───────────────────────────────────────────────────────────────┼───────┼─────────┤
  │ Ultimate Bundle      │ Bitaxe Ultra + Trezor Safe 3 + Steel Plate + World Cup Jersey │ $399  │ $80     │
  ├──────────────────────┼───────────────────────────────────────────────────────────────┼───────┼─────────┤
  │ Orange Pill Gift Set │ Bitaxe Gamma + Welcome Card + Gift Box + Education Access     │ $149  │ $25     │
  └──────────────────────┴───────────────────────────────────────────────────────────────┴───────┴─────────┘
  Merchandise (6+ products):
  ┌──────────────────────────┬──────────────────────────────┬───────┐
  │         Product          │         Description          │ Price │
  ├──────────────────────────┼──────────────────────────────┼───────┤
  │ World Cup 2027 Jersey    │ Custom country jersey        │ $49   │
  ├──────────────────────────┼──────────────────────────────┼───────┤
  │ "I Mine Solo" T-Shirt    │ Premium cotton tee           │ $29   │
  ├──────────────────────────┼──────────────────────────────┼───────┤
  │ Block Finder Pin         │ Gold-plated enamel badge pin │ $19   │
  ├──────────────────────────┼──────────────────────────────┼───────┤
  │ Mining Streak Hoodie     │ Embroidered hoodie           │ $59   │
  ├──────────────────────────┼──────────────────────────────┼───────┤
  │ Satoshi's Apprentice Hat │ Embroidered cap              │ $24   │
  ├──────────────────────────┼──────────────────────────────┼───────┤
  │ Bitaxe Sticker Pack      │ 10 vinyl stickers            │ $9    │
  └──────────────────────────┴──────────────────────────────┴───────┘
  Each product should have: slug, name, category, shortDescription, longDescription, price, originalPrice (if on sale), rating, reviewCount, specs
  (key-value pairs), inStock, badge (optional: "BEST SELLER", "NEW", "SALE", "LIMITED"), relatedSlugs, and a list of mock reviews (3-5 per product with
   author, rating, date, text).

  4E: Route Integration

  Update src/routes/router.tsx:

  All shop routes should be under the PublicLayout (public routes, not authenticated) since the shop should be accessible without login:

  import ShopPage from "../pages/shop/ShopPage";
  import CategoryPage from "../pages/shop/CategoryPage";
  import ProductPage from "../pages/shop/ProductPage";

  // Inside PublicLayout children:
  { path: "shop", element: <ShopPage /> },
  { path: "shop/bitaxe", element: <CategoryPage /> },
  { path: "shop/nodes", element: <CategoryPage /> },
  { path: "shop/bundles", element: <CategoryPage /> },
  { path: "shop/merch", element: <CategoryPage /> },
  { path: "shop/:category/:productSlug", element: <ProductPage /> },

  Also remove the shop routes from the authenticated section (they currently exist as Placeholders under the auth guard).

  ---
  Rules

  1. Read HowItWorksPage.tsx fully first. Match the visual quality, animation patterns, section spacing, typography, and glass card treatment for the
  Stats page. The Shop pages should match the overall dark theme and design language but can have their own personality.
  2. Reuse existing components aggressively. <Button>, <Card>, <StatCard>, <Mono>, <Display>, <CountUp>, <FadeIn>, <Tag>, <Sparkline> all exist.
  3. Reuse formatting helpers. formatHashrate, formatNumber, formatBTC, formatTimeAgo from src/mocks/data.ts.
  4. TypeScript strict. No any, no // @ts-ignore. Use type for type-only imports. Use ReturnType<typeof setTimeout> not NodeJS.Timeout.
  5. Phosphor Icons only. Import from @phosphor-icons/react. Pickaxe and Swords do NOT exist — use Hammer instead. For shop icons: Storefront,
  ShoppingCart, TShirt, Desktop, Gift, Package, Star, StarHalf, Truck, Lightning, ShieldCheck, CurrencyBtc.
  6. Bitcoin Orange (#F7931A) is sacred — only for rewards/milestones. For the shop, use it sparingly for "Buy Now" CTAs and prices on sale items. The
  shop nav button uses RED, not orange.
  7. Dark theme only. Canvas #06080C. Use surface, elevated, glass classes.
  8. Responsive. All pages must work at 320px. Shop product grid: 3→2→1 columns. Product detail: 2-col desktop, stacked mobile.
  9. No real cart/checkout. "Add to Cart" and "Buy Now" buttons show a toast: "Shop launching soon! Join the waitlist." This is a UI showcase, not a
  functional store.
  10. No extra docs/README files. Only page/component/mock files.
  11. Reduced motion: Use useReducedMotion. Skip scroll animations and count-up effects when true.
  12. The shop nav button must STAND OUT — it's the one element in the nav that breaks the pattern. Subtle red/crimson gradient, pulsing notification
  dot, slightly more padding than regular nav links. But still tasteful — premium urgency, not garish.

  Files to Create/Edit
  Action: EDIT
  File: src/components/layout/PublicLayout.tsx — Add Stats link + Shop CTA button
  ────────────────────────────────────────
  Action: EDIT
  File: src/routes/router.tsx — (1) Index→HowItWorksPage, (2) Stats→StatsPage, (3) Shop routes to PublicLayout, (4) Remove shop Placeholders from auth
  ────────────────────────────────────────
  Action: CREATE
  File: src/mocks/stats.ts — Global stats mock data
  ────────────────────────────────────────
  Action: CREATE
  File: src/mocks/shop.ts — Full product catalog mock data
  ────────────────────────────────────────
  Action: CREATE
  File: src/pages/public/StatsPage.tsx — Global stats page (7 sections)
  ────────────────────────────────────────
  Action: CREATE
  File: src/pages/shop/ShopPage.tsx — Shop hub with categories + featured + offer banner
  ────────────────────────────────────────
  Action: CREATE
  File: src/pages/shop/CategoryPage.tsx — Product grid with sort/filter
  ────────────────────────────────────────
  Action: CREATE
  File: src/pages/shop/ProductPage.tsx — Full product detail with tabs + related
  Definition of Done

  1. / shows HowItWorksPage (same as /how-it-works)
  2. Navigation bar has "Stats" link and a standout red "Shop" button with pulsing dot
  3. /stats renders all 7 sections with animated counters, Recharts charts, country leaderboard, blocks, timeline, and CTA
  4. /shop shows 4 category cards, featured products scroll, and special offer banner
  5. /shop/bitaxe (and /nodes, /bundles, /merch) shows filtered product grid with sort
  6. /shop/bitaxe/bitaxe-ultra (product detail) shows image area, specs, tabs, related products
  7. "Add to Cart" / "Buy Now" buttons show a toast (no real cart)
  8. Shop button in nav has red gradient + pulsing dot and stands out from regular links
  9. All pages responsive at 320px mobile
  10. Production build passes with 0 TypeScript errors