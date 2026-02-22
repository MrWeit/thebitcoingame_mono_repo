import { useRef, useState, useEffect } from "react";
import { motion, useInView } from "framer-motion";
import { Link } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Cube,
  ArrowRight,
  Trophy,
  Globe,
  Clock,
  CurrencyBtc,
  Copy,
  Check,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import {
  mockAllBlocks,
  mockBlockStats,
  mockBlocksTimeline,
  formatNumber,
  formatTimeAgo,
  getCountryFlag,
  type PublicBlock,
} from "@/mocks/blocks";

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

function FloatingParticles({ count = 20 }: { count?: number }) {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

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
            className="absolute rounded-full bg-bitcoin/30"
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

function truncateHash(hash: string): string {
  return `${hash.slice(0, 12)}...${hash.slice(-8)}`;
}

/* ══════════════════════════════════════════════════════
   SECTION 1: HERO STATS
   ══════════════════════════════════════════════════════ */

function HeroStats() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const prefersReduced = useReducedMotion();

  const blockCount = useCountUp(mockBlockStats.totalBlocks, 1500, isInView);
  const countryCount = useCountUp(mockBlockStats.countriesRepresented, 1500, isInView);

  const stats = [
    {
      label: "Total Blocks",
      value: formatNumber(blockCount),
      icon: <Cube size={20} weight="duotone" className="text-bitcoin" />,
    },
    {
      label: "Total BTC Earned",
      value: `${mockBlockStats.totalBTC.toFixed(3)} BTC`,
      icon: <CurrencyBtc size={20} weight="duotone" className="text-bitcoin" />,
    },
    {
      label: "Latest Block",
      value: formatTimeAgo(mockBlockStats.latestBlock.timestamp),
      icon: <Clock size={20} weight="duotone" className="text-cyan" />,
    },
    {
      label: "Countries",
      value: formatNumber(countryCount),
      icon: <Globe size={20} weight="duotone" className="text-cyan" />,
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
          <div className="absolute inset-0 bg-gradient-to-br from-bitcoin/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
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
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 2: LATEST BLOCK HIGHLIGHT
   ══════════════════════════════════════════════════════ */

function LatestBlockHighlight() {
  const block = mockBlockStats.latestBlock;
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(block.hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const fiatValue = block.reward * mockBlockStats.btcPrice;

  return (
    <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-6 sm:p-8 overflow-hidden">
      {/* Gold left border */}
      <div className="absolute left-0 top-4 bottom-4 w-[3px] rounded-full bg-gradient-to-b from-bitcoin via-gold to-bitcoin/30" />

      {/* Background glow */}
      <div
        className="absolute top-1/2 left-0 -translate-y-1/2 w-[300px] h-[200px]"
        style={{
          background:
            "radial-gradient(ellipse at left, rgba(247,147,26,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 pl-4">
        {/* Eyebrow */}
        <span className="inline-block text-[11px] text-bitcoin/70 uppercase tracking-[0.15em] font-semibold mb-4">
          Latest Block
        </span>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: Block info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Trophy size={20} weight="fill" className="text-gold" />
              <Mono className="text-2xl font-bold text-primary tabular-nums">
                #{formatNumber(block.height)}
              </Mono>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-lg">{getCountryFlag(block.finderCountry)}</span>
              <span className="text-body font-medium text-primary">{block.finder}</span>
            </div>

            {/* Hash with copy */}
            <div className="flex items-center gap-2">
              <Mono className="text-caption text-white/30">{truncateHash(block.hash)}</Mono>
              <button
                onClick={handleCopy}
                className="p-1 rounded-md hover:bg-white/5 transition-colors"
                aria-label={copied ? "Hash copied" : "Copy block hash"}
              >
                {copied ? (
                  <Check size={14} className="text-green" />
                ) : (
                  <Copy size={14} className="text-white/30 hover:text-white/50" />
                )}
              </button>
            </div>
          </div>

          {/* Right: Reward + meta */}
          <div className="flex flex-col gap-2 md:items-end">
            <Mono className="text-2xl sm:text-3xl font-bold text-bitcoin tabular-nums">
              {block.reward.toFixed(8)} BTC
            </Mono>
            <span className="text-caption text-white/30 font-mono">
              ~ ${formatNumber(fiatValue)}
            </span>
            <div className="flex items-center gap-4 text-caption text-white/40 mt-1">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTimeAgo(block.timestamp)}
              </span>
              <Mono>{formatNumber(block.confirmations)} confirmations</Mono>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 3: ALL BLOCKS LIST
   ══════════════════════════════════════════════════════ */

function BlockRow({
  block,
  index,
  isInView,
}: {
  block: PublicBlock;
  index: number;
  isInView: boolean;
}) {
  const prefersReduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={
        prefersReduced
          ? { duration: 0 }
          : { delay: Math.min(index, 15) * 0.03, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
      }
    >
      {/* Desktop row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        {/* Desktop layout */}
        <div className="hidden md:flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-2 w-[140px]">
            <Trophy size={14} weight="fill" className="text-gold flex-shrink-0" />
            <Mono className="text-caption font-semibold text-primary tabular-nums">
              #{formatNumber(block.height)}
            </Mono>
          </div>
          <div className="flex items-center gap-2 w-[180px]">
            <span className="text-base">{getCountryFlag(block.finderCountry)}</span>
            <span className="text-caption text-white/70 truncate">{block.finder}</span>
          </div>
          <Mono className="text-caption text-bitcoin font-semibold w-[120px] tabular-nums">
            {block.reward} BTC
          </Mono>
          <span className="text-caption text-white/30 w-[100px]">
            {formatTimeAgo(block.timestamp)}
          </span>
          <Mono className="text-caption text-white/20 flex-1 text-right tabular-nums">
            {formatNumber(block.confirmations)} conf.
          </Mono>
        </div>

        {/* Mobile card */}
        <div className="md:hidden relative bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-xl p-4 hover:border-white/10 transition-colors">
          <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-gradient-to-b from-bitcoin via-gold to-bitcoin/30" />
          <div className="pl-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy size={14} weight="fill" className="text-gold" />
                <Mono className="text-caption font-semibold text-primary tabular-nums">
                  #{formatNumber(block.height)}
                </Mono>
              </div>
              <Mono className="text-caption text-bitcoin font-semibold tabular-nums">
                {block.reward} BTC
              </Mono>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">{getCountryFlag(block.finderCountry)}</span>
                <span className="text-caption text-white/70">{block.finder}</span>
              </div>
              <span className="text-micro text-white/30">
                {formatTimeAgo(block.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded hash row */}
      {expanded && (
        <div className="px-4 py-2 md:ml-[140px]">
          <Mono className="text-micro text-white/20 break-all">{block.hash}</Mono>
        </div>
      )}
    </motion.div>
  );
}

function AllBlocksList() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const [showAll, setShowAll] = useState(false);

  const visibleBlocks = showAll ? mockAllBlocks : mockAllBlocks.slice(0, 15);

  return (
    <div ref={ref}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-lg font-bold text-primary">All Blocks</h2>
        <span
          className={cn(
            "inline-flex items-center justify-center",
            "h-6 min-w-6 px-2 rounded-full",
            "bg-gold/10 text-gold text-caption font-semibold",
          )}
        >
          <Mono>{mockAllBlocks.length}</Mono>
        </span>
      </div>

      {/* Desktop column headers */}
      <div className="hidden md:flex items-center gap-4 px-4 py-2 text-micro text-white/20 uppercase tracking-wider border-b border-white/[0.04] mb-2">
        <span className="w-[140px]">Block</span>
        <span className="w-[180px]">Finder</span>
        <span className="w-[120px]">Reward</span>
        <span className="w-[100px]">Time</span>
        <span className="flex-1 text-right">Confirmations</span>
      </div>

      {/* Block rows */}
      <div className="space-y-1 md:space-y-0">
        {visibleBlocks.map((block, i) => (
          <BlockRow key={block.id} block={block} index={i} isInView={isInView} />
        ))}
      </div>

      {/* Show more */}
      {!showAll && mockAllBlocks.length > 15 && (
        <div className="mt-4 text-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAll(true)}
          >
            Show All {mockAllBlocks.length} Blocks
          </Button>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 4: BLOCK STATISTICS
   ══════════════════════════════════════════════════════ */

interface BlocksTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function BlocksTooltip({ active, payload, label }: BlocksTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-floating border border-white/8 rounded-radius-sm px-3 py-2 shadow-heavy">
      <p className="text-micro text-secondary mb-1">{label}</p>
      <Mono className="text-caption font-medium text-primary">
        {payload[0].value} {payload[0].value === 1 ? "block" : "blocks"}
      </Mono>
    </div>
  );
}

function BlockStatistics() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  const maxCount = Math.max(...mockBlockStats.blocksByCountry.map((c) => c.count));

  const statItems = [
    {
      label: "Avg. Days Between Blocks",
      value: `~${mockBlockStats.avgDaysBetweenBlocks} days`,
      icon: <Clock size={18} weight="duotone" className="text-cyan" />,
    },
    {
      label: "Total BTC Earned",
      value: `${mockBlockStats.totalBTC.toFixed(3)} BTC`,
      sub: `~ $${formatNumber(mockBlockStats.totalFiat)}`,
      icon: <CurrencyBtc size={18} weight="duotone" className="text-bitcoin" />,
    },
    {
      label: "Unique Miners",
      value: `${mockBlockStats.uniqueMiners} miners`,
      sub: `from ${mockBlockStats.countriesRepresented} countries`,
      icon: <Globe size={18} weight="duotone" className="text-cyan" />,
    },
    {
      label: "Most Prolific Country",
      value: `${mockBlockStats.blocksByCountry[0].flag} ${mockBlockStats.blocksByCountry[0].country}`,
      sub: `${mockBlockStats.blocksByCountry[0].count} blocks`,
      icon: <Trophy size={18} weight="duotone" className="text-gold" />,
    },
  ];

  return (
    <div ref={ref} className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left: Timeline chart */}
      <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-1">
          <Cube size={18} weight="duotone" className="text-bitcoin" />
          <h3 className="text-body-lg font-bold text-primary">Blocks Over Time</h3>
        </div>
        <p className="text-caption text-white/30 mb-4">Monthly block discoveries</p>

        <div style={{ minHeight: 240 }}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={mockBlocksTimeline}
              margin={{ top: 0, right: 0, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="month"
                tick={{ fill: "#8B949E", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
                interval={Math.max(0, Math.floor(mockBlocksTimeline.length / 6) - 1)}
              />
              <YAxis
                tick={{ fill: "#8B949E", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip
                content={<BlocksTooltip />}
                cursor={{ fill: "rgba(255,255,255,0.03)" }}
              />
              <Bar
                dataKey="blocks"
                fill="#F7931A"
                radius={[3, 3, 0, 0]}
                animationDuration={800}
                animationEasing="ease-out"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Right: Stats + Top Countries */}
      <div className="space-y-4">
        {/* Stat items */}
        {statItems.map((item, i) => (
          <motion.div
            key={item.label}
            initial={prefersReduced ? {} : { opacity: 0, x: 20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { delay: 0.1 + i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
            }
            className="bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-xl px-4 py-3 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              {item.icon}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-micro text-white/30 uppercase tracking-wider">
                {item.label}
              </span>
              <div className="flex items-baseline gap-2">
                <Mono className="text-body font-semibold text-primary tabular-nums">
                  {item.value}
                </Mono>
                {item.sub && (
                  <span className="text-caption text-white/30">{item.sub}</span>
                )}
              </div>
            </div>
          </motion.div>
        ))}

        {/* Top countries by blocks */}
        <div className="bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-xl px-4 py-3">
          <span className="text-micro text-white/30 uppercase tracking-wider">
            Top Countries by Blocks
          </span>
          <div className="mt-2 space-y-1.5">
            {mockBlockStats.blocksByCountry.slice(0, 5).map((entry, i) => (
              <motion.div
                key={entry.code}
                initial={prefersReduced ? {} : { opacity: 0, x: 10 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={
                  prefersReduced
                    ? { duration: 0 }
                    : { delay: 0.4 + i * 0.05, duration: 0.4, ease: [0.22, 1, 0.36, 1] }
                }
                className="flex items-center gap-2"
              >
                <span className="text-sm">{entry.flag}</span>
                <span className="text-caption text-white/60 w-[80px] truncate">
                  {entry.country}
                </span>
                <Mono className="text-micro text-white/30 w-[50px] tabular-nums">
                  {entry.count} blk
                </Mono>
                <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-bitcoin/50"
                    initial={{ width: 0 }}
                    animate={isInView ? { width: `${(entry.count / maxCount) * 100}%` } : {}}
                    transition={
                      prefersReduced
                        ? { duration: 0 }
                        : { delay: 0.5 + i * 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }
                    }
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   SECTION 5: CTA BANNER
   ══════════════════════════════════════════════════════ */

function CTABanner() {
  return (
    <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.06] rounded-2xl p-10 sm:p-14 text-center overflow-hidden">
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(247,147,26,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10">
        <CurrencyBtc size={40} weight="duotone" className="text-bitcoin mx-auto mb-4" />
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-primary mb-3">
          The next block could be yours
        </h2>
        <p className="text-base text-white/40 mb-8 max-w-md mx-auto">
          {formatNumber(mockBlockStats.totalBlocks)} solo miners have already found a block.
          Connect your miner and start playing.
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
              How It Works
            </Button>
          </Link>
        </div>
      </div>

      <FloatingParticles count={15} />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function PublicBlocksPage() {
  return (
    <div className="min-h-screen bg-canvas overflow-hidden">
      {/* ─── HERO ─── */}
      <section className="relative pt-16 pb-8 px-6">
        <div className="absolute inset-0">
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px]"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(247,147,26,0.06) 0%, transparent 70%)",
            }}
          />
          <FloatingParticles count={20} />
        </div>

        <div className="relative z-10 max-w-[1200px] mx-auto">
          <ScrollSection className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-6">
              <div className="w-1.5 h-1.5 rounded-full bg-bitcoin animate-pulse" />
              <span className="text-[11px] text-white/40 uppercase tracking-[0.2em] font-semibold">
                Blocks Found
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary leading-tight mb-4">
              Blocks Found by{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-gold">
                Our Miners
              </span>
            </h1>
            <p className="text-lg text-white/40 max-w-lg mx-auto">
              {formatNumber(mockBlockStats.totalBlocks)} solo miners have found Bitcoin blocks.
              Each one earned 3.125 BTC.
            </p>
          </ScrollSection>

          <ScrollSection delay={0.2}>
            <HeroStats />
          </ScrollSection>
        </div>
      </section>

      {/* ─── LATEST BLOCK ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          <LatestBlockHighlight />
        </ScrollSection>
      </section>

      {/* ─── ALL BLOCKS ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          <AllBlocksList />
        </ScrollSection>
      </section>

      {/* ─── STATISTICS ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10">
        <ScrollSection>
          <BlockStatistics />
        </ScrollSection>
      </section>

      {/* ─── CTA ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-10 pb-20">
        <ScrollSection>
          <CTABanner />
        </ScrollSection>
      </section>
    </div>
  );
}
