import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  PencilSimple,
  Copy,
  Hammer,
  Diamond,
  Fire,
  Medal,
  ArrowRight,
  Lightning,
  Trophy,
  GameController,
  UsersThree,
  CaretUp,
  Cpu,
  Timer,
  Cube,
} from "@phosphor-icons/react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { BadgeCard } from "@/components/ui/BadgeCard";
import { Button } from "@/components/ui/Button";
import XPBar from "@/components/gamification/XPBar";
import StreakCalendar from "@/components/gamification/StreakCalendar";
import { useAuthStore } from "@/stores/authStore";
import { useUserStore } from "@/stores/userStore";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, durations, easings } from "@/lib/animation";
import { RARITY_COLORS, type Rarity } from "@/lib/constants";
import { getCountryFlag } from "@/mocks/competition";
import { formatDifficulty, formatHashrate, formatNumber } from "@/mocks/data";
import { mockBadges, mockBadgesEarned } from "@/mocks/data";
import { mockCooperative } from "@/mocks/competition";
import {
  mockActivityFeed,
  mockMiningHistory,
  mockDifficultyProgression,
  mockCompetitionHistory,
  mockProfileStats,
  type ActivityItem,
} from "@/mocks/profile";

type ProfileTab = "overview" | "stats" | "activity";

const TABS: { id: ProfileTab | "badges" | "settings"; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "badges", label: "Badges" },
  { id: "stats", label: "Stats" },
  { id: "activity", label: "Activity" },
  { id: "settings", label: "Settings" },
];

// ── Avatar Generator ──

function AddressAvatar({ address, size = 80, borderColor }: { address: string; size?: number; borderColor: string }) {
  // Generate deterministic colors from address
  const colors = useMemo(() => {
    const hash = address.split("").reduce((acc, char) => {
      const code = char.charCodeAt(0);
      return ((acc << 5) - acc + code) | 0;
    }, 0);
    const hue1 = Math.abs(hash % 360);
    const hue2 = (hue1 + 120) % 360;
    const hue3 = (hue1 + 240) % 360;
    return [
      `hsl(${hue1}, 60%, 50%)`,
      `hsl(${hue2}, 50%, 45%)`,
      `hsl(${hue3}, 55%, 40%)`,
    ];
  }, [address]);

  // Generate 3x3 grid pattern from address
  const grid = useMemo(() => {
    const cells: string[] = [];
    for (let i = 0; i < 9; i++) {
      const charCode = address.charCodeAt((i * 3 + 7) % address.length);
      cells.push(colors[charCode % 3]);
    }
    return cells;
  }, [address, colors]);

  const cellSize = size / 3;

  return (
    <div
      className="rounded-full overflow-hidden flex-shrink-0"
      style={{
        width: size,
        height: size,
        border: `3px solid ${borderColor}`,
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {grid.map((color, i) => (
          <rect
            key={i}
            x={(i % 3) * cellSize}
            y={Math.floor(i / 3) * cellSize}
            width={cellSize}
            height={cellSize}
            fill={color}
          />
        ))}
      </svg>
    </div>
  );
}

// ── Mesh Gradient Background ──

function MeshGradient({ address }: { address: string }) {
  const hue = useMemo(() => {
    return Math.abs(
      address.split("").reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0) % 360
    );
  }, [address]);

  return (
    <div
      className="absolute inset-0 opacity-30"
      style={{
        background: `
          radial-gradient(ellipse at 20% 50%, hsl(${hue}, 40%, 25%) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 20%, hsl(${(hue + 120) % 360}, 35%, 20%) 0%, transparent 50%),
          radial-gradient(ellipse at 60% 80%, hsl(${(hue + 240) % 360}, 30%, 15%) 0%, transparent 55%)
        `,
      }}
    />
  );
}

// ── Activity Type Helpers ──

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  personal_best: <Diamond size={16} weight="duotone" className="text-gold" />,
  share: <Lightning size={16} weight="duotone" className="text-cyan" />,
  worker_online: <Cpu size={16} weight="duotone" className="text-green" />,
  worker_offline: <Cpu size={16} weight="duotone" className="text-red" />,
  earned: <Medal size={16} weight="duotone" className="text-purple" />,
  level_up: <CaretUp size={16} weight="duotone" className="text-bitcoin" />,
  played: <GameController size={16} weight="duotone" className="text-cyan" />,
  streak: <Fire size={16} weight="duotone" className="text-bitcoin" />,
  match: <Trophy size={16} weight="duotone" className="text-gold" />,
  coop: <UsersThree size={16} weight="duotone" className="text-cyan" />,
};

