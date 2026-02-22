/* ── Mock Data for The Bitcoin Game ── */

export const mockUser = {
  id: 1,
  address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
  displayName: "SatoshiHunter",
  countryCode: "PT",
  level: 7,
  levelTitle: "Solo Miner",
  xp: 2340,
  xpToNext: 5000,
  streak: 12,
  isVerified: true,
  createdAt: new Date("2025-11-15"),
};

export const mockWorkers = [
  {
    id: 1,
    name: "bitaxe-living-room",
    isOnline: true,
    hashrate1m: 480_000_000_000,
    hashrate1h: 475_000_000_000,
    hashrate24h: 470_000_000_000,
    currentDiff: 1024,
    bestDiff: 2_847_193_472,
    sharesPerHour: 1247,
    uptime: 14 * 24 * 3600 + 7 * 3600 + 32 * 60,
    lastShare: new Date(Date.now() - 3000),
    acceptRate: 99.7,
    temperature: 47,
    ip: "192.168.1.42",
    userAgent: "Bitaxe/2.1.0",
    stratumVersion: "2.0",
  },
  {
    id: 2,
    name: "bitaxe-bedroom",
    isOnline: true,
    hashrate1m: 420_000_000_000,
    hashrate1h: 415_000_000_000,
    hashrate24h: 410_000_000_000,
    currentDiff: 1024,
    bestDiff: 1_923_847_102,
    sharesPerHour: 1089,
    uptime: 10 * 24 * 3600 + 3 * 3600,
    lastShare: new Date(Date.now() - 5000),
    acceptRate: 99.8,
    temperature: 44,
    ip: "192.168.1.43",
    userAgent: "Bitaxe/2.1.0",
    stratumVersion: "2.0",
  },
  {
    id: 3,
    name: "nerdaxe-office",
    isOnline: false,
    hashrate1m: 0,
    hashrate1h: 0,
    hashrate24h: 300_000_000_000,
    currentDiff: 512,
    bestDiff: 1_104_293_847,
    sharesPerHour: 0,
    uptime: 0,
    lastShare: new Date(Date.now() - 7_200_000),
    acceptRate: 99.5,
    temperature: null,
    ip: "192.168.1.55",
    userAgent: "NerdAxe/1.0.3",
    stratumVersion: "1.0",
  },
];

export const mockDashboardStats = {
  hashrate: 1_210_000_000_000,
  hashrateChange: 3.2,
  sharesToday: 47832,
  sharesChange: 12,
  workersOnline: 2,
  workersTotal: 3,
  streak: 12,
  bestDiffWeek: 4_231_847_293,
  networkDiff: 100_847_293_444_000,
  bestDiffRatio: 0.0000042,
};

/* ── Hashrate History (multiple ranges) ── */
export const mockHashrateHistory = {
  "1h": Array.from({ length: 60 }, (_, i) => ({
    time: new Date(Date.now() - (59 - i) * 60_000).toISOString(),
    value: 1_100_000_000_000 + Math.random() * 200_000_000_000,
  })),
  "24h": Array.from({ length: 24 }, (_, i) => ({
    time: new Date(Date.now() - (23 - i) * 3600_000).toISOString(),
    value: 1_100_000_000_000 + Math.random() * 200_000_000_000,
  })),
  "7d": Array.from({ length: 7 * 24 }, (_, i) => ({
    time: new Date(Date.now() - (7 * 24 - 1 - i) * 3600_000).toISOString(),
    value: 1_000_000_000_000 + Math.random() * 300_000_000_000,
  })),
  "30d": Array.from({ length: 30 }, (_, i) => ({
    time: new Date(Date.now() - (29 - i) * 86_400_000).toISOString(),
    value: 900_000_000_000 + Math.random() * 400_000_000_000,
  })),
};

/* ── Shares Feed ── */
export const mockSharesFeed = Array.from({ length: 20 }, (_, i) => ({
  id: `share-${i}`,
  timestamp: new Date(Date.now() - i * 15000),
  worker: mockWorkers[i % 3].name,
  difficulty: Math.floor(Math.random() * 100_000_000) + 1_000_000,
  isPersonalBest: i === 3,
  isAboveAverage: i % 3 === 0,
}));

/* ── Full Shares Table (50 entries) ── */
const shareHashes = [
  "0000000000000a3f", "00000000000012cb", "000000000000087e",
  "0000000000001fda", "00000000000004a1", "0000000000000b92",
  "000000000000167c", "0000000000000c4d", "00000000000009f3",
  "0000000000001ae8",
];

