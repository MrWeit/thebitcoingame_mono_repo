import { useRef, useEffect, useState, useMemo } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ArrowRight,
  ArrowUp,
  Cube,
  Globe,
  TrendUp,
  Users,
  ChartBar,
  Clock,
  CurrencyBtc,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/mocks/data";
import {
  mockGlobalStats,
  mockNetworkHashrate,
  mockSharesPerHour,
  mockDiffDistribution,
  mockCountryStats,
  mockRecentBlocks,
  mockMilestones,
  formatHashrate,
  formatNumber,
} from "@/mocks/stats";

/* ══════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════ */

function useCountUp(end: number, duration = 2000, startWhen = true) {
  const [count, setCount] = useState(0);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (!startWhen) return;
    if (prefersReduced) {
      setCount(end);
      return;
    }
    let start = 0;
    const step = end / (duration / 16);
    const id = setInterval(() => {
      start += step;
      if (start >= end) {
        setCount(end);
        clearInterval(id);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(id);
  }, [end, duration, startWhen, prefersReduced]);
  return count;
}

/* ── ScrollSection — matches HowItWorksPage pattern ── */
function ScrollSection({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.div
      ref={ref}
      initial={prefersReduced ? {} : { opacity: 0, y: 60 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }
      }
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Floating particles — ambient background ── */
function FloatingParticles({ count = 20, color = "cyan" }: { count?: number; color?: string }) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

  const colorMap: Record<string, string> = {
    cyan: "bg-cyan/30",
    bitcoin: "bg-bitcoin/30",
    white: "bg-white/10",
  };

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: count }).map((_, i) => {
        const size = 1 + Math.random() * 3;
        const x = Math.random() * 100;
        const y = Math.random() * 100;
        const dur = 4 + Math.random() * 8;
        const particleDelay = Math.random() * 5;

        return (
          <motion.div
            key={i}
            className={cn("absolute rounded-full", colorMap[color] || colorMap.cyan)}
            style={{ width: size, height: size, left: `${x}%`, top: `${y}%` }}
            animate={{ y: [0, -30, 0], opacity: [0, 0.8, 0] }}
            transition={{
              duration: dur,
              delay: particleDelay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 1: HERO STATS
   ══════════════════════════════════════════════════════ */

function HeroStats() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const prefersReduced = useReducedMotion();

  const minerCount = useCountUp(mockGlobalStats.totalMiners, 2000, isInView);
  const blockCount = useCountUp(mockGlobalStats.blocksFound, 1500, isInView);

  const stats = [
    {
      label: "Total Miners",
      value: formatNumber(minerCount),
      sub: `↑ ${formatNumber(mockGlobalStats.newMinersToday)} today`,
      icon: <Users size={20} weight="duotone" className="text-cyan" />,
    },
    {
      label: "Network Hashrate",
      value: formatHashrate(mockGlobalStats.totalHashrate),
      sub: `↑ ${mockGlobalStats.hashrateChange24h}% 24h`,
      icon: <TrendUp size={20} weight="duotone" className="text-cyan" />,
    },
    {
      label: "Blocks Found",
      value: formatNumber(blockCount),
      sub: `Latest: ${Math.floor(mockGlobalStats.latestBlockAge / 86400)}d ago`,
      icon: <Cube size={20} weight="duotone" className="text-bitcoin" />,
    },
    {
      label: "Shares This Week",
      value: formatNumber(mockGlobalStats.totalSharesThisWeek),
      sub: `${formatNumber(mockGlobalStats.countriesRepresented)} countries`,
      icon: <ChartBar size={20} weight="duotone" className="text-cyan" />,
    },
  ];

  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={prefersReduced ? {} : { opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={
            prefersReduced
              ? { duration: 0 }
              : { delay: 0.1 + i * 0.1, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
          }
          className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-6 overflow-hidden group hover:border-white/10 transition-colors"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-white/30 uppercase tracking-[0.15em] font-semibold">
                {stat.label}
              </span>
              {stat.icon}
            </div>
            <Mono className="text-2xl sm:text-3xl font-bold text-primary tabular-nums">
              {stat.value}
            </Mono>
            <p className="text-caption text-white/30 mt-1.5 flex items-center gap-1">
              <ArrowUp size={12} weight="bold" className="text-green" />
              {stat.sub}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 2: NETWORK HASHRATE CHART
   ══════════════════════════════════════════════════════ */

type TimeRange = "24h" | "7d" | "30d" | "all";

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "all", label: "All" },
];

function formatXAxis(iso: string, range: TimeRange): string {
  const d = new Date(iso);
  switch (range) {
    case "24h":
      return d.toLocaleTimeString("en-US", { hour: "2-digit" });
    case "7d":
      return d.toLocaleDateString("en-US", { weekday: "short" });
    case "30d":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    case "all":
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
}

function formatYAxisHashrate(value: number): string {
  if (value >= 1e18) return `${(value / 1e18).toFixed(1)} EH`;
  if (value >= 1e15) return `${(value / 1e15).toFixed(1)} PH`;
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)} TH`;
  return `${value}`;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function HashrateTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-floating border border-white/8 rounded-radius-sm px-3 py-2 shadow-heavy">
      <p className="text-micro text-secondary mb-1">
        {label
          ? new Date(label).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : ""}
      </p>
      <Mono className="text-caption font-medium text-primary">
        {formatHashrate(payload[0].value)}
      </Mono>
    </div>
  );
}

function NetworkHashrateChart() {
  const [range, setRange] = useState<TimeRange>("24h");
  const data = useMemo(() => mockNetworkHashrate[range], [range]);

  return (
    <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-6 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-bold text-primary mb-1">Network Hashrate</h3>
          <p className="text-caption text-white/30">Combined hashrate from all connected miners</p>
        </div>
        {/* Time range segmented control */}
        <div className="flex items-center bg-elevated rounded-radius-sm p-0.5 border border-white/4 self-start">
          {TIME_RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={cn(
                "relative px-3 py-1.5 text-micro font-medium rounded-radius-sm transition-colors",
                range === key ? "text-primary" : "text-secondary hover:text-primary",
              )}
            >
              {range === key && (
                <motion.div
                  layoutId="stats-hashrate-range"
                  className="absolute inset-0 bg-surface border border-white/8 rounded-radius-sm shadow-subtle"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ minHeight: 300 }}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="statsHashrateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F7931A" stopOpacity={0.3} />
                <stop offset="50%" stopColor="#F7931A" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#F7931A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tickFormatter={(v: string) => formatXAxis(v, range)}
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickFormatter={formatYAxisHashrate}
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              content={<HashrateTooltip />}
              cursor={{ stroke: "rgba(88,166,255,0.3)", strokeDasharray: "4 4" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#F7931A"
              strokeWidth={2}
              fill="url(#statsHashrateGradient)"
              animationDuration={800}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 3: MINING ACTIVITY (Shares + Diff Distribution)
   ══════════════════════════════════════════════════════ */

function SharesTooltip({ active, payload, label }: ChartTooltipProps & { label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-floating border border-white/8 rounded-radius-sm px-3 py-2 shadow-heavy">
      <p className="text-micro text-secondary mb-1">{label}</p>
      <Mono className="text-caption font-medium text-primary">
        {formatNumber(payload[0].value as number)} shares
      </Mono>
    </div>
  );
}

function DiffTooltip({ active, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-floating border border-white/8 rounded-radius-sm px-3 py-2 shadow-heavy">
      <Mono className="text-caption font-medium text-primary">
        {formatNumber(item.value as number)} shares
      </Mono>
    </div>
  );
}

function MiningActivity() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Shares per hour */}
      <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-6">
        <h3 className="text-lg font-bold text-primary mb-1">Shares Today</h3>
        <p className="text-caption text-white/30 mb-4">Shares submitted per hour</p>
        <div style={{ minHeight: 220 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mockSharesPerHour} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="hour"
                tick={{ fill: "#8B949E", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
                interval={3}
              />
              <YAxis
                tick={{ fill: "#8B949E", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
                width={40}
              />
              <Tooltip
                content={<SharesTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar dataKey="shares" radius={[3, 3, 0, 0]} animationDuration={800}>
                {mockSharesPerHour.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.isCurrent ? "#F7931A" : "rgba(247,147,26,0.3)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Difficulty distribution */}
      <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-6">
        <h3 className="text-lg font-bold text-primary mb-1">Difficulty Distribution</h3>
        <p className="text-caption text-white/30 mb-4">Share difficulty across all miners</p>
        <div style={{ minHeight: 220 }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={mockDiffDistribution}
              layout="vertical"
              margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
            >
              <XAxis
                type="number"
                tick={{ fill: "#8B949E", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`}
              />
              <YAxis
                type="category"
                dataKey="bucket"
                tick={{ fill: "#8B949E", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                content={<DiffTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} animationDuration={800}>
                {mockDiffDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 4: COUNTRY LEADERBOARD
   ══════════════════════════════════════════════════════ */

function CountryLeaderboard() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const maxHashrate = mockCountryStats[0].hashrate;

  return (
    <div
      ref={ref}
      className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-6 overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-1">
        <Globe size={20} weight="duotone" className="text-cyan" />
        <h3 className="text-lg font-bold text-primary">Miners Around the World</h3>
      </div>
      <p className="text-caption text-white/30 mb-6">
        {formatNumber(mockGlobalStats.countriesRepresented)} countries represented
      </p>

      <div className="space-y-2">
        {mockCountryStats.map((entry, i) => (
          <motion.div
            key={entry.code}
            initial={prefersReduced ? {} : { opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { delay: 0.1 + i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
            }
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06] transition-all"
          >
            <span className="text-base w-7">{entry.flag}</span>
            <span className="text-[13px] font-medium text-white/70 w-[140px] truncate">
              {entry.country}
            </span>
            <Mono className="text-[11px] text-white/30 w-[80px] tabular-nums">
              {formatNumber(entry.miners)} miners
            </Mono>
            <Mono className="text-[11px] text-white/40 w-[70px] tabular-nums">
              {formatHashrate(entry.hashrate)}
            </Mono>
            {/* Proportional bar */}
            <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-cyan/60 to-cyan/30"
                initial={{ width: 0 }}
                animate={isInView ? { width: `${(entry.hashrate / maxHashrate) * 100}%` } : {}}
                transition={
                  prefersReduced
                    ? { duration: 0 }
                    : { delay: 0.3 + i * 0.06, duration: 0.8, ease: [0.22, 1, 0.36, 1] }
                }
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-5">
        <Link to="/leaderboard">
          <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={14} />}>
            View Full Leaderboard
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 5: RECENT BLOCKS
   ══════════════════════════════════════════════════════ */

function RecentBlocks() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref}>
      <div className="flex items-center gap-2 mb-1">
        <Cube size={20} weight="duotone" className="text-bitcoin" />
        <h3 className="text-lg font-bold text-primary">Blocks Found by Our Miners</h3>
      </div>
      <p className="text-caption text-white/30 mb-6">
        {formatNumber(mockGlobalStats.blocksFound)} blocks and counting
      </p>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
        {mockRecentBlocks.slice(0, 6).map((block, i) => (
          <motion.div
            key={block.height}
            initial={prefersReduced ? {} : { opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { delay: 0.1 + i * 0.08, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
            }
            className="snap-start min-w-[240px] md:min-w-0 bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-5 relative overflow-hidden group hover:border-white/10 transition-colors"
          >
            {/* Gold left border */}
            <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-gradient-to-b from-bitcoin via-gold to-bitcoin/30" />

            <div className="pl-3">
              <Mono className="text-caption font-semibold text-white/60 mb-2">
                Block #{formatNumber(block.height)}
              </Mono>
              <p className="text-body font-medium text-primary mb-1">{block.finder}</p>
              <span className="text-lg mr-2">{block.finderCountry}</span>
              <Mono className="text-bitcoin font-bold text-body">
                {block.reward} BTC
              </Mono>
              <p className="text-micro text-white/20 mt-2 flex items-center gap-1">
                <Clock size={12} />
                {formatTimeAgo(block.timestamp)}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-5">
        <Link to="/blocks">
          <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={14} />}>
            View All Blocks
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 6: MILESTONES TIMELINE
   ══════════════════════════════════════════════════════ */

function MilestonesTimeline() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div ref={ref}>
      <div className="text-center mb-10">
        <p className="text-[11px] text-white/20 uppercase tracking-[0.2em] font-semibold mb-3">
          Milestones
        </p>
        <h3 className="text-2xl sm:text-3xl font-bold text-primary">Our Journey</h3>
      </div>

      <div className="relative max-w-2xl mx-auto">
        {/* Vertical line */}
        <div className="absolute left-4 md:left-1/2 md:-translate-x-px top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.08] to-transparent" />

        <div className="space-y-10">
          {mockMilestones.map((milestone, i) => {
            const isRight = i % 2 === 1;
            return (
              <motion.div
                key={milestone.date}
                initial={prefersReduced ? {} : { opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={
                  prefersReduced
                    ? { duration: 0 }
                    : { delay: 0.15 + i * 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
                }
                className={cn(
                  "relative pl-12 md:pl-0 md:w-1/2",
                  isRight ? "md:ml-auto md:pl-10" : "md:pr-10 md:text-right",
                )}
              >
                {/* Orange dot */}
                <div
                  className={cn(
                    "absolute top-1 w-3 h-3 rounded-full bg-bitcoin border-2 border-canvas",
                    "left-[10px] md:left-auto",
                    isRight ? "md:left-[-6px]" : "md:right-[-6px]",
                  )}
                />

                {/* Date pill */}
                <span className="inline-block px-3 py-1 text-micro font-mono text-bitcoin/70 bg-bitcoin/10 border border-bitcoin/15 rounded-full mb-2">
                  {milestone.date}
                </span>

                <h4 className="text-body-lg font-bold text-primary mb-1">{milestone.title}</h4>
                <p className="text-caption text-white/40">{milestone.description}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 7: CTA BANNER
   ══════════════════════════════════════════════════════ */

function CTABanner() {
  return (
    <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-10 sm:p-14 text-center overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px]"
        style={{
          background: "radial-gradient(ellipse at center, rgba(247,147,26,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10">
        <CurrencyBtc size={40} weight="duotone" className="text-bitcoin mx-auto mb-4" />
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-3">
          Join {formatNumber(mockGlobalStats.totalMiners)} miners making Bitcoin mining fun
        </h2>
        <p className="text-base text-white/40 mb-8 max-w-md mx-auto">
          Connect your miner and start playing. It takes less than 5 minutes.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/connect">
            <Button
              variant="primary"
              size="lg"
              rightIcon={<ArrowRight size={18} weight="bold" />}
              className="shadow-lg shadow-bitcoin/20"
            >
              Connect Your Miner
            </Button>
          </Link>
          <Link to="/how-it-works">
            <Button variant="ghost" size="lg">
              Learn How It Works
            </Button>
          </Link>
        </div>
      </div>

      <FloatingParticles count={15} color="bitcoin" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function StatsPage() {
  return (
    <div className="min-h-screen bg-canvas overflow-hidden">
      {/* ─── HERO ─── */}
      <section className="relative pt-16 pb-8 px-6">
        {/* Background effects */}
        <div className="absolute inset-0">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px]"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(6,182,212,0.06) 0%, transparent 70%)",
            }}
          />
          <FloatingParticles count={20} color="cyan" />
        </div>

        <div className="relative z-10 max-w-[1200px] mx-auto">
          {/* Header text */}
          <ScrollSection className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-green animate-pulse" />
              <span className="text-[11px] text-white/40 uppercase tracking-[0.2em] font-semibold">
                Live Network Stats
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary leading-tight mb-4">
              The Bitcoin Game —{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan to-bitcoin">
                Global Stats
              </span>
            </h1>
            <p className="text-lg text-white/40 max-w-lg mx-auto">
              Real-time overview of our mining network
            </p>
          </ScrollSection>

          {/* Stat cards */}
          <ScrollSection delay={0.2}>
            <HeroStats />
          </ScrollSection>
        </div>
      </section>

      {/* ─── HASHRATE CHART ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          <NetworkHashrateChart />
        </ScrollSection>
      </section>

      {/* ─── MINING ACTIVITY ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          <MiningActivity />
        </ScrollSection>
      </section>

      {/* ─── COUNTRY LEADERBOARD ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          <CountryLeaderboard />
        </ScrollSection>
      </section>

      {/* ─── RECENT BLOCKS ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          <RecentBlocks />
        </ScrollSection>
      </section>

      {/* ─── MILESTONES TIMELINE ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-16">
        <ScrollSection>
          <MilestonesTimeline />
        </ScrollSection>
      </section>

      {/* ─── CTA BANNER ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10 pb-20">
        <ScrollSection>
          <CTABanner />
        </ScrollSection>
      </section>
    </div>
  );
}
