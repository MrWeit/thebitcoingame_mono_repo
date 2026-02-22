export type BadgeCategory = "mining" | "streak" | "competition" | "social" | "node";
export type BadgeRarity = "common" | "rare" | "epic" | "legendary";

export interface BadgeDefinition {
  slug: string;
  name: string;
  description: string;
  category: BadgeCategory;
  rarity: BadgeRarity;
  xpReward: number;
  trigger: string;
}

export interface EarnedBadge {
  slug: string;
  date: Date;
  metadata?: Record<string, string>;
}

export const badgeCatalog: BadgeDefinition[] = [
  // Mining Milestones
  {
    slug: "first_share",
    name: "First Hash",
    description: "Submit your very first share to the pool",
    category: "mining",
    rarity: "common",
    xpReward: 50,
    trigger: "Submit 1 share",
  },
  {
    slug: "shares_1k",
    name: "Hash Thousand",
    description: "Submit 1,000 shares — you're getting the hang of this",
    category: "mining",
    rarity: "common",
    xpReward: 100,
    trigger: "Submit 1,000 shares",
  },
  {
    slug: "shares_1m",
    name: "Megahash",
    description: "One million shares submitted. A true mining machine.",
    category: "mining",
    rarity: "rare",
    xpReward: 200,
    trigger: "Submit 1,000,000 shares",
  },
  {
    slug: "block_finder",
    name: "Block Finder",
    description: "Find a Bitcoin block solo. The ultimate achievement.",
    category: "mining",
    rarity: "legendary",
    xpReward: 500,
    trigger: "Find a Bitcoin block solo",
  },

  // Difficulty Records
  {
    slug: "diff_1e6",
    name: "Million Club",
    description: "Achieve a best difficulty above 1,000,000",
    category: "mining",
    rarity: "common",
    xpReward: 50,
    trigger: "Best diff > 1,000,000",
  },
  {
    slug: "diff_1e9",
    name: "Billion Club",
    description: "Achieve a best difficulty above 1,000,000,000",
    category: "mining",
    rarity: "rare",
    xpReward: 100,
    trigger: "Best diff > 1,000,000,000",
  },
  {
    slug: "diff_1e12",
    name: "Trillion Club",
    description: "Achieve a best difficulty above 1,000,000,000,000",
    category: "mining",
    rarity: "epic",
    xpReward: 200,
    trigger: "Best diff > 1,000,000,000,000",
  },
  {
    slug: "weekly_diff_champion",
    name: "Diff Champion",
    description: "Achieve the highest difficulty of the week globally",
    category: "mining",
    rarity: "epic",
    xpReward: 300,
    trigger: "Highest difficulty of the week (global #1)",
  },

  // Streaks
  {
    slug: "streak_4",
    name: "Month Strong",
    description: "Maintain a 4-week consecutive mining streak",
    category: "streak",
    rarity: "common",
    xpReward: 100,
    trigger: "4-week mining streak",
  },
  {
    slug: "streak_12",
    name: "Quarter Master",
    description: "Maintain a 12-week consecutive mining streak",
    category: "streak",
    rarity: "rare",
    xpReward: 200,
    trigger: "12-week mining streak",
  },
  {
    slug: "streak_52",
    name: "Year of Mining",
    description: "Mine every single week for an entire year",
    category: "streak",
    rarity: "legendary",
    xpReward: 500,
    trigger: "52-week mining streak",
  },

  // Node Operator
  {
    slug: "node_runner",
    name: "Node Runner",
    description: "Verified running a Bitcoin full node",
    category: "node",
    rarity: "rare",
    xpReward: 150,
    trigger: "Verified running a Bitcoin full node",
  },
  {
    slug: "node_pruned",
    name: "Pruned but Proud",
    description: "Running a pruned Bitcoin node — still counts!",
    category: "node",
    rarity: "common",
    xpReward: 100,
    trigger: "Verified running a pruned node",
  },
  {
    slug: "node_archival",
    name: "Archival Node",
    description: "Running a full archival Bitcoin node",
    category: "node",
    rarity: "epic",
    xpReward: 250,
    trigger: "Verified running an archival node",
  },

  // Competition
  {
    slug: "world_cup_participant",
    name: "World Cup Miner",
    description: "Participate in any Bitcoin Mining World Cup event",
    category: "competition",
    rarity: "rare",
    xpReward: 200,
    trigger: "Participate in any World Cup",
  },
  {
    slug: "world_cup_winner",
    name: "World Champion",
    description: "Your country wins the Bitcoin Mining World Cup",
    category: "competition",
    rarity: "legendary",
    xpReward: 500,
    trigger: "Win the World Cup (your country)",
  },

  // Social / Education
  {
    slug: "orange_piller",
    name: "Orange Piller",
    description: "Gift a Bitaxe to a nocoiner and bring them into Bitcoin",
    category: "social",
    rarity: "rare",
    xpReward: 200,
    trigger: "Gift a Bitaxe to a nocoiner",
  },
  {
    slug: "rabbit_hole_complete",
    name: "Down the Rabbit Hole",
    description: "Complete an entire education track",
    category: "social",
    rarity: "common",
    xpReward: 150,
    trigger: "Complete full education track",
  },
  {
    slug: "coop_founder",
    name: "Cooperative Founder",
    description: "Create a mining cooperative and rally other miners",
    category: "social",
    rarity: "rare",
    xpReward: 150,
    trigger: "Create a cooperative",
  },
  {
    slug: "coop_block",
    name: "Team Block",
    description: "Your cooperative finds a Bitcoin block together",
    category: "social",
    rarity: "legendary",
    xpReward: 500,
    trigger: "Cooperative finds a block",
  },
];