export const mockShares = Array.from({ length: 50 }, (_, i) => {
  const difficulty = i === 7
    ? 4_231_847_293
    : Math.floor(Math.random() * 500_000_000) + 500_000;
  const isValid = Math.random() > 0.03;
  return {
    id: `share-full-${i}`,
    timestamp: new Date(Date.now() - i * 30_000),
    worker: mockWorkers[i % 3].name,
    difficulty,
    shareDiff: difficulty * (1 + Math.random() * 0.3),
    valid: isValid,
    isBlock: i === 7 && Math.random() > 0.95,
    hash: shareHashes[i % shareHashes.length] + "0".repeat(48) + Math.floor(Math.random() * 1e12).toString(16).padStart(16, "0"),
    nonce: Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, "0"),
    networkDiffAtTime: 100_847_293_444_000 + Math.floor(Math.random() * 1_000_000_000),
    isPersonalBest: i === 7,
    isAboveAverage: difficulty > 50_000_000,
  };
});

/* ── Weekly Best ── */
export const mockWeeklyBest = {
  difficulty: 4_231_847_293,
  hash: "0000000000000a3f" + "0".repeat(48) + "deadbeef01234567",
  timestamp: new Date(Date.now() - 3_600_000 * 5),
  rank: 12,
  percentile: 94,
};

/* ── Personal Bests ── */
export const mockPersonalBests = [
  { period: "This Week", difficulty: 4_231_847_293, date: new Date(), rank: 12 },
  { period: "Last Week", difficulty: 3_892_104_556, date: new Date(Date.now() - 7 * 86_400_000), rank: 18 },
  { period: "This Month", difficulty: 4_231_847_293, date: new Date(), rank: 8 },
  { period: "All Time", difficulty: 7_104_293_847, date: new Date("2026-01-12"), rank: 45 },
];

/* ── Blocks Found ── */
export const mockBlocks = [
  {
    id: 1,
    height: 879_412,
    hash: "0000000000000000000234abc891def456789abcdef0123456789abcdef01234",
    reward: 3.125,
    timestamp: new Date("2026-01-28T14:23:00"),
    confirmations: 289,
    finder: "LuckyMiner777",
    finderCountry: "US",
    isOurs: false,
  },
  {
    id: 2,
    height: 878_991,
    hash: "00000000000000000001f8a3b7c9d2e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0",
    reward: 3.125,
    timestamp: new Date("2026-01-25T09:11:00"),
    confirmations: 710,
    finder: "BitaxeBob",
    finderCountry: "GB",
    isOurs: false,
  },
  {
    id: 3,
    height: 877_204,
    hash: "0000000000000000000098765432abcdef1234567890abcdef1234567890abcd",
    reward: 3.125,
    timestamp: new Date("2026-01-18T21:47:00"),
    confirmations: 2497,
    finder: "MiningViking",
    finderCountry: "NO",
    isOurs: false,
  },
  {
    id: 4,
    height: 875_830,
    hash: "000000000000000000007777888899990000aaaabbbbccccddddeeeeffff0000",
    reward: 3.125,
    timestamp: new Date("2026-01-09T03:22:00"),
    confirmations: 3871,
    finder: "HashMaster",
    finderCountry: "DE",
    isOurs: false,
  },
];

/* ── Badges (earned + locked) ── */
export const mockBadges = [
  { slug: "first_share", name: "First Hash", description: "Submit your first share", rarity: "common" as const, earned: { date: new Date("2025-11-15") } },
  { slug: "shares_1k", name: "Hash Thousand", description: "Submit 1,000 shares", rarity: "common" as const, earned: { date: new Date("2025-11-16") } },
  { slug: "shares_1m", name: "Megahash", description: "Submit 1,000,000 shares", rarity: "rare" as const, earned: { date: new Date("2025-12-20") } },
  { slug: "diff_1e6", name: "Million Club", description: "Best diff > 1,000,000", rarity: "common" as const, earned: { date: new Date("2025-11-15") } },
  { slug: "diff_1e9", name: "Billion Club", description: "Best diff > 1,000,000,000", rarity: "rare" as const, earned: { date: new Date("2025-12-01") } },
  { slug: "streak_4", name: "Month Strong", description: "4-week mining streak", rarity: "common" as const, earned: { date: new Date("2025-12-13") } },
  { slug: "streak_12", name: "Quarter Master", description: "12-week streak", rarity: "rare" as const, earned: { date: new Date("2026-02-07") } },
  { slug: "world_cup_participant", name: "World Cup Miner", description: "Participate in a World Cup", rarity: "rare" as const, earned: { date: new Date("2026-01-20") } },
  { slug: "rabbit_hole_complete", name: "Down the Rabbit Hole", description: "Complete education track", rarity: "common" as const, earned: { date: new Date("2026-01-05") } },
  { slug: "block_finder", name: "Block Finder", description: "Find a Bitcoin block solo", rarity: "legendary" as const },
  { slug: "diff_1e12", name: "Trillion Club", description: "Best diff > 1T", rarity: "epic" as const },
  { slug: "streak_52", name: "Year of Mining", description: "52-week streak", rarity: "legendary" as const },
  { slug: "node_runner", name: "Node Runner", description: "Run a Bitcoin full node", rarity: "rare" as const },
  { slug: "coop_founder", name: "Cooperative Founder", description: "Create a cooperative", rarity: "rare" as const },
  { slug: "weekly_diff_champion", name: "Diff Champion", description: "Highest difficulty of the week", rarity: "epic" as const },
  { slug: "orange_piller", name: "Orange Piller", description: "Gift a Bitaxe to a nocoiner", rarity: "rare" as const },
];

