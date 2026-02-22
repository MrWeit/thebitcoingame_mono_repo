/* ── Mock Data: Social Activity Feed ── */

export type FeedItemType = "block_found" | "badge_earned" | "world_cup" | "new_miners" | "streak_milestone";

export interface FeedItem {
  id: string;
  type: FeedItemType;
  icon: string;
  text: string;
  timestamp: Date;
  link?: string;
}

export const mockActivityFeed: FeedItem[] = [
  { id: "af-1", type: "block_found", icon: "cube", text: "LuckyMiner777 found Block #879,412!", timestamp: new Date(Date.now() - 1_800_000), link: "/mining/blocks" },
  { id: "af-2", type: "world_cup", icon: "trophy", text: "Portugal vs France semi-final is LIVE!", timestamp: new Date(Date.now() - 2_400_000), link: "/world-cup" },
  { id: "af-3", type: "badge_earned", icon: "medal", text: "BitaxeBob earned Trillion Club badge", timestamp: new Date(Date.now() - 3_600_000), link: "/profile/badges" },
  { id: "af-4", type: "new_miners", icon: "pickaxe", text: "3 new miners joined from Portugal today", timestamp: new Date(Date.now() - 5_400_000) },
  { id: "af-5", type: "streak_milestone", icon: "fire", text: "MiningViking hit a 52-week streak!", timestamp: new Date(Date.now() - 7_200_000), link: "/profile/streaks" },
  { id: "af-6", type: "block_found", icon: "cube", text: "BitaxeBob found Block #878,991!", timestamp: new Date(Date.now() - 14_400_000), link: "/mining/blocks" },
  { id: "af-7", type: "world_cup", icon: "trophy", text: "USA defeats Japan 2-1 in semi-final thriller", timestamp: new Date(Date.now() - 21_600_000), link: "/world-cup" },
  { id: "af-8", type: "badge_earned", icon: "medal", text: "SatoshiHunter earned Quarter Master badge", timestamp: new Date(Date.now() - 28_800_000), link: "/profile/badges" },
  { id: "af-9", type: "new_miners", icon: "pickaxe", text: "Mining Vikings cooperative grew to 8 members", timestamp: new Date(Date.now() - 36_000_000) },
  { id: "af-10", type: "streak_milestone", icon: "fire", text: "HashMaster hit a 26-week streak!", timestamp: new Date(Date.now() - 43_200_000), link: "/profile/streaks" },
  { id: "af-11", type: "block_found", icon: "cube", text: "MiningViking found Block #877,204!", timestamp: new Date(Date.now() - 86_400_000), link: "/mining/blocks" },
  { id: "af-12", type: "world_cup", icon: "trophy", text: "Portugal stuns Germany 3-2 in quarter-final!", timestamp: new Date(Date.now() - 100_800_000), link: "/world-cup" },
  { id: "af-13", type: "badge_earned", icon: "medal", text: "CryptoMike earned Billion Club badge", timestamp: new Date(Date.now() - 115_200_000), link: "/profile/badges" },
  { id: "af-14", type: "new_miners", icon: "pickaxe", text: "5 new miners joined from Japan today", timestamp: new Date(Date.now() - 129_600_000) },
  { id: "af-15", type: "streak_milestone", icon: "fire", text: "NocoinerNoMore hit a 12-week streak!", timestamp: new Date(Date.now() - 144_000_000), link: "/profile/streaks" },
  { id: "af-16", type: "block_found", icon: "cube", text: "HashMaster found Block #875,830!", timestamp: new Date(Date.now() - 172_800_000), link: "/mining/blocks" },
  { id: "af-17", type: "world_cup", icon: "trophy", text: "World Cup group stage is complete", timestamp: new Date(Date.now() - 259_200_000), link: "/world-cup" },
  { id: "af-18", type: "badge_earned", icon: "medal", text: "ThunderboltHash earned World Cup Miner badge", timestamp: new Date(Date.now() - 302_400_000), link: "/profile/badges" },
  { id: "af-19", type: "new_miners", icon: "pickaxe", text: "Lisbon Legends joined Champions League", timestamp: new Date(Date.now() - 345_600_000), link: "/leagues" },
  { id: "af-20", type: "streak_milestone", icon: "fire", text: "VikingOne hit a 20-week streak!", timestamp: new Date(Date.now() - 432_000_000), link: "/profile/streaks" },
];
