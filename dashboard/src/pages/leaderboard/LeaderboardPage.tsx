import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trophy,
  CaretUp,
  CaretDown,
  Globe,
  CalendarBlank,
  Medal,
  Users,
  Minus,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, durations, easings } from "@/lib/animation";
import {
  mockLeaderboardWeekly,
  mockLeaderboardMonthly,
  mockLeaderboardAllTime,
  mockCountryRankings,
  getCountryFlag,
  type LeaderboardEntry,
  type CountryRanking,
} from "@/mocks/competition";
import { formatDifficulty, formatNumber, formatHashrate } from "@/mocks/data";

type Tab = "weekly" | "monthly" | "alltime" | "country";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "weekly", label: "This Week", icon: <CalendarBlank size={16} weight="bold" /> },
  { id: "monthly", label: "This Month", icon: <CalendarBlank size={16} weight="bold" /> },
  { id: "alltime", label: "All Time", icon: <Trophy size={16} weight="bold" /> },
  { id: "country", label: "By Country", icon: <Globe size={16} weight="bold" /> },
];

const DATA_MAP: Record<Exclude<Tab, "country">, LeaderboardEntry[]> = {
  weekly: mockLeaderboardWeekly,
  monthly: mockLeaderboardMonthly,
  alltime: mockLeaderboardAllTime,
};

// ── Rank Display ──

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return <span className="font-mono text-secondary tabular-nums">#{rank}</span>;
}

function getRankBorderClass(rank: number): string {
  if (rank === 1) return "border-l-2 border-l-gold shadow-[inset_0_0_20px_rgba(212,168,67,0.08)]";
  if (rank === 2) return "border-l-2 border-l-secondary shadow-[inset_0_0_20px_rgba(139,148,158,0.06)]";
  if (rank === 3) return "border-l-2 border-l-[#CD7F32] shadow-[inset_0_0_20px_rgba(205,127,50,0.06)]";
  return "";
}

// ── My Position Card (sticky) ──

