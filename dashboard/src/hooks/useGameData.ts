import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/* ── Types ── */
export interface BlockFoundData {
  height: number;
  reward: number;
  hash: string;
}

export interface WeeklyGameData {
  weekStart: Date;
  weekEnd: Date;
  bestDifficulty: number;
  bestDifficultyTime: Date;
  bestHash: string;
  networkDifficulty: number;
  progressRatio: number;
  dailyBestDiffs: Record<string, number>;
  totalShares: number;
  weeklyRank: number;
  percentile: number;
  blockFound: boolean;
  blockData?: BlockFoundData;
  userName: string;
}

export interface PastWeekResult {
  weekStart: Date;
  weekEnd: Date;
  bestDifficulty: number;
  weeklyRank: number;
  gamePlayed: string;
}

/* ── Mock Data ── */
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekEnd(): Date {
  const start = getWeekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

const MOCK_BEST_HASH =
  "0000000000000a3f8b2c4d6e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a";

const MOCK_DAILY_DIFFS: Record<string, number> = {
  mon: 2_847_193_472,
  tue: 1_923_847_102,
  wed: 4_231_847_293,
  thu: 3_104_293_847,
  fri: 1_847_102_293,
  sat: 2_293_847_102,
  sun: 3_847_293_102,
};

const MOCK_BLOCK_DATA: BlockFoundData = {
  height: 879_412,
  reward: 3.125,
  hash: "0000000000000000000234abc891def456789abcdef0123456789abcdef01234",
};

const MOCK_PAST_WEEKS: PastWeekResult[] = [
  {
    weekStart: new Date(Date.now() - 7 * 86_400_000),
    weekEnd: new Date(Date.now() - 1 * 86_400_000),
    bestDifficulty: 3_892_104_556,
    weeklyRank: 18,
    gamePlayed: "hammer",
  },
  {
    weekStart: new Date(Date.now() - 14 * 86_400_000),
    weekEnd: new Date(Date.now() - 8 * 86_400_000),
    bestDifficulty: 2_104_293_847,
    weeklyRank: 24,
    gamePlayed: "horse-race",
  },
  {
    weekStart: new Date(Date.now() - 21 * 86_400_000),
    weekEnd: new Date(Date.now() - 15 * 86_400_000),
    bestDifficulty: 5_293_847_102,
    weeklyRank: 9,
    gamePlayed: "slots",
  },
  {
    weekStart: new Date(Date.now() - 28 * 86_400_000),
    weekEnd: new Date(Date.now() - 22 * 86_400_000),
    bestDifficulty: 1_847_293_102,
    weeklyRank: 31,
    gamePlayed: "scratch",
  },
];

/* ── Progress Ratio Calculation ── */
export function calculateProgressRatio(
  bestDiff: number,
  networkDiff: number
): number {
  if (networkDiff === 0) return 0;
  return bestDiff / networkDiff;
}

/* ── Normalized height for tower (log scale, 0-1) ── */
export function normalizeToTowerHeight(
  bestDiff: number,
  networkDiff: number
): number {
  if (bestDiff <= 0) return 0;
  if (bestDiff >= networkDiff) return 1;
  const logBest = Math.log10(bestDiff);
  const logNetwork = Math.log10(networkDiff);
  return Math.min(logBest / logNetwork, 1);
}

/* ── Count matching leading hex chars ── */
export function countMatchingHexChars(hash: string): number {
  let count = 0;
  for (const ch of hash) {
    if (ch === "0") count++;
    else break;
  }
  return count;
}

/* ── Hook ── */
export function useGameData(): {
  data: WeeklyGameData;
  pastWeeks: PastWeekResult[];
  isLoading: boolean;
} {
  const [searchParams] = useSearchParams();
  const forceBlock = searchParams.get("block") === "true";

  const data = useMemo<WeeklyGameData>(() => {
    const bestDifficulty = 4_231_847_293;
    const networkDifficulty = 100_847_293_444_000;

    return {
      weekStart: getWeekStart(),
      weekEnd: getWeekEnd(),
      bestDifficulty,
      bestDifficultyTime: new Date(Date.now() - 5 * 3_600_000),
      bestHash: MOCK_BEST_HASH,
      networkDifficulty,
      progressRatio: calculateProgressRatio(bestDifficulty, networkDifficulty),
      dailyBestDiffs: MOCK_DAILY_DIFFS,
      totalShares: 47_832,
      weeklyRank: 12,
      percentile: 94,
      blockFound: forceBlock,
      blockData: forceBlock ? MOCK_BLOCK_DATA : undefined,
      userName: "SatoshiHunter",
    };
  }, [forceBlock]);

  return {
    data,
    pastWeeks: MOCK_PAST_WEEKS,
    isLoading: false,
  };
}

/* ── Sound hook point (Phase 9) ── */
export function playSound(_name: string): void {
  // Will be implemented in Phase 9 with Howler.js
}
