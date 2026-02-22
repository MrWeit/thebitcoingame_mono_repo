/* ── Mock Data: Competition & Social ── */

// ── Types ──

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  countryCode: string;
  bestDifficulty: number;
  totalShares: number;
  rankChange: number;
  isCurrentUser: boolean;
  hashrate?: number;
  workerCount?: number;
  badges?: string[];
  joinDate?: Date;
}

export interface CountryRanking {
  rank: number;
  countryCode: string;
  countryName: string;
  minerCount: number;
  totalHashrate: number;
}

export interface Competition {
  id: string;
  name: string;
  type: "world_cup";
  status: "upcoming" | "registration" | "group_stage" | "knockout" | "completed";
  startDate: Date;
  endDate: Date;
  groups: Group[];
  knockoutMatches: Match[];
}

export interface Group {
  name: string;
  teams: GroupTeam[];
}

export interface GroupTeam {
  countryCode: string;
  countryName: string;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  hashrate: number;
}

export interface Match {
  id: string;
  round: "group" | "quarter" | "semi" | "final";
  teamA: { countryCode: string; score: number; hashrate: number; miners: number };
  teamB: { countryCode: string; score: number; hashrate: number; miners: number };
  status: "scheduled" | "live" | "completed";
  matchDate: Date;
  manOfTheMatch?: string;
  manOfTheMatchDiff?: number;
  aiRecap?: string;
  topMinersA?: { name: string; hashrate: number }[];
  topMinersB?: { name: string; hashrate: number }[];
}

export interface Cooperative {
  id: string;
  name: string;
  motto: string;
  memberCount: number;
  combinedHashrate: number;
  weeklyStreak: number;
  bestCombinedDiff: number;
  blocksFound: number;
  totalSharesWeek: number;
  weeklyRank: number;
  members: CoopMember[];
  inviteCode: string;
}

export interface CoopMember {
  userId: string;
  displayName: string;
  hashrate: number;
  sharesToday: number;
  isOnline: boolean;
  role: "admin" | "member";
}

export interface League {
  id: string;
  name: string;
  division: number;
  clubs: LeagueClub[];
}

export interface LeagueClub {
  id: string;
  name: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  hashrate: number;
  isUserClub: boolean;
}

// ── Country Flag Helper ──

export function getCountryFlag(code: string): string {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

export function getCountryName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  JP: "Japan",
  DE: "Germany",
  GB: "United Kingdom",
  CA: "Canada",
  BR: "Brazil",
  AU: "Australia",
  FR: "France",
  ES: "Spain",
  NL: "Netherlands",
  NO: "Norway",
  PT: "Portugal",
  CH: "Switzerland",
  KR: "South Korea",
  SE: "Sweden",
  IT: "Italy",
  MX: "Mexico",
  AR: "Argentina",
  IN: "India",
  SG: "Singapore",
};

// ── Leaderboard Data (50 miners) ──

const MINER_NAMES = [
  "SatoshiHunter42", "BlockChaser99", "MiningViking", "HashMaster", "BitaxeBob",
  "CryptoMike", "NocoinerNoMore", "ThunderboltHash", "OrangeMaxi", "StackingSats",
  "NodeRunner01", "SatoshiHunter", "LuckyMiner777", "BitcoinBarbara", "HashrateHero",
  "BlockFinder88", "NakamotoNinja", "ProofOfWork247", "SoloStriker", "LightningLarry",
  "BitaxeQueen", "MempoolMike", "UTXOmaster", "ChainAnalyst", "HashPower9000",
  "SatsStacker2026", "BlockReward", "NonceHunter", "DifficultyKing", "SegWitSteve",
  "TaprootTina", "FullNodeFrank", "WhaleMiner", "HodlHash", "PlanktonMiner",
  "MinerMax", "ColdStorageCraig", "TimechainTom", "PetahashPete", "GigaMiner",
  "BrainWallet42", "CypherPunkSam", "BitcoinBruce", "MinerMolly", "HashCash",
  "DoubleSpendDan", "MerkleRoots", "CoinbaseCathy", "GenesisMiner", "FinalBlockFred",
];

