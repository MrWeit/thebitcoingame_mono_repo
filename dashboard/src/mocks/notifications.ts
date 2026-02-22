/* ── Mock Data: Notifications ── */

export interface NotificationItem {
  id: string;
  type: "mining" | "gamification" | "competition" | "social" | "system";
  subtype: string;
  title: string;
  description?: string;
  timestamp: Date;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

const now = Date.now();
const HOUR = 3_600_000;
const DAY = 86_400_000;

export const mockNotifications: NotificationItem[] = [
  // Today — unread
  {
    id: "n-1",
    type: "mining",
    subtype: "personal_best",
    title: "New Best Difficulty!",
    description: "4,231,847,293 — your highest ever",
    timestamp: new Date(now - 14 * 60_000),
    read: false,
    actionUrl: "/mining/difficulty",
    actionLabel: "View Difficulty",
  },
  {
    id: "n-2",
    type: "mining",
    subtype: "worker_online",
    title: "Worker Online",
    description: "bitaxe-living-room reconnected",
    timestamp: new Date(now - 2 * HOUR),
    read: false,
    actionUrl: "/mining/workers",
    actionLabel: "View Workers",
  },
  {
    id: "n-3",
    type: "gamification",
    subtype: "badge_earned",
    title: 'Badge Earned: "Quarter Master"',
    description: "+100 XP — 12-week streak",
    timestamp: new Date(now - 3 * HOUR),
    read: false,
    actionUrl: "/profile/badges",
    actionLabel: "View Badge",
  },
  // Today — read
  {
    id: "n-4",
    type: "mining",
    subtype: "share_submitted",
    title: "Above Average Share",
    description: "Difficulty 87,293,102 from bitaxe-bedroom",
    timestamp: new Date(now - 5 * HOUR),
    read: true,
    actionUrl: "/mining/shares",
  },
  {
    id: "n-5",
    type: "competition",
    subtype: "match_starting",
    title: "World Cup Match Starting",
    description: "Portugal vs France — Semi-final",
    timestamp: new Date(now - 6 * HOUR),
    read: true,
    actionUrl: "/world-cup",
    actionLabel: "Watch Live",
  },
  // Yesterday
  {
    id: "n-6",
    type: "gamification",
    subtype: "level_up",
    title: "Level Up!",
    description: "Level 7 — Hash Veteran",
    timestamp: new Date(now - DAY - 2 * HOUR),
    read: true,
    actionUrl: "/profile/level",
    actionLabel: "View Level",
  },
  {
    id: "n-7",
    type: "gamification",
    subtype: "streak_extended",
    title: "Streak Extended!",
    description: "12-week streak — keep it up!",
    timestamp: new Date(now - DAY - 5 * HOUR),
    read: true,
    actionUrl: "/profile/streaks",
  },
  {
    id: "n-8",
    type: "mining",
    subtype: "worker_offline",
    title: "Worker Offline",
    description: "nerdaxe-office has been offline for 30 minutes",
    timestamp: new Date(now - DAY - 8 * HOUR),
    read: true,
    actionUrl: "/mining/workers",
    actionLabel: "Check Workers",
  },
  {
    id: "n-9",
    type: "competition",
    subtype: "match_result",
    title: "Match Complete: PT 3 - DE 2",
    description: "Portugal wins! You earned Man of the Match",
    timestamp: new Date(now - DAY - 12 * HOUR),
    read: true,
    actionUrl: "/world-cup",
  },
  // Earlier this week
  {
    id: "n-10",
    type: "social",
    subtype: "block_found",
    title: "Block Found!",
    description: "LuckyMiner777 found block #879,412",
    timestamp: new Date(now - 3 * DAY),
    read: true,
    actionUrl: "/mining/blocks",
    actionLabel: "View Block",
  },
  {
    id: "n-11",
    type: "gamification",
    subtype: "badge_earned",
    title: 'Badge Earned: "Megahash"',
    description: "+50 XP — 1,000,000 shares submitted",
    timestamp: new Date(now - 3 * DAY - 4 * HOUR),
    read: true,
    actionUrl: "/profile/badges",
  },
  {
    id: "n-12",
    type: "competition",
    subtype: "lottery_results",
    title: "Weekly Lottery Results",
    description: "You placed #12 this week",
    timestamp: new Date(now - 4 * DAY),
    read: true,
    actionUrl: "/games",
    actionLabel: "Play Now",
  },
  {
    id: "n-13",
    type: "social",
    subtype: "coop_activity",
    title: "Cooperative Update",
    description: "Mining Vikings reached #34 weekly rank",
    timestamp: new Date(now - 4 * DAY - 6 * HOUR),
    read: true,
    actionUrl: "/coop",
  },
  // Older
  {
    id: "n-14",
    type: "system",
    subtype: "maintenance",
    title: "Scheduled Maintenance Complete",
    description: "All systems operational",
    timestamp: new Date(now - 8 * DAY),
    read: true,
  },
  {
    id: "n-15",
    type: "mining",
    subtype: "streak_warning",
    title: "Streak Expiring Soon",
    description: "Mine within 24 hours to keep your streak",
    timestamp: new Date(now - 8 * DAY - 12 * HOUR),
    read: true,
    actionUrl: "/profile/streaks",
  },
  {
    id: "n-16",
    type: "system",
    subtype: "welcome",
    title: "Welcome to The Bitcoin Game!",
    description: "Start mining and earn your first badge",
    timestamp: new Date(now - 14 * DAY),
    read: true,
    actionUrl: "/dashboard",
  },
  {
    id: "n-17",
    type: "gamification",
    subtype: "badge_earned",
    title: 'Badge Earned: "First Hash"',
    description: "+25 XP — Submit your first share",
    timestamp: new Date(now - 14 * DAY - 2 * HOUR),
    read: true,
    actionUrl: "/profile/badges",
  },
];
