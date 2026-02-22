/* ── Mock Data: Profile ── */

export interface ActivityItem {
  id: string;
  type: "mining" | "badge" | "game" | "competition" | "system";
  subtype: string;
  description: string;
  timestamp: Date;
  actionUrl?: string;
  xp?: number;
}

const now = Date.now();
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const mockActivityFeed: ActivityItem[] = [
  // Today
  { id: "a-1", type: "mining", subtype: "personal_best", description: "New personal best: 4.2B", timestamp: new Date(now - 2 * HOUR), actionUrl: "/mining/difficulty", xp: 50 },
  { id: "a-2", type: "mining", subtype: "share", description: "Share submitted (diff: 4,231,847,293)", timestamp: new Date(now - 2 * HOUR - 1000), actionUrl: "/mining/shares" },
  { id: "a-3", type: "mining", subtype: "worker_online", description: "bitaxe-living-room connected", timestamp: new Date(now - 6 * HOUR), actionUrl: "/mining/workers" },
  // Yesterday
  { id: "a-4", type: "badge", subtype: "earned", description: 'Badge earned: "Quarter Master" (+100 XP)', timestamp: new Date(now - DAY - 2 * HOUR), actionUrl: "/profile/badges", xp: 100 },
  { id: "a-5", type: "system", subtype: "level_up", description: "Level up: Level 7 — Hash Veteran", timestamp: new Date(now - DAY - 6 * HOUR), xp: 0 },
  { id: "a-6", type: "mining", subtype: "worker_offline", description: "nerdaxe-office disconnected", timestamp: new Date(now - DAY - 12 * HOUR), actionUrl: "/mining/workers" },
  // 2 days ago
  { id: "a-7", type: "game", subtype: "played", description: "Played Hammer Game (rank #12)", timestamp: new Date(now - 2 * DAY), actionUrl: "/games/hammer" },
  { id: "a-8", type: "competition", subtype: "streak", description: "Streak extended: Week 12", timestamp: new Date(now - 2 * DAY - 4 * HOUR), actionUrl: "/profile/streaks" },
  // 3 days ago
  { id: "a-9", type: "competition", subtype: "match", description: "World Cup: PT 3 - DE 2 (You won!)", timestamp: new Date(now - 3 * DAY), actionUrl: "/world-cup" },
  { id: "a-10", type: "badge", subtype: "earned", description: 'Badge earned: "World Cup Miner" (+75 XP)', timestamp: new Date(now - 3 * DAY - 1 * HOUR), actionUrl: "/profile/badges", xp: 75 },
  // 4 days ago
  { id: "a-11", type: "mining", subtype: "personal_best", description: "New personal best: 3.8B", timestamp: new Date(now - 4 * DAY), actionUrl: "/mining/difficulty", xp: 40 },
  { id: "a-12", type: "game", subtype: "played", description: "Played Horse Race (rank #8)", timestamp: new Date(now - 4 * DAY - 8 * HOUR), actionUrl: "/games/horse-race" },
  // 5 days ago
  { id: "a-13", type: "mining", subtype: "share", description: "Above average share: 92M", timestamp: new Date(now - 5 * DAY), actionUrl: "/mining/shares" },
  { id: "a-14", type: "competition", subtype: "coop", description: "Mining Vikings reached #34 weekly rank", timestamp: new Date(now - 5 * DAY - 6 * HOUR), actionUrl: "/coop" },
  // Last week
  { id: "a-15", type: "badge", subtype: "earned", description: 'Badge earned: "Megahash" (+50 XP)', timestamp: new Date(now - 7 * DAY), actionUrl: "/profile/badges", xp: 50 },
  { id: "a-16", type: "game", subtype: "played", description: "Played Slot Machine (rank #22)", timestamp: new Date(now - 7 * DAY - 10 * HOUR), actionUrl: "/games/slots" },
  { id: "a-17", type: "mining", subtype: "worker_online", description: "bitaxe-bedroom connected", timestamp: new Date(now - 8 * DAY), actionUrl: "/mining/workers" },
  { id: "a-18", type: "competition", subtype: "streak", description: "Streak extended: Week 11", timestamp: new Date(now - 9 * DAY), actionUrl: "/profile/streaks" },
  { id: "a-19", type: "mining", subtype: "personal_best", description: "New personal best: 2.1B", timestamp: new Date(now - 10 * DAY), actionUrl: "/mining/difficulty", xp: 30 },
  { id: "a-20", type: "badge", subtype: "earned", description: 'Badge earned: "Billion Club" (+75 XP)', timestamp: new Date(now - 10 * DAY - 3 * HOUR), actionUrl: "/profile/badges", xp: 75 },
];

// Mining history chart data (52 weeks)
export const mockMiningHistory = Array.from({ length: 52 }, (_, i) => ({
  week: `W${52 - i}`,
  date: new Date(now - (51 - i) * 7 * DAY).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  shares: i < 10 ? 0 : Math.floor(8000 + Math.random() * 12000 + i * 200),
}));

// Difficulty progression (52 weeks)
export const mockDifficultyProgression = Array.from({ length: 52 }, (_, i) => ({
  week: `W${52 - i}`,
  date: new Date(now - (51 - i) * 7 * DAY).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  bestDiff: i < 10 ? 0 : Math.floor(Math.exp(14 + (i / 52) * 8 + Math.random() * 2)),
}));

// Competition history
export const mockCompetitionHistory = [
  { id: "wc-2027", name: "Solo Mining World Cup 2027", date: "Jan 2027", result: "Semi-finalist", country: "PT" },
  { id: "league-q4", name: "Champions League Q4 2026", date: "Oct 2026", result: "#8 — Lisbon Legends", country: "PT" },
];

// Profile stats
export const mockProfileStats = {
  totalShares: 892_104,
  bestDifficulty: 7_104_293_847,
  totalUptime: 347,
  blocksFound: 0,
  hashrate24h: 1_210_000_000_000,
  badgesEarned: 9,
  totalBadges: 16,
};