const COUNTRIES = ["US", "JP", "DE", "GB", "CA", "BR", "AU", "FR", "ES", "NL", "NO", "PT", "CH", "KR", "SE", "IT", "MX", "AR", "IN", "SG"];

function generateLeaderboard(seed: number): LeaderboardEntry[] {
  return MINER_NAMES.map((name, i) => {
    const baseDiff = 15_000_000_000_000 - i * 250_000_000_000 + (seed * 1000000 * (i + 1)) % 100_000_000_000;
    const rankChange = i < 5 ? (i % 3 === 0 ? 0 : i % 2 === 0 ? -1 : 2) :
      Math.floor(Math.sin(i + seed) * 5);
    return {
      rank: i + 1,
      userId: `user-${i}`,
      displayName: name,
      countryCode: COUNTRIES[i % COUNTRIES.length],
      bestDifficulty: Math.max(baseDiff, 1_000_000_000),
      totalShares: Math.floor(900_000 - i * 15_000 + Math.abs(Math.sin(i + seed) * 50_000)),
      rankChange,
      isCurrentUser: i === 11,
      hashrate: (500 - i * 8) * 1e9,
      workerCount: Math.max(1, 5 - Math.floor(i / 10)),
      badges: i < 3 ? ["block_finder", "diff_1e12", "streak_52"] : i < 10 ? ["diff_1e9", "streak_12"] : ["diff_1e6"],
      joinDate: new Date(2025, 6 + Math.floor(i / 10), 1 + (i % 28)),
    };
  });
}

export const mockLeaderboardWeekly = generateLeaderboard(1);
export const mockLeaderboardMonthly = generateLeaderboard(2);
export const mockLeaderboardAllTime = generateLeaderboard(3);

// ── Country Rankings (20 countries) ──

export const mockCountryRankings: CountryRanking[] = [
  { rank: 1, countryCode: "US", countryName: "United States", minerCount: 847, totalHashrate: 12.4e15 },
  { rank: 2, countryCode: "JP", countryName: "Japan", minerCount: 623, totalHashrate: 8.7e15 },
  { rank: 3, countryCode: "DE", countryName: "Germany", minerCount: 512, totalHashrate: 6.2e15 },
  { rank: 4, countryCode: "GB", countryName: "United Kingdom", minerCount: 489, totalHashrate: 5.8e15 },
  { rank: 5, countryCode: "CA", countryName: "Canada", minerCount: 421, totalHashrate: 5.1e15 },
  { rank: 6, countryCode: "BR", countryName: "Brazil", minerCount: 367, totalHashrate: 4.4e15 },
  { rank: 7, countryCode: "AU", countryName: "Australia", minerCount: 312, totalHashrate: 3.8e15 },
  { rank: 8, countryCode: "FR", countryName: "France", minerCount: 289, totalHashrate: 3.5e15 },
  { rank: 9, countryCode: "ES", countryName: "Spain", minerCount: 267, totalHashrate: 3.2e15 },
  { rank: 10, countryCode: "NL", countryName: "Netherlands", minerCount: 234, totalHashrate: 2.8e15 },
  { rank: 11, countryCode: "NO", countryName: "Norway", minerCount: 198, totalHashrate: 2.4e15 },
  { rank: 12, countryCode: "PT", countryName: "Portugal", minerCount: 178, totalHashrate: 2.1e15 },
  { rank: 13, countryCode: "CH", countryName: "Switzerland", minerCount: 156, totalHashrate: 1.9e15 },
  { rank: 14, countryCode: "KR", countryName: "South Korea", minerCount: 143, totalHashrate: 1.7e15 },
  { rank: 15, countryCode: "SE", countryName: "Sweden", minerCount: 134, totalHashrate: 1.6e15 },
  { rank: 16, countryCode: "IT", countryName: "Italy", minerCount: 121, totalHashrate: 1.4e15 },
  { rank: 17, countryCode: "MX", countryName: "Mexico", minerCount: 98, totalHashrate: 1.2e15 },
  { rank: 18, countryCode: "AR", countryName: "Argentina", minerCount: 87, totalHashrate: 1.0e15 },
  { rank: 19, countryCode: "IN", countryName: "India", minerCount: 76, totalHashrate: 0.9e15 },
  { rank: 20, countryCode: "SG", countryName: "Singapore", minerCount: 64, totalHashrate: 0.8e15 },
];

