/* ── Layout Constants ── */
export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_COLLAPSED = 72;
export const CONTENT_MAX_WIDTH = 1280;
export const TOPBAR_HEIGHT = 64;
export const TABBAR_HEIGHT = 56;

/* ── Breakpoints ── */
export const BREAKPOINTS = {
  sm: 320,
  md: 768,
  lg: 1024,
  xl: 1441,
} as const;

/* ── Rarity Colors ── */
export const RARITY_COLORS = {
  common: "#8B949E",
  rare: "#58A6FF",
  epic: "#A371F7",
  legendary: "#D4A843",
} as const;

export type Rarity = keyof typeof RARITY_COLORS;

/* ── Navigation Sections ── */
export const NAV_SECTIONS = [
  {
    label: "PLAY",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: "House" as const },
      { label: "Games", path: "/games", icon: "GameController" as const },
      { label: "World Cup", path: "/world-cup", icon: "Trophy" as const },
      { label: "Leagues", path: "/leagues", icon: "ShieldStar" as const },
    ],
  },
  {
    label: "MINE",
    items: [
      { label: "Workers", path: "/mining/workers", icon: "HardDrives" as const },
      { label: "Shares", path: "/mining/shares", icon: "ChartBar" as const },
      { label: "Difficulty", path: "/mining/difficulty", icon: "Diamond" as const },
      { label: "Blocks Found", path: "/mining/blocks", icon: "Cube" as const },
    ],
  },
  {
    label: "SOCIAL",
    items: [
      { label: "Leaderboard", path: "/leaderboard", icon: "ListNumbers" as const },
      { label: "Cooperative", path: "/coop", icon: "UsersThree" as const },
      { label: "Education", path: "/learn", icon: "GraduationCap" as const },
    ],
  },
  {
    label: "ME",
    items: [
      { label: "Badges", path: "/profile/badges", icon: "Medal" as const },
      { label: "Profile", path: "/profile", icon: "UserCircle" as const },
      { label: "Settings", path: "/settings", icon: "Gear" as const },
    ],
  },
] as const;

/* ── Mobile Tab Bar Items ── */
export const TAB_ITEMS = [
  { label: "Mine", path: "/dashboard", icon: "Hammer" as const, matchPaths: ["/dashboard", "/mining"] },
  { label: "Games", path: "/games", icon: "GameController" as const, matchPaths: ["/games"] },
  { label: "Cup", path: "/world-cup", icon: "Trophy" as const, matchPaths: ["/world-cup", "/leagues"] },
  { label: "Badges", path: "/profile/badges", icon: "Medal" as const, matchPaths: ["/profile/badges", "/profile/streaks", "/profile/level"] },
  { label: "Profile", path: "/profile", icon: "UserCircle" as const, matchPaths: ["/profile", "/settings", "/coop"] },
] as const;