export const mockBadgesEarned = mockBadges.filter((b) => !!b.earned);

/* ── Upcoming Events ── */
export const mockUpcomingEvents = [
  {
    id: "world-cup",
    title: "Bitcoin Mining World Cup",
    description: "Portugal vs Spain — Round of 16",
    endsAt: new Date(Date.now() + 2 * 86_400_000 + 5 * 3600_000),
    type: "world-cup" as const,
    action: { label: "View Match", href: "/world-cup" },
  },
  {
    id: "lottery",
    title: "Weekly Lottery Draw",
    description: "47,832 tickets earned this week",
    endsAt: new Date(Date.now() + 3 * 86_400_000 + 14 * 3600_000),
    type: "lottery" as const,
    action: { label: "Preview Ticket", href: "/games" },
  },
  {
    id: "streak",
    title: "Streak Timer",
    description: "Keep mining to maintain your 12-week streak",
    endsAt: new Date(Date.now() + 5 * 86_400_000 + 8 * 3600_000),
    type: "streak" as const,
    action: { label: "View Streak", href: "/profile/streaks" },
  },
];

/* ── Global Feed ── */
export const mockGlobalFeed = [
  { id: "gf-1", type: "block" as const, text: "LuckyMiner777 found block #879,412!", time: new Date(Date.now() - 1_800_000) },
  { id: "gf-2", type: "badge" as const, text: "BitaxeBob earned Trillion Club badge", time: new Date(Date.now() - 3_600_000) },
  { id: "gf-3", type: "miner" as const, text: "New miner from Portugal joined the platform", time: new Date(Date.now() - 5_400_000) },
  { id: "gf-4", type: "worldcup" as const, text: "World Cup: Japan advances to Quarter Finals", time: new Date(Date.now() - 7_200_000) },
  { id: "gf-5", type: "block" as const, text: "BitaxeBob found block #878,991!", time: new Date(Date.now() - 86_400_000) },
  { id: "gf-6", type: "badge" as const, text: "MiningViking earned Year of Mining badge", time: new Date(Date.now() - 100_000_000) },
  { id: "gf-7", type: "miner" as const, text: "New miner from Brazil joined the platform", time: new Date(Date.now() - 120_000_000) },
  { id: "gf-8", type: "badge" as const, text: "SatoshiHunter earned Quarter Master badge", time: new Date(Date.now() - 172_800_000) },
  { id: "gf-9", type: "worldcup" as const, text: "World Cup: Registration open for February", time: new Date(Date.now() - 259_200_000) },
  { id: "gf-10", type: "block" as const, text: "MiningViking found block #877,204!", time: new Date(Date.now() - 345_600_000) },
];

/* ── Difficulty Scatter Data ── */
export const mockDifficultyScatter = Array.from({ length: 200 }, (_, i) => ({
  time: new Date(Date.now() - (199 - i) * 600_000).getTime(),
  difficulty: Math.floor(Math.exp(Math.random() * 15 + 10)),
  isBest: i === 142,
}));

/* ── Difficulty Distribution Histogram ── */
export const mockDifficultyDistribution = [
  { range: "1K-10K", count: 12400, label: "1K" },
  { range: "10K-100K", count: 18200, label: "10K" },
  { range: "100K-1M", count: 9800, label: "100K" },
  { range: "1M-10M", count: 4200, label: "1M" },
  { range: "10M-100M", count: 1800, label: "10M" },
  { range: "100M-1B", count: 620, label: "100M" },
  { range: "1B-10B", count: 85, label: "1B" },
  { range: "10B+", count: 3, label: "10B" },
];