// ── World Cup Data ──

export const mockWorldCup: Competition = {
  id: "wc-2027",
  name: "SWAN BITCOIN Solo Mining World Cup 2027",
  type: "world_cup",
  status: "group_stage",
  startDate: new Date("2027-01-15"),
  endDate: new Date("2027-03-15"),
  groups: [
    {
      name: "Group A",
      teams: [
        { countryCode: "US", countryName: "United States", points: 12, played: 5, won: 4, drawn: 0, lost: 1, hashrate: 8.2e15 },
        { countryCode: "GB", countryName: "United Kingdom", points: 10, played: 5, won: 3, drawn: 1, lost: 1, hashrate: 5.4e15 },
        { countryCode: "CA", countryName: "Canada", points: 6, played: 5, won: 2, drawn: 0, lost: 3, hashrate: 4.1e15 },
        { countryCode: "MX", countryName: "Mexico", points: 2, played: 5, won: 0, drawn: 2, lost: 3, hashrate: 1.2e15 },
      ],
    },
    {
      name: "Group B",
      teams: [
        { countryCode: "JP", countryName: "Japan", points: 10, played: 5, won: 3, drawn: 1, lost: 1, hashrate: 7.8e15 },
        { countryCode: "BR", countryName: "Brazil", points: 8, played: 5, won: 2, drawn: 2, lost: 1, hashrate: 4.2e15 },
        { countryCode: "KR", countryName: "South Korea", points: 7, played: 5, won: 2, drawn: 1, lost: 2, hashrate: 3.1e15 },
        { countryCode: "AU", countryName: "Australia", points: 3, played: 5, won: 1, drawn: 0, lost: 4, hashrate: 2.4e15 },
      ],
    },
    {
      name: "Group C",
      teams: [
        { countryCode: "DE", countryName: "Germany", points: 9, played: 5, won: 3, drawn: 0, lost: 2, hashrate: 6.0e15 },
        { countryCode: "FR", countryName: "France", points: 8, played: 5, won: 2, drawn: 2, lost: 1, hashrate: 3.4e15 },
        { countryCode: "ES", countryName: "Spain", points: 7, played: 5, won: 2, drawn: 1, lost: 2, hashrate: 3.0e15 },
        { countryCode: "IT", countryName: "Italy", points: 4, played: 5, won: 1, drawn: 1, lost: 3, hashrate: 1.3e15 },
      ],
    },
    {
      name: "Group D",
      teams: [
        { countryCode: "NO", countryName: "Norway", points: 11, played: 5, won: 3, drawn: 2, lost: 0, hashrate: 2.2e15 },
        { countryCode: "PT", countryName: "Portugal", points: 9, played: 5, won: 3, drawn: 0, lost: 2, hashrate: 2.0e15 },
        { countryCode: "NL", countryName: "Netherlands", points: 5, played: 5, won: 1, drawn: 2, lost: 2, hashrate: 2.6e15 },
        { countryCode: "SE", countryName: "Sweden", points: 3, played: 5, won: 1, drawn: 0, lost: 4, hashrate: 1.5e15 },
      ],
    },
  ],
  knockoutMatches: [
    // Quarter-finals
    {
      id: "qf-1",
      round: "quarter",
      teamA: { countryCode: "US", score: 3, hashrate: 8.4e15, miners: 847 },
      teamB: { countryCode: "BR", score: 1, hashrate: 4.1e15, miners: 367 },
      status: "completed",
      matchDate: new Date("2027-02-20"),
      manOfTheMatch: "SatoshiHunter42",
      manOfTheMatchDiff: 14.2e12,
      aiRecap: "The United States dominated from the start, with SatoshiHunter42 contributing a monster 14.2T difficulty share that electrified the arena. Brazil fought valiantly with their compact but efficient mining fleet, but couldn't overcome the raw hashpower advantage. A clinical performance from Team USA.",
      topMinersA: [{ name: "SatoshiHunter42", hashrate: 2.1e15 }, { name: "BlockChaser99", hashrate: 1.8e15 }, { name: "LightningLarry", hashrate: 1.2e15 }],
      topMinersB: [{ name: "NocoinerNoMore", hashrate: 1.4e15 }, { name: "CryptoCarlos", hashrate: 0.9e15 }, { name: "SaoPauloHash", hashrate: 0.7e15 }],
    },
    {
      id: "qf-2",
      round: "quarter",
      teamA: { countryCode: "JP", score: 2, hashrate: 7.6e15, miners: 623 },
      teamB: { countryCode: "GB", score: 2, hashrate: 5.3e15, miners: 489 },
      status: "completed",
      matchDate: new Date("2027-02-20"),
      manOfTheMatch: "BitaxeBob",
      manOfTheMatchDiff: 11.8e12,
      aiRecap: "An absolute thriller in this quarter-final clash! Japan held a commanding lead through the first half, but BitaxeBob rallied the British miners with a spectacular 11.8T share that shifted momentum. The match ended in a nail-biting draw, with Japan advancing on aggregate hashrate.",
      topMinersA: [{ name: "TokyoMiner", hashrate: 2.0e15 }, { name: "OsakaHash", hashrate: 1.5e15 }, { name: "NakamotoJr", hashrate: 1.2e15 }],
      topMinersB: [{ name: "BitaxeBob", hashrate: 1.8e15 }, { name: "LondonHash", hashrate: 1.2e15 }, { name: "ManchesterMine", hashrate: 0.9e15 }],
    },
    {
      id: "qf-3",
      round: "quarter",
      teamA: { countryCode: "DE", score: 2, hashrate: 5.9e15, miners: 512 },
      teamB: { countryCode: "PT", score: 3, hashrate: 2.1e15, miners: 178 },
      status: "completed",
      matchDate: new Date("2027-02-21"),
      manOfTheMatch: "SatoshiHunter",
      manOfTheMatchDiff: 12.4e12,
      aiRecap: "The upset of the tournament! Portugal's SatoshiHunter produced a 12.4T share that stunned Germany's mighty mining fleet. Despite being heavily outgunned in raw hashrate, Portugal's miners found blocks at crucial moments, converting bonus goals that Germany couldn't match. David beats Goliath in spectacular fashion!",
      topMinersA: [{ name: "HashMaster", hashrate: 1.6e15 }, { name: "BerlinMiner", hashrate: 1.2e15 }, { name: "MunichHash", hashrate: 1.0e15 }],
      topMinersB: [{ name: "SatoshiHunter", hashrate: 0.8e15 }, { name: "PortoHash", hashrate: 0.5e15 }, { name: "LisbonMiner", hashrate: 0.4e15 }],
    },
    {
      id: "qf-4",
      round: "quarter",
      teamA: { countryCode: "NO", score: 1, hashrate: 2.1e15, miners: 198 },
      teamB: { countryCode: "FR", score: 2, hashrate: 3.3e15, miners: 289 },
      status: "completed",
      matchDate: new Date("2027-02-21"),
      manOfTheMatch: "ParisMiner",
      manOfTheMatchDiff: 9.7e12,
      aiRecap: "France showed tactical superiority in this quarter-final, leveraging their larger miner base to maintain steady hashrate pressure. Norway's MiningViking fought hard but ParisMiner's consistent 9.7T shares powered France to victory. Allez les Bleus advance to the semis!",
      topMinersA: [{ name: "MiningViking", hashrate: 0.8e15 }, { name: "NordicHash", hashrate: 0.5e15 }, { name: "FjordMiner", hashrate: 0.4e15 }],
      topMinersB: [{ name: "ParisMiner", hashrate: 1.0e15 }, { name: "LyonHash", hashrate: 0.8e15 }, { name: "MarseilleMine", hashrate: 0.7e15 }],
    },
    // Semi-finals
    {
      id: "sf-1",
      round: "semi",
      teamA: { countryCode: "US", score: 2, hashrate: 8.1e15, miners: 847 },
      teamB: { countryCode: "JP", score: 1, hashrate: 7.4e15, miners: 623 },
      status: "completed",
      matchDate: new Date("2027-02-28"),
      manOfTheMatch: "SatoshiHunter42",
      manOfTheMatchDiff: 15.1e12,
      aiRecap: "A titanic clash between the two hashrate superpowers! The United States edged out Japan in a match that came down to the final minutes. SatoshiHunter42 cemented their tournament MVP candidacy with a record-breaking 15.1T share that sealed the deal. Japan can hold their heads high after an extraordinary campaign.",
      topMinersA: [{ name: "SatoshiHunter42", hashrate: 2.2e15 }, { name: "BlockChaser99", hashrate: 1.7e15 }, { name: "LightningLarry", hashrate: 1.3e15 }],
      topMinersB: [{ name: "TokyoMiner", hashrate: 2.1e15 }, { name: "OsakaHash", hashrate: 1.4e15 }, { name: "NakamotoJr", hashrate: 1.1e15 }],
    },
    {
      id: "sf-2",
      round: "semi",
      teamA: { countryCode: "PT", score: 0, hashrate: 2.0e15, miners: 178 },
      teamB: { countryCode: "FR", score: 0, hashrate: 3.2e15, miners: 289 },
      status: "live",
      matchDate: new Date(),
      topMinersA: [{ name: "SatoshiHunter", hashrate: 0.7e15 }, { name: "PortoHash", hashrate: 0.5e15 }, { name: "LisbonMiner", hashrate: 0.4e15 }],
      topMinersB: [{ name: "ParisMiner", hashrate: 0.9e15 }, { name: "LyonHash", hashrate: 0.8e15 }, { name: "MarseilleMine", hashrate: 0.6e15 }],
    },
    // Final (scheduled)
    {
      id: "final",
      round: "final",
      teamA: { countryCode: "US", score: 0, hashrate: 0, miners: 847 },
      teamB: { countryCode: "", score: 0, hashrate: 0, miners: 0 },
      status: "scheduled",
      matchDate: new Date("2027-03-07"),
    },
  ],
};

