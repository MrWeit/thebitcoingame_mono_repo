/* ── Mock Data for Public /blocks Page ── */

import { formatNumber, formatTimeAgo, formatBTC } from "./data";
import { getCountryFlag, getCountryName, COUNTRY_NAMES } from "./competition";

/* ── Type ── */
export interface PublicBlock {
  id: number;
  height: number;
  hash: string;
  reward: number;
  timestamp: Date;
  confirmations: number;
  finder: string;
  finderCountry: string; // 2-letter ISO code
}

/* ── Finder Pool ── */
const FINDERS: Array<{ name: string; country: string }> = [
  { name: "SatoshiFan42", country: "JP" },
  { name: "BlockChaser99", country: "US" },
  { name: "MiningViking", country: "NO" },
  { name: "HashMaster", country: "DE" },
  { name: "BitaxeBob", country: "GB" },
  { name: "CryptoRio", country: "BR" },
  { name: "LuckyMiner777", country: "US" },
  { name: "NakamotoNinja", country: "JP" },
  { name: "OrangeMaxi", country: "ES" },
  { name: "NodeRunner01", country: "CH" },
  { name: "SatoshiHunter", country: "PT" },
  { name: "ProofOfWork247", country: "CA" },
  { name: "BitaxeQueen", country: "AU" },
  { name: "LightningLarry", country: "US" },
  { name: "HashrateHero", country: "DE" },
  { name: "SoloStriker", country: "NL" },
  { name: "ThunderboltHash", country: "AU" },
  { name: "StackingSats", country: "NL" },
  { name: "BitcoinBarbara", country: "CA" },
  { name: "TaprootTina", country: "SE" },
  { name: "FullNodeFrank", country: "FR" },
  { name: "MempoolMike", country: "US" },
  { name: "ChainAnalyst", country: "KR" },
  { name: "WhaleMiner", country: "NO" },
  { name: "PetahashPete", country: "US" },
  { name: "CypherPunkSam", country: "GB" },
  { name: "DifficultyKing", country: "BR" },
  { name: "GenesisMiner", country: "JP" },
  { name: "NonceHunter", country: "IT" },
  { name: "TimechainTom", country: "DE" },
];

/* ── Deterministic pseudo-random from seed ── */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 49297;
  return x - Math.floor(x);
}

function generateHash(seed: number): string {
  const zeros = 16 + Math.floor(seededRandom(seed * 3) * 6);
  let hash = "0".repeat(zeros);
  for (let i = hash.length; i < 64; i++) {
    hash += "0123456789abcdef"[Math.floor(seededRandom(seed * 100 + i) * 16)];
  }
  return hash;
}

/* ── Generate 47 blocks ── */
function generateBlocks(): PublicBlock[] {
  const blocks: PublicBlock[] = [];
  let height = 891_234;
  let timestamp = Date.now() - 2 * 86_400_000; // latest: 2 days ago
  const now = Date.now();

  for (let i = 0; i < 47; i++) {
    const finder = FINDERS[i % FINDERS.length];
    const daysBetween = 8 + Math.floor(seededRandom(i * 7 + 13) * 10); // 8-17 days apart
    const confirmations = Math.floor((now - timestamp) / (10 * 60 * 1000)); // ~1 conf per 10 min

    blocks.push({
      id: i + 1,
      height,
      hash: generateHash(i),
      reward: 3.125,
      timestamp: new Date(timestamp),
      confirmations: Math.max(confirmations, 1),
      finder: finder.name,
      finderCountry: finder.country,
    });

    // Move backwards in time
    height -= 1500 + Math.floor(seededRandom(i * 11 + 7) * 1500);
    timestamp -= daysBetween * 86_400_000;
  }

  return blocks;
}

export const mockAllBlocks: PublicBlock[] = generateBlocks();

/* ── Timeline: blocks per month ── */
function generateTimeline(blocks: PublicBlock[]): Array<{ month: string; blocks: number }> {
  const monthCounts: Record<string, number> = {};

  for (const block of blocks) {
    const d = block.timestamp;
    const key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    monthCounts[key] = (monthCounts[key] || 0) + 1;
  }

  // Sort chronologically
  const entries = Object.entries(monthCounts);
  entries.sort((a, b) => {
    const da = new Date(a[0]);
    const db = new Date(b[0]);
    return da.getTime() - db.getTime();
  });

  return entries.map(([month, count]) => ({ month, blocks: count }));
}

export const mockBlocksTimeline = generateTimeline(mockAllBlocks);

/* ── Aggregate stats ── */
function computeStats(blocks: PublicBlock[]) {
  const totalBlocks = blocks.length;
  const totalBTC = totalBlocks * 3.125;
  const btcPrice = 100_000;
  const totalFiat = totalBTC * btcPrice;

  // Unique countries
  const countries = new Set(blocks.map((b) => b.finderCountry));
  const uniqueMiners = new Set(blocks.map((b) => b.finder));

  // Average days between blocks
  const sorted = [...blocks].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  let totalDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalDays += (sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime()) / 86_400_000;
  }
  const avgDaysBetweenBlocks = totalDays / (sorted.length - 1);

  // Blocks by country (top 10)
  const countryMap: Record<string, number> = {};
  for (const block of blocks) {
    countryMap[block.finderCountry] = (countryMap[block.finderCountry] || 0) + 1;
  }
  const blocksByCountry = Object.entries(countryMap)
    .map(([code, count]) => ({
      code,
      country: COUNTRY_NAMES[code] || code,
      flag: getCountryFlag(code),
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalBlocks,
    totalBTC,
    totalFiat,
    btcPrice,
    countriesRepresented: countries.size,
    uniqueMiners: uniqueMiners.size,
    avgDaysBetweenBlocks: Math.round(avgDaysBetweenBlocks * 10) / 10,
    latestBlock: blocks[0],
    blocksByCountry,
  };
}

export const mockBlockStats = computeStats(mockAllBlocks);

/* ── Re-exports ── */
export { formatNumber, formatTimeAgo, formatBTC, getCountryFlag, getCountryName };