type ActivityFilter = "all" | "mining" | "badge" | "game" | "competition";

function groupActivityByDay(items: ActivityItem[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);

  const groups: { label: string; items: ActivityItem[] }[] = [];
  const dayMap = new Map<string, ActivityItem[]>();

  for (const item of items) {
    const ts = item.timestamp.getTime();
    let key: string;
    if (ts >= today.getTime()) key = "Today";
    else if (ts >= yesterday.getTime()) key = "Yesterday";
    else {
      const d = item.timestamp;
      const weekAgo = today.getTime() - 7 * 86_400_000;
      if (ts >= weekAgo) {
        key = d.toLocaleDateString("en-US", { weekday: "long" });
      } else {
        key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    }
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(item);
  }

  for (const [label, items] of dayMap) {
    groups.push({ label, items });
  }
  return groups;
}

// ── Overview Tab ──

function OverviewTab() {
  const navigate = useNavigate();
  const { profile } = useUserStore();

  // Featured badges: top rarity earned badges
  const featuredBadges = mockBadgesEarned
    .sort((a, b) => {
      const order: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
      return (order[a.rarity] ?? 4) - (order[b.rarity] ?? 4);
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Featured Badges */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-body font-semibold text-primary">Featured Badges</h3>
          <button
            onClick={() => navigate("/profile/badges")}
            className="text-micro text-cyan hover:text-primary transition-colors flex items-center gap-1"
          >
            View All <ArrowRight size={12} weight="bold" />
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {featuredBadges.map((badge) => (
            <div key={badge.slug} className="shrink-0 w-28">
              <BadgeCard
                badge={badge}
                earned={badge.earned ? { date: badge.earned.date } : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mining Summary */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">Mining Summary</h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Hashrate (24h)"
            value={formatHashrate(mockProfileStats.hashrate24h)}
            icon={<Hammer size={20} weight="duotone" />}
          />
          <StatCard
            label="Total Shares"
            value={formatNumber(mockProfileStats.totalShares)}
            icon={<Lightning size={20} weight="duotone" />}
          />
        </div>
      </div>

      {/* Streak Calendar */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">Mining Streak</h3>
        <Card padding="md">
          <StreakCalendar
            streakWeeks={profile.streakWeeks}
            streakStartDate={profile.streakStartDate}
          />
        </Card>
      </div>

      {/* Competition History */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">Competition History</h3>
        {mockCompetitionHistory.length > 0 ? (
          <div className="space-y-2">
            {mockCompetitionHistory.map((comp) => (
              <Card key={comp.id} padding="sm" variant="interactive" onClick={() => navigate("/world-cup")}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center">
                    <Trophy size={16} weight="duotone" className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-caption font-medium text-primary truncate">{comp.name}</p>
                    <p className="text-micro text-secondary">{comp.date} — {comp.result}</p>
                  </div>
                  <span>{getCountryFlag(comp.country)}</span>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card padding="md">
            <p className="text-caption text-secondary text-center py-4">
              No competitions yet. Register for the next World Cup!
            </p>
          </Card>
        )}
      </div>

      {/* Cooperative */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">Cooperative</h3>
        <Card padding="md" variant="interactive" onClick={() => navigate("/coop")}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-cyan/10 flex items-center justify-center">
              <UsersThree size={20} weight="duotone" className="text-cyan" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-body font-semibold text-primary">{mockCooperative.name}</p>
              <p className="text-micro text-secondary">
                {mockCooperative.memberCount} members — {formatHashrate(mockCooperative.combinedHashrate)} combined
              </p>
            </div>
            <ArrowRight size={16} className="text-secondary" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Stats Tab ──

function StatsTab() {
  return (
    <div className="space-y-6">
      {/* All-time stat cards */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">All-Time Stats</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Shares"
            value={formatNumber(mockProfileStats.totalShares)}
            icon={<Lightning size={20} weight="duotone" />}
          />
          <StatCard
            label="Best Difficulty"
            value={formatDifficulty(mockProfileStats.bestDifficulty)}
            icon={<Diamond size={20} weight="duotone" />}
          />
          <StatCard
            label="Total Uptime"
            value={`${mockProfileStats.totalUptime}d`}
            icon={<Timer size={20} weight="duotone" />}
          />
          <StatCard
            label="Blocks Found"
            value={mockProfileStats.blocksFound}
            icon={<Cube size={20} weight="duotone" />}
          />
        </div>
      </div>

      {/* Mining History Chart */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">Mining History</h3>
        <Card padding="md">
          <p className="text-micro text-secondary mb-2">Shares per week (52 weeks)</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mockMiningHistory.filter((d) => d.shares > 0)}>
                <defs>
                  <linearGradient id="sharesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#58A6FF" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#58A6FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#8B949E", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(mockMiningHistory.filter((d) => d.shares > 0).length / 6)}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={{
                    background: "#161B22",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: "#E6EDF3",
                    fontSize: 12,
                  }}
                  formatter={(value: number | undefined) => [
                    value ? value.toLocaleString() : "0",
                    "Shares",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="shares"
                  stroke="#58A6FF"
                  strokeWidth={2}
                  fill="url(#sharesGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Difficulty Progression */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">Difficulty Progression</h3>
        <Card padding="md">
          <p className="text-micro text-secondary mb-2">Weekly best difficulty (log scale)</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockDifficultyProgression.filter((d) => d.bestDiff > 0)}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#8B949E", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={Math.floor(mockDifficultyProgression.filter((d) => d.bestDiff > 0).length / 6)}
                />
                <YAxis
                  scale="log"
                  domain={["auto", "auto"]}
                  tick={{ fill: "#8B949E", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => formatDifficulty(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "#161B22",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 8,
                    color: "#E6EDF3",
                    fontSize: 12,
                  }}
                  formatter={(value: number | undefined) => [
                    value ? formatDifficulty(value) : "0",
                    "Best Diff",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="bestDiff"
                  stroke="#F7931A"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Badge Progress */}
      <div>
        <h3 className="text-body font-semibold text-primary mb-3">Badge Progress</h3>
        <Card padding="md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-caption text-secondary">
              {mockProfileStats.badgesEarned} / {mockProfileStats.totalBadges} badges earned
            </span>
            <span className="text-caption text-secondary font-mono">
              {Math.round((mockProfileStats.badgesEarned / mockProfileStats.totalBadges) * 100)}%
            </span>
          </div>
          <div className="w-full h-3 bg-elevated rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan to-purple rounded-full"
              initial={{ width: "0%" }}
              animate={{
                width: `${(mockProfileStats.badgesEarned / mockProfileStats.totalBadges) * 100}%`,
              }}
              transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            />
          </div>
          <p className="text-micro text-secondary mt-3">Next achievable badges:</p>
          <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
            {mockBadges
              .filter((b) => !b.earned)
              .slice(0, 3)
              .map((badge) => (
                <div key={badge.slug} className="shrink-0 w-24">
                  <BadgeCard badge={badge} />
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Activity Tab ──

function ActivityTab() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [showCount, setShowCount] = useState(15);

  const filtered = mockActivityFeed.filter((item) => {
    if (filter === "all") return true;
    if (filter === "mining") return item.type === "mining";
    if (filter === "badge") return item.type === "badge";
    if (filter === "game") return item.type === "game";
    if (filter === "competition") return item.type === "competition";
    return true;
  });

  const visible = filtered.slice(0, showCount);
  const groups = groupActivityByDay(visible);

  const filters: { id: ActivityFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "mining", label: "Mining" },
    { id: "badge", label: "Badges" },
    { id: "game", label: "Games" },
    { id: "competition", label: "Competition" },
  ];

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFilter(f.id);
              setShowCount(15);
            }}
            className={cn(
              "px-3 py-1.5 text-micro font-medium rounded-radius-full transition-colors whitespace-nowrap",
              filter === f.id
                ? "bg-floating text-primary"
                : "bg-elevated text-secondary hover:text-primary"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {groups.map((group) => (
        <div key={group.label}>
          <p className="text-micro text-secondary uppercase tracking-wider font-medium mb-2">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => item.actionUrl && navigate(item.actionUrl)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-radius-md text-left transition-colors",
                  item.actionUrl
                    ? "hover:bg-spotlight/50 cursor-pointer"
                    : "cursor-default"
                )}
              >
                <span className="text-micro text-subtle font-mono w-12 shrink-0 tabular-nums">
                  {item.timestamp.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </span>
                <div className="w-6 h-6 rounded-full bg-elevated flex items-center justify-center shrink-0">
                  {ACTIVITY_ICONS[item.subtype] ?? (
                    <Lightning size={14} className="text-secondary" />
                  )}
                </div>
                <span className="text-caption text-primary flex-1 truncate">
                  {item.description}
                </span>
                {item.xp && item.xp > 0 && (
                  <span className="text-micro text-bitcoin font-mono shrink-0">
                    +{item.xp} XP
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Load more */}
      {showCount < filtered.length && (
        <div className="text-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCount((c) => c + 10)}
          >
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { profile } = useUserStore();
  const addToast = useToastStore((s) => s.addToast);
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(profile.displayName);
  const { setDisplayName } = useUserStore();

  const address = user?.address ?? "";

  // Determine highest rarity badge for border color
  const highestRarity: Rarity = useMemo(() => {
    const rarities = mockBadgesEarned.map((b) => b.rarity as Rarity);
    if (rarities.includes("legendary")) return "legendary";
    if (rarities.includes("epic")) return "epic";
    if (rarities.includes("rare")) return "rare";
    return "common";
  }, []);

  const handleTabClick = (tab: (typeof TABS)[number]) => {
    if (tab.id === "badges") {
      navigate("/profile/badges");
    } else if (tab.id === "settings") {
      navigate("/settings");
    } else {
      setActiveTab(tab.id as ProfileTab);
    }
  };

  const handleSaveName = () => {
    if (editName.trim()) {
      setDisplayName(editName.trim());
      addToast({ type: "success", title: "Display name updated" });
    }
    setIsEditingName(false);
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(address);
    addToast({ type: "info", title: "Address copied" });
  };

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Hero Header */}
      <motion.div variants={staggerItem}>
        <Card padding="lg" className="relative overflow-hidden">
          <MeshGradient address={address} />

          <div className="relative z-10 flex flex-col items-center text-center">
            {/* Avatar */}
            <AddressAvatar
              address={address}
              size={80}
              borderColor={RARITY_COLORS[highestRarity]}
            />

            {/* Name */}
            <div className="mt-4 flex items-center gap-2">
              {isEditingName ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                  onBlur={handleSaveName}
                  className="bg-elevated border border-white/10 rounded-radius-sm px-3 py-1 text-headline font-bold text-primary text-center focus:border-cyan focus:outline-none"
                />
              ) : (
                <>
                  <h2 className="text-headline font-bold text-primary">
                    {profile.displayName}
                  </h2>
                  <button
                    onClick={() => {
                      setEditName(profile.displayName);
                      setIsEditingName(true);
                    }}
                    className="text-secondary hover:text-primary transition-colors"
                    aria-label="Edit display name"
                  >
                    <PencilSimple size={16} weight="bold" />
                  </button>
                </>
              )}
            </div>

            {/* Address + country */}
            <div className="flex items-center gap-2 mt-1.5">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-1.5 text-caption text-secondary hover:text-primary transition-colors font-mono"
              >
                {address.slice(0, 8)}...{address.slice(-4)}
                <Copy size={12} weight="bold" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-sm">{getCountryFlag(profile.countryCode)}</span>
              <span className="text-caption text-secondary">
                {profile.countryCode}
              </span>
            </div>

            {/* Level + XP */}
            <div className="mt-4 w-full max-w-xs">
              <p className="text-micro text-secondary mb-1">
                Level {profile.level}: {profile.levelTitle}
              </p>
              <XPBar current={profile.xp} max={profile.xpToNext} size="sm" />
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 w-full">
              {[
                { icon: <Hammer size={14} weight="duotone" />, label: "shares", value: `${formatNumber(mockProfileStats.totalShares)}` },
                { icon: <Diamond size={14} weight="duotone" />, label: "best", value: formatDifficulty(mockProfileStats.bestDifficulty) },
                { icon: <Fire size={14} weight="duotone" />, label: "streak", value: `${profile.streakWeeks}wk` },
                { icon: <Medal size={14} weight="duotone" />, label: "badges", value: `${mockProfileStats.badgesEarned}` },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="flex items-center justify-center gap-1 text-secondary mb-0.5">
                    {stat.icon}
                    <span className="text-micro uppercase tracking-wider">
                      {stat.label}
                    </span>
                  </div>
                  <p className="text-body font-bold font-mono tabular-nums text-primary">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Tab Bar */}
      <motion.div variants={staggerItem}>
        <div className="flex bg-elevated rounded-radius-md p-1 overflow-x-auto">
          {TABS.map((tab) => {
            const isActive =
              tab.id === activeTab ||
              (tab.id === "badges" && false) ||
              (tab.id === "settings" && false);
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab)}
                className={cn(
                  "relative flex-1 px-4 py-2 text-caption font-medium rounded-radius-sm transition-colors whitespace-nowrap text-center",
                  isActive ? "text-primary" : "text-secondary hover:text-primary"
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="profile-tab"
                    className="absolute inset-0 bg-floating rounded-radius-sm"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Tab Content */}
      <motion.div variants={staggerItem}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: durations.small, ease: easings.snappy }}
          >
            {activeTab === "overview" && <OverviewTab />}
            {activeTab === "stats" && <StatsTab />}
            {activeTab === "activity" && <ActivityTab />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