// ── Group Matches (completed) ──

export const mockGroupMatches: Match[] = [
  {
    id: "gm-1", round: "group", status: "completed", matchDate: new Date("2027-01-20"),
    teamA: { countryCode: "US", score: 3, hashrate: 7.8e15, miners: 847 },
    teamB: { countryCode: "CA", score: 1, hashrate: 4.0e15, miners: 421 },
    manOfTheMatch: "SatoshiHunter42", manOfTheMatchDiff: 13.2e12,
    aiRecap: "A North American derby that lived up to the hype. The USA's superior hashrate told in the end.",
  },
  {
    id: "gm-2", round: "group", status: "completed", matchDate: new Date("2027-01-20"),
    teamA: { countryCode: "GB", score: 2, hashrate: 5.2e15, miners: 489 },
    teamB: { countryCode: "MX", score: 0, hashrate: 1.1e15, miners: 98 },
    manOfTheMatch: "BitaxeBob", manOfTheMatchDiff: 10.4e12,
    aiRecap: "Britain's BitaxeBob was unstoppable, guiding his team to a comfortable victory.",
  },
  {
    id: "gm-3", round: "group", status: "completed", matchDate: new Date("2027-01-22"),
    teamA: { countryCode: "JP", score: 2, hashrate: 7.5e15, miners: 623 },
    teamB: { countryCode: "AU", score: 1, hashrate: 2.3e15, miners: 312 },
    manOfTheMatch: "TokyoMiner", manOfTheMatchDiff: 11.1e12,
    aiRecap: "Japan's disciplined mining fleet wore down Australia's spirited resistance.",
  },
  {
    id: "gm-4", round: "group", status: "completed", matchDate: new Date("2027-01-22"),
    teamA: { countryCode: "BR", score: 1, hashrate: 4.0e15, miners: 367 },
    teamB: { countryCode: "KR", score: 1, hashrate: 3.0e15, miners: 143 },
    manOfTheMatch: "NocoinerNoMore", manOfTheMatchDiff: 8.9e12,
    aiRecap: "A tense draw between two evenly matched sides. Both advance with their hopes intact.",
  },
  {
    id: "gm-5", round: "group", status: "completed", matchDate: new Date("2027-01-24"),
    teamA: { countryCode: "DE", score: 3, hashrate: 5.8e15, miners: 512 },
    teamB: { countryCode: "IT", score: 0, hashrate: 1.2e15, miners: 121 },
    manOfTheMatch: "HashMaster", manOfTheMatchDiff: 12.0e12,
    aiRecap: "Germany's HashMaster was in devastating form as the Germans dominated proceedings.",
  },
  {
    id: "gm-6", round: "group", status: "completed", matchDate: new Date("2027-01-24"),
    teamA: { countryCode: "FR", score: 2, hashrate: 3.3e15, miners: 289 },
    teamB: { countryCode: "ES", score: 1, hashrate: 2.9e15, miners: 267 },
    manOfTheMatch: "ParisMiner", manOfTheMatchDiff: 9.3e12,
    aiRecap: "France edges out Spain in a close Iberian-crossing encounter.",
  },
  {
    id: "gm-7", round: "group", status: "completed", matchDate: new Date("2027-01-26"),
    teamA: { countryCode: "NO", score: 2, hashrate: 2.1e15, miners: 198 },
    teamB: { countryCode: "SE", score: 0, hashrate: 1.4e15, miners: 134 },
    manOfTheMatch: "MiningViking", manOfTheMatchDiff: 10.8e12,
    aiRecap: "The Nordic derby goes Norway's way as MiningViking terrorises Swedish defenses.",
  },
  {
    id: "gm-8", round: "group", status: "completed", matchDate: new Date("2027-01-26"),
    teamA: { countryCode: "PT", score: 2, hashrate: 1.9e15, miners: 178 },
    teamB: { countryCode: "NL", score: 1, hashrate: 2.5e15, miners: 234 },
    manOfTheMatch: "SatoshiHunter", manOfTheMatchDiff: 11.5e12,
    aiRecap: "Portugal punches above its weight again! SatoshiHunter's magical 11.5T share was the difference maker.",
  },
];

