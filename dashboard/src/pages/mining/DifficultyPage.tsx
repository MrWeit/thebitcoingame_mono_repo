import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Mountains,
  Trophy,
  ChartLineUp,
  ChartBar,
  CaretUp,
} from "@phosphor-icons/react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import {
  staggerContainer,
  staggerItem,
} from "@/lib/animation";
import {
  mockPersonalBests,
  mockDifficultyScatter,
  mockDifficultyDistribution,
  mockDashboardStats,
  formatDifficulty,
  formatNumber,
} from "@/mocks/data";

/* ══════════════════════════════════════════════
   Section 1 — Mountain Visualization (Hero)
   ══════════════════════════════════════════════ */

/** Small twinkling star for the SVG sky */
function Star({ cx, cy, r, delay }: { cx: number; cy: number; r: number; delay: number }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill="#E6EDF3"
      initial={{ opacity: 0.15 }}
      animate={{ opacity: [0.15, 0.7, 0.15] }}
      transition={{
        duration: 3 + Math.random() * 2,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

/** Generate deterministic star positions */
function generateStars(count: number, width: number, height: number) {
  const seed = 42;
  const stars: { cx: number; cy: number; r: number; delay: number }[] = [];
  for (let i = 0; i < count; i++) {
    const pseudo = ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280;
    const pseudo2 = ((seed * (i + 7) * 9301 + 49297) % 233280) / 233280;
    stars.push({
      cx: pseudo * width,
      cy: pseudo2 * (height * 0.45),
      r: 0.5 + pseudo * 1.2,
      delay: pseudo2 * 4,
    });
  }
  return stars;
}

/** Milestone flag on the mountain */
function MilestoneFlag({
  x,
  y,
  label,
}: {
  x: number;
  y: number;
  label: string;
}) {
  return (
    <g>
      <line
        x1={x}
        y1={y}
        x2={x}
        y2={y - 18}
        stroke="#8B949E"
        strokeWidth={1}
      />
      <rect
        x={x + 1}
        y={y - 18}
        width={28}
        height={12}
        rx={2}
        fill="#161B22"
        stroke="#30363D"
        strokeWidth={0.5}
      />
      <text
        x={x + 15}
        y={y - 9}
        textAnchor="middle"
        fill="#8B949E"
        fontSize={7}
        fontFamily="JetBrains Mono, monospace"
      >
        {label}
      </text>
    </g>
  );
}

function MountainVisualization() {
  const { bestDiffWeek, networkDiff } = mockDashboardStats;
  const ratio = bestDiffWeek / networkDiff;
  const percentText = (ratio * 100).toFixed(4);

  const userBestFormatted = formatDifficulty(bestDiffWeek);
  const networkFormatted = formatDifficulty(networkDiff);

  const logMin = Math.log10(1e3);
  const logMax = Math.log10(networkDiff);
  const logUser = Math.log10(bestDiffWeek);
  const climbPercent = Math.min(
    1,
    Math.max(0, (logUser - logMin) / (logMax - logMin))
  );

  const viewWidth = 900;
  const viewHeight = 420;

  const stars = useMemo(
    () => generateStars(60, viewWidth, viewHeight),
    []
  );

  // Far background mountains (silhouette layer)
  const mountainFar =
    "M0,420 L0,280 Q50,270 90,260 Q140,240 180,250 Q230,220 280,210 Q330,190 380,170 Q420,155 450,140 Q480,155 520,170 Q570,190 620,210 Q670,220 720,250 Q760,240 810,260 Q850,270 900,280 L900,420 Z";

  // Mid mountain range
  const mountainMid =
    "M0,420 L0,310 Q40,300 80,290 Q130,265 170,275 Q220,240 270,220 Q320,195 370,175 Q400,155 430,135 Q450,120 470,135 Q500,155 530,175 Q580,195 630,220 Q680,240 730,275 Q770,265 820,290 Q860,300 900,310 L900,420 Z";

  // Front mountain (main)
  const mountainFront =
    "M0,420 L0,340 Q50,330 100,315 Q160,285 210,295 Q270,255 330,230 Q380,200 420,175 Q445,155 470,130 Q490,115 500,130 Q520,155 545,175 Q580,200 620,230 Q680,255 740,295 Q790,285 850,315 Q890,330 900,340 L900,420 Z";

  // Snow/ice cap on main peak
  const snowCaps =
    "M380,200 Q400,180 420,165 Q440,148 460,130 Q475,118 490,115 Q500,118 510,130 Q525,148 540,165 Q555,180 570,200 Q555,195 540,185 Q525,170 510,155 Q500,140 490,140 Q480,140 470,155 Q455,170 440,185 Q425,195 410,200 Z";

  const snowHighlight =
    "M430,175 Q445,160 460,140 Q475,125 490,115 Q500,125 510,140 Q525,160 540,175 Q525,170 510,155 Q500,135 490,135 Q480,155 465,170 Z";

  // Climber position along left slope of front mountain
  const climberX = 130 + climbPercent * 340;
  const climberY = 330 - climbPercent * 215;

  // Trail path from base to climber
  const trailPoints = Array.from({ length: 20 }, (_, i) => {
    const t = (i / 19) * climbPercent;
    const x = 130 + t * 340;
    const y = 330 - t * 215;
    // Add slight waviness
    const wave = Math.sin(t * Math.PI * 4) * 3;
    return `${x},${y + wave}`;
  });
  const trailPath = `M${trailPoints.join(" L")}`;

  const milestones = [
    { pct: 0.12, label: "1M" },
    { pct: 0.30, label: "1B" },
    { pct: 0.50, label: "1T" },
    { pct: 0.70, label: "10T" },
    { pct: 0.90, label: "100T" },
  ];

  return (
    <div className="relative w-full overflow-hidden rounded-radius-lg border border-white/[0.06]">
      {/* SVG Mountain Scene */}
      <svg
        viewBox={`0 0 ${viewWidth} ${viewHeight}`}
        className="w-full h-[280px] md:h-[380px] lg:h-[440px]"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Sky gradient */}
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#04060A" />
            <stop offset="40%" stopColor="#080C14" />
            <stop offset="70%" stopColor="#0B1018" />
            <stop offset="100%" stopColor="#0D1117" />
          </linearGradient>

          {/* Moon glow */}
          <radialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#C9D1D9" stopOpacity="1" />
            <stop offset="30%" stopColor="#8B949E" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#58A6FF" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#58A6FF" stopOpacity="0" />
          </radialGradient>

          {/* Climber glow */}
          <radialGradient id="climberGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F7931A" stopOpacity="0.9" />
            <stop offset="40%" stopColor="#F7931A" stopOpacity="0.3" />
            <stop offset="70%" stopColor="#F7931A" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#F7931A" stopOpacity="0" />
          </radialGradient>

          {/* Mountain gradients */}
          <linearGradient id="mountainFarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0F1520" />
            <stop offset="100%" stopColor="#0B0F16" />
          </linearGradient>
          <linearGradient id="mountainMidGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#151C28" />
            <stop offset="100%" stopColor="#0D1219" />
          </linearGradient>
          <linearGradient id="mountainFrontGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1A2436" />
            <stop offset="50%" stopColor="#151E2E" />
            <stop offset="100%" stopColor="#101822" />
          </linearGradient>

          {/* Atmospheric haze */}
          <linearGradient id="hazeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0D1117" stopOpacity="0" />
            <stop offset="60%" stopColor="#0D1117" stopOpacity="0" />
            <stop offset="100%" stopColor="#0D1117" stopOpacity="0.6" />
          </linearGradient>

          {/* Trail glow filter */}
          <filter id="trailGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Snow shimmer */}
          <linearGradient id="snowGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2A3545" />
            <stop offset="50%" stopColor="#364050" />
            <stop offset="100%" stopColor="#2A3545" />
          </linearGradient>
        </defs>

        {/* Sky */}
        <rect width={viewWidth} height={viewHeight} fill="url(#skyGrad)" />

        {/* Moon */}
        <circle cx={750} cy={70} r={50} fill="url(#moonGlow)" />
        <circle cx={750} cy={70} r={14} fill="#C9D1D9" opacity={0.9} />
        <circle cx={745} cy={65} r={12} fill="#D4DCE6" opacity={0.3} />

        {/* Stars */}
        {stars.map((star, i) => (
          <Star key={i} {...star} />
        ))}

        {/* Far mountains */}
        <path d={mountainFar} fill="url(#mountainFarGrad)" opacity={0.5} />

        {/* Mid mountains */}
        <path d={mountainMid} fill="url(#mountainMidGrad)" opacity={0.75} />

        {/* Ridge highlight on mid mountain */}
        <path
          d="M270,220 Q320,195 370,175 Q400,155 430,135 Q450,120 470,135 Q500,155 530,175 Q580,195 630,220"
          fill="none"
          stroke="#1E2A3A"
          strokeWidth={1}
          opacity={0.6}
        />

        {/* Front mountain */}
        <path d={mountainFront} fill="url(#mountainFrontGrad)" />

        {/* Front mountain ridge highlight */}
        <path
          d="M330,230 Q380,200 420,175 Q445,155 470,130 Q490,115 500,130 Q520,155 545,175 Q580,200 620,230"
          fill="none"
          stroke="#243044"
          strokeWidth={1.5}
          opacity={0.5}
        />

        {/* Snow caps */}
        <path d={snowCaps} fill="url(#snowGrad)" opacity={0.5} />
        <path d={snowHighlight} fill="#3A4858" opacity={0.7} />

        {/* Summit glow */}
        <circle cx={490} cy={115} r={30} fill="#58A6FF" opacity={0.04} />

        {/* Trail from base to climber */}
        <motion.path
          d={trailPath}
          fill="none"
          stroke="#F7931A"
          strokeWidth={1.5}
          strokeDasharray="4 6"
          strokeLinecap="round"
          opacity={0.35}
          filter="url(#trailGlow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, delay: 0.3, ease: "easeOut" }}
        />

        {/* Milestone flags */}
        {milestones.map((m) => {
          const fx = 130 + m.pct * 340;
          const fy = 330 - m.pct * 215;
          return (
            <MilestoneFlag key={m.label} x={fx} y={fy} label={m.label} />
          );
        })}

        {/* Climber outer glow */}
        <motion.circle
          cx={climberX}
          cy={climberY}
          r={24}
          fill="url(#climberGlow)"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Climber ring */}
        <motion.circle
          cx={climberX}
          cy={climberY}
          r={7}
          fill="none"
          stroke="#F7931A"
          strokeWidth={1}
          opacity={0.4}
          initial={{ scale: 0 }}
          animate={{ scale: [1, 1.6, 1] }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.8,
          }}
        />

        {/* Climber dot */}
        <motion.circle
          cx={climberX}
          cy={climberY}
          r={5}
          fill="#F7931A"
          stroke="#0D1117"
          strokeWidth={2}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            delay: 0.5,
            duration: 0.4,
            type: "spring",
            stiffness: 300,
            damping: 20,
          }}
        />
        {/* Climber inner highlight */}
        <circle
          cx={climberX - 1}
          cy={climberY - 1}
          r={2}
          fill="#FFBC57"
          opacity={0.8}
        />

        {/* Atmospheric haze overlay */}
        <rect
          width={viewWidth}
          height={viewHeight}
          fill="url(#hazeGrad)"
          pointerEvents="none"
        />
      </svg>

      {/* Stats overlay */}
      <div
        className={cn(
          "md:absolute md:top-5 md:right-5 md:max-w-[240px] lg:max-w-[260px]",
          "relative mt-0",
          "bg-[#0D1117]/85 backdrop-blur-xl border border-white/[0.08]",
          "rounded-radius-md p-4 md:p-5",
          "shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        )}
      >
        <div className="space-y-3">
          <div>
            <span className="text-micro text-secondary uppercase tracking-wider">
              Your Summit
            </span>
            <Mono
              as="div"
              className="text-display-md md:text-display-lg font-bold text-primary"
            >
              {userBestFormatted}
            </Mono>
          </div>

          <div>
            <span className="text-micro text-secondary uppercase tracking-wider">
              Network Peak
            </span>
            <Mono as="div" className="text-title font-semibold text-secondary">
              {networkFormatted}
            </Mono>
          </div>

          <div className="border-t border-white/6 pt-3 space-y-1.5">
            <p className="text-caption text-secondary">
              You've climbed{" "}
              <Mono className="text-cyan font-medium">{percentText}%</Mono> of
              the way
            </p>
            <p className="text-caption text-secondary">
              That's higher than{" "}
              <Mono className="text-green font-medium">94%</Mono> of all solo
              miners
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Section 2 — Personal Bests Table
   ══════════════════════════════════════════════ */

function PersonalBestsTable() {
  return (
    <Card variant="standard" padding="md">
      <div className="flex items-center gap-2 mb-5">
        <Trophy size={20} weight="bold" className="text-gold" />
        <h3 className="text-headline font-semibold text-primary">
          Personal Bests
        </h3>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/6">
              <th className="pb-3 text-micro text-secondary uppercase tracking-wider font-medium">
                Period
              </th>
              <th className="pb-3 text-micro text-secondary uppercase tracking-wider font-medium">
                Best Difficulty
              </th>
              <th className="pb-3 text-micro text-secondary uppercase tracking-wider font-medium">
                Date Found
              </th>
              <th className="pb-3 text-micro text-secondary uppercase tracking-wider font-medium text-right">
                Global Rank
              </th>
            </tr>
          </thead>
          <tbody>
            {mockPersonalBests.map((pb) => (
              <motion.tr
                key={pb.period}
                className={cn(
                  "border-b border-white/4 cursor-pointer transition-colors",
                  "hover:bg-white/[0.02]"
                )}
                variants={staggerItem}
              >
                <td className="py-3.5 text-body text-primary font-medium">
                  {pb.period}
                </td>
                <td className="py-3.5">
                  <Mono className="text-body text-cyan font-medium">
                    {formatNumber(pb.difficulty)}
                  </Mono>
                  <span className="text-caption text-secondary ml-1.5">
                    ({formatDifficulty(pb.difficulty)})
                  </span>
                </td>
                <td className="py-3.5 text-body text-secondary">
                  {pb.date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td className="py-3.5 text-right">
                  <Mono className="text-body text-gold font-semibold">
                    #{pb.rank}
                  </Mono>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-3">
        {mockPersonalBests.map((pb) => (
          <div
            key={pb.period}
            className={cn(
              "bg-elevated rounded-radius-md p-3.5 cursor-pointer",
              "border border-white/4 hover:border-white/8 transition-colors"
            )}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-body font-medium text-primary">
                {pb.period}
              </span>
              <Mono className="text-caption text-gold font-semibold">
                #{pb.rank}
              </Mono>
            </div>
            <Mono className="text-body-lg text-cyan font-medium">
              {formatNumber(pb.difficulty)}
            </Mono>
            <p className="text-caption text-secondary mt-1">
              {pb.date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   Section 3 — Difficulty History Scatter Chart
   ══════════════════════════════════════════════ */

/** Custom tooltip for scatter chart */
function ScatterTooltipContent({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-floating border border-white/8 rounded-radius-sm p-3 shadow-heavy">
      <p className="text-caption text-secondary mb-1">
        {new Date(data.time).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <Mono className="text-body font-medium text-primary">
        {formatNumber(data.difficulty)}
      </Mono>
      <span className="text-caption text-secondary ml-1.5">
        ({formatDifficulty(data.difficulty)})
      </span>
      {data.isBest && (
        <p className="text-caption text-bitcoin font-medium mt-1">
          Personal Best
        </p>
      )}
    </div>
  );
}

function DifficultyScatterChart() {
  const [scaleType, setScaleType] = useState<"log" | "linear">("log");

  const bestShares = useMemo(
    () => mockDifficultyScatter.filter((d) => d.isBest),
    []
  );
  const normalShares = useMemo(
    () => mockDifficultyScatter.filter((d) => !d.isBest),
    []
  );

  return (
    <Card variant="standard" padding="md">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <ChartLineUp size={20} weight="bold" className="text-cyan" />
          <h3 className="text-headline font-semibold text-primary">
            Difficulty History
          </h3>
        </div>
        <div className="flex items-center gap-1 bg-elevated rounded-radius-sm p-0.5 border border-white/6">
          <button
            onClick={() => setScaleType("log")}
            className={cn(
              "px-3 py-1.5 text-caption font-medium rounded-radius-sm transition-colors",
              scaleType === "log"
                ? "bg-surface text-primary shadow-subtle"
                : "text-secondary hover:text-primary"
            )}
          >
            Log
          </button>
          <button
            onClick={() => setScaleType("linear")}
            className={cn(
              "px-3 py-1.5 text-caption font-medium rounded-radius-sm transition-colors",
              scaleType === "linear"
                ? "bg-surface text-primary shadow-subtle"
                : "text-secondary hover:text-primary"
            )}
          >
            Linear
          </button>
        </div>
      </div>

      <div className="w-full h-[280px] md:h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(48, 54, 61, 0.5)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(ts: number) =>
                new Date(ts).toLocaleTimeString("en-US", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              }
              stroke="#30363D"
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={{ stroke: "#30363D" }}
              tickLine={{ stroke: "#30363D" }}
              name="Time"
            />
            <YAxis
              dataKey="difficulty"
              type="number"
              scale={scaleType}
              domain={
                scaleType === "log"
                  ? [
                      (dataMin: number) => Math.max(1, dataMin * 0.5),
                      (dataMax: number) => dataMax * 2,
                    ]
                  : ["auto", "auto"]
              }
              tickFormatter={(val: number) => formatDifficulty(val)}
              stroke="#30363D"
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={{ stroke: "#30363D" }}
              tickLine={{ stroke: "#30363D" }}
              width={52}
            />
            <RechartsTooltip
              content={<ScatterTooltipContent />}
              cursor={false}
            />
            {/* Normal shares */}
            <Scatter
              data={normalShares}
              fill="#58A6FF"
              fillOpacity={0.35}
              r={3}
              name="Shares"
            />
            {/* Best shares */}
            <Scatter
              data={bestShares}
              fill="#F7931A"
              fillOpacity={1}
              r={6}
              name="Best"
              shape={(props: any) => {
                const { cx, cy } = props;
                return (
                  <g>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={8}
                      fill="rgba(247,147,26,0.25)"
                    />
                    <circle cx={cx} cy={cy} r={5} fill="#F7931A" />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill="#FFBC57"
                    />
                  </g>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 pt-3 border-t border-white/4">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan/40" />
          <span className="text-caption text-secondary">Shares</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-bitcoin" />
          <span className="text-caption text-secondary">Personal Best</span>
        </div>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   Section 4 — Difficulty Distribution Histogram
   ══════════════════════════════════════════════ */

/** Custom tooltip for bar chart */
function BarTooltipContent({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-floating border border-white/8 rounded-radius-sm p-3 shadow-heavy">
      <p className="text-caption text-secondary mb-1">
        Range: {data.range}
      </p>
      <Mono className="text-body font-medium text-primary">
        {formatNumber(data.count)}
      </Mono>
      <span className="text-caption text-secondary ml-1"> shares</span>
    </div>
  );
}

function DifficultyDistributionChart() {
  // The user's best (~4.2B) falls in the "1B-10B" bucket
  const userBestBucket = "1B-10B";

  return (
    <Card variant="standard" padding="md">
      <div className="flex items-center gap-2 mb-5">
        <ChartBar size={20} weight="bold" className="text-purple" />
        <h3 className="text-headline font-semibold text-primary">
          Difficulty Distribution
        </h3>
      </div>

      <div className="w-full h-[260px] md:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={mockDifficultyDistribution}
            margin={{ top: 10, right: 10, bottom: 20, left: 10 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(48, 54, 61, 0.5)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              stroke="#30363D"
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={{ stroke: "#30363D" }}
              tickLine={{ stroke: "#30363D" }}
            />
            <YAxis
              tickFormatter={(val: number) =>
                val >= 1000 ? `${(val / 1000).toFixed(0)}K` : `${val}`
              }
              stroke="#30363D"
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={{ stroke: "#30363D" }}
              tickLine={{ stroke: "#30363D" }}
              width={44}
            />
            <RechartsTooltip
              content={<BarTooltipContent />}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            <defs>
              <linearGradient
                id="barGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#F7931A" stopOpacity={0.85} />
                <stop offset="100%" stopColor="#F7931A" stopOpacity={0.35} />
              </linearGradient>
              <linearGradient
                id="barGradientGold"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#D4A843" stopOpacity={1} />
                <stop offset="100%" stopColor="#D4A843" stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {mockDifficultyDistribution.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={
                    entry.range === userBestBucket
                      ? "url(#barGradientGold)"
                      : "url(#barGradient)"
                  }
                  stroke={
                    entry.range === userBestBucket
                      ? "#D4A843"
                      : "transparent"
                  }
                  strokeWidth={entry.range === userBestBucket ? 1.5 : 0}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend / callout */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/4">
        <CaretUp size={14} weight="bold" className="text-gold" />
        <span className="text-caption text-secondary">
          Your best difficulty falls in the{" "}
          <Mono className="text-gold font-medium">{userBestBucket}</Mono>{" "}
          bucket
        </span>
      </div>
    </Card>
  );
}

/* ══════════════════════════════════════════════
   Page Component
   ══════════════════════════════════════════════ */

export default function DifficultyPage() {
  return (
    <motion.div
      className="space-y-6 md:space-y-8 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Page Header */}
      <motion.div variants={staggerItem}>
        <div className="flex items-center gap-3 mb-1">
          <Mountains size={28} weight="bold" className="text-cyan" />
          <h1 className="text-display-md md:text-display-lg font-bold text-primary">
            Difficulty Tracker
          </h1>
        </div>
        <p className="text-body text-secondary">
          Track your mining difficulty achievements and climb the mountain
        </p>
      </motion.div>

      {/* Section 1: Mountain Visualization */}
      <motion.div variants={staggerItem}>
        <MountainVisualization />
      </motion.div>

      {/* Section 2: Personal Bests Table */}
      <motion.div variants={staggerItem}>
        <PersonalBestsTable />
      </motion.div>

      {/* Section 3: Difficulty Scatter Chart */}
      <motion.div variants={staggerItem}>
        <DifficultyScatterChart />
      </motion.div>

      {/* Section 4: Difficulty Distribution Histogram */}
      <motion.div variants={staggerItem}>
        <DifficultyDistributionChart />
      </motion.div>
    </motion.div>
  );
}