/* ── Worker Hashrate History (per-worker) ── */
export const mockWorkerHashrateHistory = (workerId: number) =>
  Array.from({ length: 24 }, (_, i) => {
    const base = workerId === 1 ? 480e9 : workerId === 2 ? 420e9 : 310e9;
    return {
      time: new Date(Date.now() - (23 - i) * 3600_000).toISOString(),
      value: base * (0.9 + Math.random() * 0.2),
    };
  });

/* ── Uptime Calendar (GitHub-style) ── */
export const mockUptimeCalendar = Array.from({ length: 90 }, (_, i) => {
  const date = new Date(Date.now() - (89 - i) * 86_400_000);
  const shares = i < 10 ? 0 : Math.floor(Math.random() * 4000) + 500;
  return {
    date: date.toISOString().split("T")[0],
    shares,
    uptimeHours: shares > 0 ? Math.floor(Math.random() * 6) + 18 : 0,
  };
});

/* ── Sparkline Data ── */
export const mockSparklineData = {
  hashrate: [68, 72, 70, 75, 73, 78, 80, 77, 82, 85, 83, 88],
  shares: [120, 135, 128, 142, 138, 155, 160, 152, 165, 170, 168, 175],
  difficulty: [45, 52, 48, 58, 55, 62, 68, 65, 72, 78, 75, 82],
};

/* ── Leaderboard ── */
export const mockLeaderboard = [
  { rank: 1, name: "SatoshiHunter42", country: "JP", bestDiff: 12_847_293_444_102, shares: 892104 },
  { rank: 2, name: "BlockChaser99", country: "US", bestDiff: 11_293_847_102_847, shares: 743892 },
  { rank: 3, name: "MiningViking", country: "NO", bestDiff: 9_712_847_293_847, shares: 681234 },
  { rank: 4, name: "HashMaster", country: "DE", bestDiff: 8_412_293_847_102, shares: 612847 },
  { rank: 5, name: "BitaxeBob", country: "GB", bestDiff: 7_923_847_102_293, shares: 587293 },
  { rank: 6, name: "CryptoMike", country: "CA", bestDiff: 7_104_293_847_102, shares: 562847 },
  { rank: 7, name: "NocoinerNoMore", country: "BR", bestDiff: 6_847_102_293_847, shares: 541293 },
  { rank: 8, name: "ThunderboltHash", country: "AU", bestDiff: 6_293_847_102_847, shares: 512847 },
  { rank: 9, name: "OrangeMaxi", country: "ES", bestDiff: 5_847_293_102_847, shares: 487293 },
  { rank: 10, name: "StackingSats", country: "NL", bestDiff: 5_293_847_102_847, shares: 462847 },
  { rank: 11, name: "NodeRunner01", country: "CH", bestDiff: 4_847_293_102_847, shares: 441293 },
  { rank: 12, name: "SatoshiHunter", country: "PT", bestDiff: 4_231_847_293, shares: 412847 },
];

/* ── Format Helpers ── */
export function formatHashrate(hashesPerSecond: number): string {
  if (hashesPerSecond >= 1e15) return `${(hashesPerSecond / 1e15).toFixed(1)} PH/s`;
  if (hashesPerSecond >= 1e12) return `${(hashesPerSecond / 1e12).toFixed(2)} TH/s`;
  if (hashesPerSecond >= 1e9) return `${(hashesPerSecond / 1e9).toFixed(1)} GH/s`;
  if (hashesPerSecond >= 1e6) return `${(hashesPerSecond / 1e6).toFixed(1)} MH/s`;
  return `${hashesPerSecond.toFixed(0)} H/s`;
}

export function formatDifficulty(diff: number): string {
  if (diff >= 1e12) return `${(diff / 1e12).toFixed(1)}T`;
  if (diff >= 1e9) return `${(diff / 1e9).toFixed(1)}B`;
  if (diff >= 1e6) return `${(diff / 1e6).toFixed(1)}M`;
  if (diff >= 1e3) return `${(diff / 1e3).toFixed(1)}K`;
  return diff.toFixed(0);
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatBTC(sats: number): string {
  return `${sats.toFixed(8)} BTC`;
}

export function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

export function formatCountdown(targetDate: Date): string {
  const diff = targetDate.getTime() - Date.now();
  if (diff <= 0) return "Now!";
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function generateShareId(): string {
  return `share-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