// ── Cooperative Data ──

export const mockCooperative: Cooperative = {
  id: "coop-1",
  name: "Mining Vikings",
  motto: "Raiding the blockchain since 2026",
  memberCount: 8,
  combinedHashrate: 8.4e12,
  weeklyStreak: 8,
  bestCombinedDiff: 47.2e12,
  blocksFound: 0,
  totalSharesWeek: 234_891,
  weeklyRank: 34,
  inviteCode: "VIKING2026",
  members: [
    { userId: "u-1", displayName: "VikingOne", hashrate: 2.1e12, sharesToday: 12_847, isOnline: true, role: "admin" },
    { userId: "u-2", displayName: "NorseHash", hashrate: 1.8e12, sharesToday: 10_234, isOnline: true, role: "member" },
    { userId: "u-3", displayName: "OdinMiner", hashrate: 1.2e12, sharesToday: 7_891, isOnline: false, role: "member" },
    { userId: "u-4", displayName: "ThorHash", hashrate: 1.0e12, sharesToday: 6_542, isOnline: true, role: "member" },
    { userId: "u-5", displayName: "FreyaMine", hashrate: 0.9e12, sharesToday: 5_834, isOnline: true, role: "member" },
    { userId: "u-6", displayName: "LokiHash", hashrate: 0.6e12, sharesToday: 3_921, isOnline: false, role: "member" },
    { userId: "u-7", displayName: "BaldurBit", hashrate: 0.5e12, sharesToday: 3_102, isOnline: true, role: "member" },
    { userId: "u-8", displayName: "RuneMiner", hashrate: 0.3e12, sharesToday: 1_847, isOnline: false, role: "member" },
  ],
};