// Mock earned badges for current user (9 earned, rest locked)
export const mockEarnedBadges: EarnedBadge[] = [
  { slug: "first_share", date: new Date("2025-11-15"), metadata: { shareId: "share-001" } },
  { slug: "shares_1k", date: new Date("2025-11-16") },
  { slug: "shares_1m", date: new Date("2025-12-20") },
  { slug: "diff_1e6", date: new Date("2025-11-15") },
  { slug: "diff_1e9", date: new Date("2025-12-01"), metadata: { difficulty: "2,847,193,472" } },
  { slug: "streak_4", date: new Date("2025-12-13") },
  { slug: "streak_12", date: new Date("2026-02-07") },
  { slug: "world_cup_participant", date: new Date("2026-01-20"), metadata: { event: "February 2026 World Cup" } },
  { slug: "rabbit_hole_complete", date: new Date("2026-01-05"), metadata: { track: "What's Happening on My Bitaxe?" } },
];

export function getBadgeDefinition(slug: string): BadgeDefinition | undefined {
  return badgeCatalog.find((b) => b.slug === slug);
}

export function isEarned(slug: string): EarnedBadge | undefined {
  return mockEarnedBadges.find((b) => b.slug === slug);
}

export function getEarnedCount(): number {
  return mockEarnedBadges.length;
}

export function getTotalCount(): number {
  return badgeCatalog.length;
}

// Rarity percentages (mock - how rare each badge is among all miners)
export const rarityPercentages: Record<string, number> = {
  first_share: 98.2,
  shares_1k: 87.4,
  shares_1m: 23.1,
  block_finder: 0.3,
  diff_1e6: 94.5,
  diff_1e9: 42.8,
  diff_1e12: 2.1,
  weekly_diff_champion: 0.8,
  streak_4: 61.3,
  streak_12: 28.7,
  streak_52: 3.2,
  node_runner: 15.4,
  node_pruned: 22.1,
  node_archival: 4.7,
  world_cup_participant: 34.6,
  world_cup_winner: 1.2,
  orange_piller: 8.9,
  rabbit_hole_complete: 19.3,
  coop_founder: 6.4,
  coop_block: 0.1,
};
