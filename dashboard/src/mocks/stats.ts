/* ── Global Stats Mock Data for /stats page ── */

import { formatHashrate, formatNumber } from "./data";

/* ── Platform-wide statistics ── */
export const mockGlobalStats = {
  totalMiners: 12_847,
  newMinersToday: 234,
  totalHashrate: 2.4e18, // 2.4 EH/s
  hashrateChange24h: 3.2, // percent
  blocksFound: 47,
  latestBlockAge: 2 * 24 * 3600, // 2 days in seconds
  totalSharesThisWeek: 1_247_832_104,
  countriesRepresented: 47,
};

/* ── Network hashrate history (per time range) ── */
function generateHashrateHistory(
  points: number,
  intervalMs: number,
  baseHashrate: number,
  variance: number,
) {
  return Array.from({ length: points }, (_, i) => ({
    time: new Date(Date.now() - (points - 1 - i) * intervalMs).toISOString(),
    value: baseHashrate + (Math.random() - 0.3) * variance,
  }));
}

export const mockNetworkHashrate = {
  "24h": generateHashrateHistory(24, 3_600_000, 2.4e18, 0.3e18),
  "7d": generateHashrateHistory(42, 4 * 3_600_000, 2.2e18, 0.4e18),
  "30d": generateHashrateHistory(30, 86_400_000, 2.0e18, 0.6e18),
  all: generateHashrateHistory(26, 7 * 86_400_000, 1.2e18, 1.0e18),
};

/* ── Shares per hour (24 entries) ── */
const currentHour = new Date().getHours();
export const mockSharesPerHour = Array.from({ length: 24 }, (_, i) => ({
  hour: `${i.toString().padStart(2, "0")}:00`,
  shares: Math.floor(Math.random() * 800_000) + 200_000,
  isCurrent: i === currentHour,
}));

/* ── Difficulty distribution buckets ── */
export const mockDiffDistribution = [
  { bucket: "1K+", count: 42_800, fill: "#8B949E" },
  { bucket: "1M+", count: 18_200, fill: "#58A6FF" },
  { bucket: "1B+", count: 4_120, fill: "#A371F7" },
  { bucket: "1T+", count: 87, fill: "#F7931A" },
];

/* ── Country stats (top 10) ── */
export const mockCountryStats = [
  { country: "United States", code: "US", flag: "🇺🇸", miners: 847, hashrate: 12.4e15 },
  { country: "Japan", code: "JP", flag: "🇯🇵", miners: 623, hashrate: 8.7e15 },
  { country: "Germany", code: "DE", flag: "🇩🇪", miners: 512, hashrate: 6.2e15 },
  { country: "United Kingdom", code: "GB", flag: "🇬🇧", miners: 489, hashrate: 5.8e15 },
  { country: "Brazil", code: "BR", flag: "🇧🇷", miners: 401, hashrate: 4.9e15 },
  { country: "Portugal", code: "PT", flag: "🇵🇹", miners: 287, hashrate: 3.4e15 },
  { country: "Norway", code: "NO", flag: "🇳🇴", miners: 256, hashrate: 3.1e15 },
  { country: "Canada", code: "CA", flag: "🇨🇦", miners: 234, hashrate: 2.8e15 },
  { country: "Australia", code: "AU", flag: "🇦🇺", miners: 198, hashrate: 2.4e15 },
  { country: "Netherlands", code: "NL", flag: "🇳🇱", miners: 176, hashrate: 2.1e15 },
];

/* ── Extended blocks (for recent blocks section) ── */
export const mockRecentBlocks = [
  {
    height: 891_234,
    finder: "SatoshiFan42",
    finderCountry: "🇯🇵",
    reward: 3.125,
    timestamp: new Date(Date.now() - 2 * 86_400_000),
  },
  {
    height: 889_102,
    finder: "BlockChaser99",
    finderCountry: "🇺🇸",
    reward: 3.125,
    timestamp: new Date(Date.now() - 12 * 86_400_000),
  },
  {
    height: 887_456,
    finder: "MiningViking",
    finderCountry: "🇳🇴",
    reward: 3.125,
    timestamp: new Date(Date.now() - 21 * 86_400_000),
  },
  {
    height: 885_901,
    finder: "HashMaster",
    finderCountry: "🇩🇪",
    reward: 3.125,
    timestamp: new Date(Date.now() - 35 * 86_400_000),
  },
  {
    height: 883_244,
    finder: "BitaxeBob",
    finderCountry: "🇬🇧",
    reward: 3.125,
    timestamp: new Date(Date.now() - 52 * 86_400_000),
  },
  {
    height: 880_712,
    finder: "CryptoRio",
    finderCountry: "🇧🇷",
    reward: 3.125,
    timestamp: new Date(Date.now() - 74 * 86_400_000),
  },
];

/* ── Platform milestones ── */
export const mockMilestones = [
  {
    date: "Feb 2026",
    title: "Platform Launch",
    description: "First miner connected. The game begins.",
  },
  {
    date: "Mar 2026",
    title: "1,000 Miners",
    description: "Hashrate crosses 1 PH/s. 12 countries represented.",
  },
  {
    date: "May 2026",
    title: "First Block Found!",
    description: "SatoshiFan42 finds Block #891,234. 🇯🇵 Japan.",
  },
  {
    date: "Jul 2026",
    title: "First World Cup",
    description: "32 countries competed. 🇺🇸 USA won the inaugural cup.",
  },
  {
    date: "Oct 2026",
    title: "10,000 Miners",
    description: "47 blocks found. 47 countries. The world is mining.",
  },
];

/* ── Formatting helpers (re-export convenience) ── */
export { formatHashrate, formatNumber };