// ── Cooperative Hashrate History ──

export const mockCoopHashrateHistory = Array.from({ length: 168 }, (_, i) => ({
  time: new Date(Date.now() - (167 - i) * 3600_000).toISOString(),
  value: 7.5e12 + Math.random() * 2e12,
}));

// ── League Data ──

export const mockLeagues: League[] = [
  {
    id: "champions",
    name: "Champions League",
    division: 0,
    clubs: [
      { id: "c1", name: "Tokyo Hash FC", played: 8, won: 7, drawn: 1, lost: 0, points: 22, hashrate: 14.2e15, isUserClub: false },
      { id: "c2", name: "Berlin Mining", played: 8, won: 6, drawn: 1, lost: 1, points: 19, hashrate: 11.8e15, isUserClub: false },
      { id: "c3", name: "NYC Satoshis", played: 8, won: 5, drawn: 2, lost: 1, points: 17, hashrate: 10.4e15, isUserClub: false },
      { id: "c4", name: "London Blocks", played: 8, won: 5, drawn: 1, lost: 2, points: 16, hashrate: 9.1e15, isUserClub: false },
      { id: "c5", name: "Oslo Miners", played: 8, won: 4, drawn: 2, lost: 2, points: 14, hashrate: 7.8e15, isUserClub: false },
      { id: "c6", name: "Paris Hash", played: 8, won: 4, drawn: 1, lost: 3, points: 13, hashrate: 7.2e15, isUserClub: false },
      { id: "c7", name: "Seoul Strikers", played: 8, won: 3, drawn: 3, lost: 2, points: 12, hashrate: 6.5e15, isUserClub: false },
      { id: "c8", name: "Lisbon Legends", played: 8, won: 3, drawn: 2, lost: 3, points: 11, hashrate: 5.9e15, isUserClub: true },
      { id: "c9", name: "Sydney Sats", played: 8, won: 3, drawn: 1, lost: 4, points: 10, hashrate: 5.4e15, isUserClub: false },
      { id: "c10", name: "Toronto Hash", played: 8, won: 2, drawn: 2, lost: 4, points: 8, hashrate: 4.8e15, isUserClub: false },
      { id: "c11", name: "Madrid Miners", played: 8, won: 1, drawn: 2, lost: 5, points: 5, hashrate: 4.1e15, isUserClub: false },
      { id: "c12", name: "Rome Blocks", played: 8, won: 0, drawn: 2, lost: 6, points: 2, hashrate: 3.2e15, isUserClub: false },
    ],
  },
];

// ── Browse Cooperatives ──

export const mockBrowseCoops = [
  { id: "coop-1", name: "Mining Vikings", memberCount: 8, combinedHashrate: 8.4e12, weeklyStreak: 8 },
  { id: "coop-2", name: "Hash Samurai", memberCount: 12, combinedHashrate: 14.2e12, weeklyStreak: 15 },
  { id: "coop-3", name: "Block Busters", memberCount: 6, combinedHashrate: 5.1e12, weeklyStreak: 3 },
  { id: "coop-4", name: "Satoshi Squad", memberCount: 10, combinedHashrate: 11.8e12, weeklyStreak: 22 },
  { id: "coop-5", name: "Nonce Hunters", memberCount: 4, combinedHashrate: 3.2e12, weeklyStreak: 6 },
];