function MyPositionCard({ entry }: { entry: LeaderboardEntry | undefined }) {
  if (!entry) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-20"
    >
      <div className="bg-surface/95 backdrop-blur-md border border-white/6 rounded-radius-lg p-4 border-l-2 border-l-bitcoin shadow-[inset_0_0_30px_rgba(247,147,26,0.06)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-headline font-bold font-mono tabular-nums text-bitcoin">
              #{entry.rank}
            </span>
            <div className="w-8 h-8 rounded-full bg-bitcoin/20 flex items-center justify-center">
              <span className="text-sm font-bold text-bitcoin">
                {entry.displayName.charAt(0)}
              </span>
            </div>
            <div>
              <span className="font-semibold text-primary">{entry.displayName}</span>
              <span className="ml-2 text-sm">{getCountryFlag(entry.countryCode)}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right hidden sm:block">
              <div className="text-caption text-secondary">Best Diff</div>
              <div className="font-mono tabular-nums text-body font-semibold">
                {formatDifficulty(entry.bestDifficulty)}
              </div>
            </div>

            <RankChangeIndicator change={entry.rankChange} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Rank Change Arrow ──

function RankChangeIndicator({ change }: { change: number }) {
  if (change === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-caption text-secondary">
        <Minus size={14} weight="bold" />
      </span>
    );
  }

  const isUp = change > 0;
  return (
    <motion.span
      className={cn(
        "inline-flex items-center gap-0.5 text-caption font-semibold",
        isUp ? "text-green" : "text-red"
      )}
      initial={{ opacity: 0, y: isUp ? 4 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: durations.small }}
    >
      {isUp ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
      {Math.abs(change)}
    </motion.span>
  );
}

// ── Leaderboard Row ──

function LeaderboardRow({
  entry,
  index,
}: {
  entry: LeaderboardEntry;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      variants={{
        initial: { opacity: 0, x: -20 },
        animate: { opacity: 1, x: 0 },
      }}
      transition={{ delay: index * 0.05, duration: durations.medium, ease: easings.gentle }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "group cursor-pointer rounded-radius-md transition-all",
          "hover:bg-spotlight/50",
          getRankBorderClass(entry.rank),
          entry.isCurrentUser && "bg-bitcoin/[0.03] border-l-2 border-l-bitcoin"
        )}
      >
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Rank */}
          <div className="w-10 flex-shrink-0 flex justify-center">
            <RankBadge rank={entry.rank} />
          </div>

          {/* Avatar + Name */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                entry.isCurrentUser
                  ? "bg-bitcoin/20 text-bitcoin"
                  : "bg-elevated text-secondary"
              )}
            >
              <span className="text-sm font-bold">
                {entry.displayName.charAt(0)}
              </span>
            </div>
            <span
              className={cn(
                "font-medium truncate",
                entry.isCurrentUser ? "text-bitcoin" : "text-primary"
              )}
            >
              {entry.displayName}
            </span>
          </div>

          {/* Country */}
          <div className="hidden sm:flex items-center gap-1.5 w-16 flex-shrink-0">
            <span className="text-sm">{getCountryFlag(entry.countryCode)}</span>
            <span className="text-caption text-secondary">{entry.countryCode}</span>
          </div>

          {/* Best Diff */}
          <div className="w-20 flex-shrink-0 text-right">
            <span className="font-mono tabular-nums text-body-lg font-semibold text-primary">
              {formatDifficulty(entry.bestDifficulty)}
            </span>
          </div>

          {/* Shares (hidden on mobile) */}
          <div className="hidden md:block w-24 flex-shrink-0 text-right">
            <span className="font-mono tabular-nums text-caption text-secondary">
              {formatNumber(entry.totalShares)}
            </span>
          </div>

          {/* Rank change */}
          <div className="w-12 flex-shrink-0 text-right">
            <RankChangeIndicator change={entry.rankChange} />
          </div>
        </div>

        {/* Expanded mini-profile */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: durations.small }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-1 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-white/4 mt-1">
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Hashrate</div>
                  <div className="font-mono tabular-nums text-caption text-primary mt-1">
                    {formatHashrate(entry.hashrate ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Workers</div>
                  <div className="font-mono tabular-nums text-caption text-primary mt-1">
                    {entry.workerCount}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Badges</div>
                  <div className="flex gap-1 mt-1">
                    {(entry.badges ?? []).slice(0, 3).map((b) => (
                      <span
                        key={b}
                        className="w-6 h-6 rounded-full bg-elevated flex items-center justify-center"
                      >
                        <Medal size={12} className="text-gold" />
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Joined</div>
                  <div className="text-caption text-primary mt-1">
                    {entry.joinDate?.toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Country Ranking Table ──

function CountryLeaderboard({ data }: { data: CountryRanking[] }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-2"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 text-micro text-secondary uppercase tracking-wider">
        <div className="w-10 text-center">#</div>
        <div className="flex-1">Country</div>
        <div className="w-20 text-right hidden sm:block">Miners</div>
        <div className="w-24 text-right">Hashrate</div>
      </div>

      {data.map((country, i) => (
        <motion.div
          key={country.countryCode}
          variants={staggerItem}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-radius-md transition-colors hover:bg-spotlight/50",
            country.countryCode === "PT" && "bg-bitcoin/[0.03] border-l-2 border-l-bitcoin"
          )}
        >
          <div className="w-10 text-center">
            {i < 3 ? (
              <span className="text-lg">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</span>
            ) : (
              <span className="font-mono text-secondary tabular-nums">#{country.rank}</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl">{getCountryFlag(country.countryCode)}</span>
            <span className="font-medium text-primary truncate">{country.countryName}</span>
          </div>

          <div className="w-20 text-right hidden sm:block">
            <span className="font-mono tabular-nums text-caption text-secondary">
              {formatNumber(country.minerCount)}
            </span>
          </div>

          <div className="w-24 text-right">
            <span className="font-mono tabular-nums text-body font-semibold text-primary">
              {formatHashrate(country.totalHashrate)}
            </span>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ── Segmented Control ──

function SegmentedControl({
  tabs,
  active,
  onChange,
}: {
  tabs: typeof TABS;
  active: Tab;
  onChange: (tab: Tab) => void;
}) {
  return (
    <div className="flex bg-elevated rounded-radius-md p-1 overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "relative flex items-center gap-1.5 px-4 py-2 text-caption font-medium rounded-radius-sm transition-colors whitespace-nowrap flex-1 justify-center",
            active === tab.id
              ? "text-primary"
              : "text-secondary hover:text-primary"
          )}
        >
          {active === tab.id && (
            <motion.div
              layoutId="leaderboard-tab"
              className="absolute inset-0 bg-floating rounded-radius-sm"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Main Page ──

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("weekly");

  const currentUser =
    activeTab !== "country"
      ? DATA_MAP[activeTab].find((e) => e.isCurrentUser)
      : undefined;

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Page header */}
      <motion.div variants={staggerItem} className="flex items-center gap-3">
        <div className="p-2 rounded-radius-md bg-bitcoin/10">
          <Trophy size={24} weight="duotone" className="text-bitcoin" />
        </div>
        <div>
          <h1 className="text-title font-bold">Leaderboard</h1>
          <p className="text-caption text-secondary">
            {activeTab === "country"
              ? "Rankings by country"
              : `Top miners — ${TABS.find((t) => t.id === activeTab)?.label}`}
          </p>
        </div>
      </motion.div>

      {/* Tab control */}
      <motion.div variants={staggerItem}>
        <SegmentedControl tabs={TABS} active={activeTab} onChange={setActiveTab} />
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        {activeTab === "country" ? (
          <motion.div
            key="country"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: durations.medium }}
          >
            <Card padding="sm">
              {/* Globe stats summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border-b border-white/4">
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Countries</div>
                  <div className="font-mono tabular-nums text-headline font-bold mt-1">
                    {mockCountryRankings.length}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Total Miners</div>
                  <div className="font-mono tabular-nums text-headline font-bold mt-1">
                    {formatNumber(mockCountryRankings.reduce((a, c) => a + c.minerCount, 0))}
                  </div>
                </div>
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Top Country</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span>{getCountryFlag("US")}</span>
                    <span className="font-semibold">USA</span>
                  </div>
                </div>
                <div>
                  <div className="text-micro text-secondary uppercase tracking-wider">Your Country</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span>{getCountryFlag("PT")}</span>
                    <span className="font-semibold text-bitcoin">#12</span>
                  </div>
                </div>
              </div>

              <CountryLeaderboard data={mockCountryRankings} />
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: durations.medium }}
            className="space-y-4"
          >
            {/* My Position */}
            <MyPositionCard entry={currentUser} />

            {/* Leaderboard table */}
            <Card padding="sm">
              {/* Column headers */}
              <div className="flex items-center gap-3 px-4 py-2 text-micro text-secondary uppercase tracking-wider border-b border-white/4">
                <div className="w-10 text-center">#</div>
                <div className="flex-1">Miner</div>
                <div className="hidden sm:block w-16">Country</div>
                <div className="w-20 text-right">Best Diff</div>
                <div className="hidden md:block w-24 text-right">Shares</div>
                <div className="w-12 text-right">
                  <Users size={12} className="inline" />
                </div>
              </div>

              {/* Rows */}
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className="divide-y divide-white/[0.02]"
              >
                {DATA_MAP[activeTab].map((entry, i) => (
                  <LeaderboardRow key={entry.userId} entry={entry} index={i} />
                ))}
              </motion.div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
