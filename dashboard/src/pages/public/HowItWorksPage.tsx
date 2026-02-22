import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Cpu,
  GameController,
  Globe,
  Lightning,
  CurrencyBtc,
  Trophy,
  Hammer,
  Horse,
  Cards,
  Star,
  Fire,
  Shield,
  Users,
  ChartLineUp,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { easings } from "@/lib/animation";

/* ══════════════════════════════════════════════════════
   HELPERS
   ══════════════════════════════════════════════════════ */

function useCountUp(end: number, duration = 2000, startWhen = true) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!startWhen) return;
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
  }, [end, duration, startWhen]);
  return count;
}

/* ══════════════════════════════════════════════════════
   SCROLL SECTION — fade + slide in on viewport entry
   ══════════════════════════════════════════════════════ */

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

/* ══════════════════════════════════════════════════════
   STEP BADGE — the little "Step N" pill
   ══════════════════════════════════════════════════════ */

function StepBadge({ step }: { step: number }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-radius-full bg-gradient-to-r from-cyan/15 to-cyan/5 border border-cyan/20 text-cyan text-micro font-semibold tracking-wider uppercase mb-5">
      <span
        className="w-5 h-5 rounded-full bg-cyan/20 flex items-center justify-center text-[10px] font-bold"
      >
        {step}
      </span>
      Step {step}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   FLOATING PARTICLES — ambient background sparkle
   ══════════════════════════════════════════════════════ */

function FloatingParticles({ count = 30, color = "cyan" }: { count?: number; color?: string }) {
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
        const delay = Math.random() * 5;

        return (
          <motion.div
            key={i}
            className={cn("absolute rounded-full", colorMap[color] || colorMap.cyan)}
            style={{
              width: size,
              height: size,
              left: `${x}%`,
              top: `${y}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: dur,
              delay,
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
   HASH STREAM — cinematic hash visualization
   ══════════════════════════════════════════════════════ */

function HashStream() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const hexChars = "0123456789abcdef";
  const [hashes, setHashes] = useState<string[]>([]);

  useEffect(() => {
    if (!isInView || prefersReduced) return;
    const id = setInterval(() => {
      const hash = Array.from({ length: 64 }, () =>
        hexChars[Math.floor(Math.random() * 16)]
      ).join("");
      setHashes((prev) => [hash, ...prev].slice(0, 8));
    }, 600);
    return () => clearInterval(id);
  }, [isInView, prefersReduced]);

  if (prefersReduced) {
    return (
      <div ref={ref} className="w-full aspect-[4/3] bg-elevated/50 rounded-2xl flex items-center justify-center border border-white/5">
        <div className="text-center">
          <Cpu size={48} className="text-cyan mx-auto mb-3" />
          <p className="text-caption text-secondary">Millions of hashes per second</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="relative w-full aspect-[4/3] bg-gradient-to-br from-[#0a0f1a] to-[#0d1117] rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl"
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Glow source */}
      <div className="absolute top-1/2 left-8 -translate-y-1/2 w-16 h-16">
        <motion.div
          className="absolute inset-0 rounded-full bg-cyan/20 blur-xl"
          animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative z-10 w-full h-full rounded-xl bg-gradient-to-br from-cyan/20 to-transparent border border-cyan/20 flex items-center justify-center backdrop-blur-sm">
          <Cpu size={28} weight="duotone" className="text-cyan" />
        </div>
      </div>

      {/* Hash stream */}
      <div className="absolute inset-y-0 left-28 right-4 flex flex-col justify-center gap-1 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {hashes.map((hash, i) => (
            <motion.div
              key={hash + i}
              initial={{ opacity: 0, x: -40, filter: "blur(4px)" }}
              animate={{
                opacity: i === 0 ? 1 : 0.3 - i * 0.03,
                x: 0,
                filter: "blur(0px)",
              }}
              exit={{ opacity: 0, x: 40, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="font-mono text-[10px] sm:text-xs tracking-wider truncate"
            >
              <span className={i === 0 ? "text-cyan" : "text-white/20"}>
                {hash.slice(0, 8)}
              </span>
              <span className={i === 0 ? "text-white/60" : "text-white/10"}>
                {hash.slice(8)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* "Target" wall */}
      <div className="absolute right-0 top-0 bottom-0 w-[2px]">
        <motion.div
          className="w-full h-full bg-gradient-to-b from-transparent via-bitcoin/60 to-transparent"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Corner label */}
      <div className="absolute top-3 right-3 px-2 py-1 rounded-md bg-white/5 border border-white/5">
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
          Live Hashing
        </span>
      </div>

      <FloatingParticles count={15} color="cyan" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   DIFFICULTY METER — animated gauge
   ══════════════════════════════════════════════════════ */

function DifficultyMeter() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const count = useCountUp(4_231_847_293, 2500, isInView);

  const milestones = [
    { label: "1K", pos: 15 },
    { label: "1M", pos: 35 },
    { label: "1B", pos: 58 },
    { label: "1T", pos: 80 },
    { label: "BLOCK", pos: 100 },
  ];

  return (
    <div
      ref={ref}
      className="relative w-full aspect-[4/3] bg-gradient-to-br from-[#0a0f1a] to-[#0d1117] rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl flex flex-col items-center justify-center p-8"
    >
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-cyan/[0.04] rounded-full blur-3xl" />

      <p className="text-[11px] text-white/30 uppercase tracking-[0.2em] font-semibold mb-6 relative z-10">
        Weekly Best Difficulty
      </p>

      {/* Meter track */}
      <div className="w-full max-w-sm relative z-10">
        <div className="w-full h-3 bg-white/[0.04] rounded-full overflow-hidden relative border border-white/[0.06]">
          <motion.div
            className="h-full rounded-full relative"
            style={{
              background: "linear-gradient(90deg, #06b6d4 0%, #22d3ee 40%, #F7931A 100%)",
            }}
            initial={{ width: "0%" }}
            animate={isInView ? { width: "68%" } : {}}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: 2.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }
            }
          >
            {/* Shimmer */}
            {!prefersReduced && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 2, delay: 2.8, repeat: Infinity, repeatDelay: 4 }}
              />
            )}
          </motion.div>
        </div>

        {/* Milestone markers */}
        <div className="relative w-full h-6 mt-2">
          {milestones.map((m, i) => (
            <motion.div
              key={m.label}
              className="absolute -translate-x-1/2 flex flex-col items-center"
              style={{ left: `${m.pos}%` }}
              initial={prefersReduced ? {} : { opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.5 + i * 0.2 }}
            >
              <div className="w-px h-2 bg-white/10" />
              <span
                className={cn(
                  "text-[9px] font-mono tracking-wider mt-0.5",
                  m.label === "BLOCK" ? "text-bitcoin/50" : "text-white/20"
                )}
              >
                {m.label}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Counter */}
      <motion.div
        className="mt-6 text-center relative z-10"
        initial={prefersReduced ? {} : { opacity: 0, y: 10 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ delay: 1.2, duration: 0.6 }}
      >
        <p className="text-3xl sm:text-4xl font-bold font-mono tabular-nums text-white tracking-tight">
          {count.toLocaleString()}
        </p>
        <p className="text-[11px] text-white/30 mt-1 font-medium">
          That's higher than <span className="text-cyan">94%</span> of all solo miners
        </p>
      </motion.div>

      <FloatingParticles count={10} color="white" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   GAME CAROUSEL — the four lottery games
   ══════════════════════════════════════════════════════ */

function GameCarousel() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [active, setActive] = useState(0);

  const games = [
    {
      icon: <Hammer size={32} weight="duotone" />,
      label: "Hammer",
      color: "from-bitcoin/20 to-orange-900/20",
      border: "border-bitcoin/20",
      text: "text-bitcoin",
      glow: "bg-bitcoin/10",
      desc: "Swing the hammer. Watch the puck fly.",
    },
    {
      icon: <Horse size={32} weight="duotone" />,
      label: "Horse Race",
      color: "from-green-500/20 to-emerald-900/20",
      border: "border-green-500/20",
      text: "text-green-400",
      glow: "bg-green-500/10",
      desc: "Seven days race. Which was your best?",
    },
    {
      icon: <GameController size={32} weight="duotone" />,
      label: "Slots",
      color: "from-purple-500/20 to-purple-900/20",
      border: "border-purple-500/20",
      text: "text-purple-400",
      glow: "bg-purple-500/10",
      desc: "Hex reels spin. Matches mean big scores.",
    },
    {
      icon: <Cards size={32} weight="duotone" />,
      label: "Scratch Card",
      color: "from-cyan/20 to-cyan-900/20",
      border: "border-cyan/20",
      text: "text-cyan",
      glow: "bg-cyan/10",
      desc: "Scratch to reveal your weekly result.",
    },
  ];

  useEffect(() => {
    if (!isInView || prefersReduced) return;
    const id = setInterval(() => setActive((p) => (p + 1) % games.length), 3000);
    return () => clearInterval(id);
  }, [isInView, prefersReduced, games.length]);

  return (
    <div
      ref={ref}
      className="relative w-full aspect-[4/3] bg-gradient-to-br from-[#0a0f1a] to-[#0d1117] rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl flex flex-col items-center justify-center p-6"
    >
      {/* Active game showcase */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, scale: 0.9, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-6"
        >
          <div
            className={cn(
              "inline-flex w-20 h-20 rounded-2xl items-center justify-center mb-3 border bg-gradient-to-br",
              games[active].color,
              games[active].border,
              games[active].text
            )}
          >
            {games[active].icon}
          </div>
          <p className="text-caption text-white/40 max-w-[200px] mx-auto">
            {games[active].desc}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Selector dots */}
      <div className="flex items-center gap-3">
        {games.map((game, i) => (
          <button
            key={game.label}
            onClick={() => setActive(i)}
            className={cn(
              "relative w-12 h-12 rounded-xl border flex items-center justify-center transition-all duration-300",
              i === active
                ? cn("bg-gradient-to-br", game.color, game.border, game.text, "scale-110")
                : "bg-white/[0.02] border-white/[0.06] text-white/20 hover:text-white/40 hover:border-white/10"
            )}
          >
            {React.cloneElement(game.icon as React.ReactElement, { size: 18 })}
            {i === active && !prefersReduced && (
              <motion.div
                layoutId="game-indicator"
                className={cn("absolute -bottom-1.5 w-1 h-1 rounded-full", game.glow)}
                style={{ background: "currentColor" }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Corner label */}
      <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-white/5 border border-white/5">
        <span className="text-[10px] font-mono text-white/30 uppercase tracking-wider">
          Sunday Night
        </span>
      </div>

      <FloatingParticles count={12} color="bitcoin" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   COMPETE VISUALIZATION — World leaderboard
   ══════════════════════════════════════════════════════ */

function CompeteVisualization() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const entries = [
    { rank: 1, flag: "🇯🇵", name: "SatoshiHunter42", diff: "12.8T", medal: "🥇" },
    { rank: 2, flag: "🇺🇸", name: "BlockChaser99", diff: "9.4T", medal: "🥈" },
    { rank: 3, flag: "🇳🇴", name: "MiningViking", diff: "7.1T", medal: "🥉" },
    { rank: 4, flag: "🇧🇷", name: "CryptoRio", diff: "5.2T", medal: "" },
    { rank: 5, flag: "🇵🇹", name: "You", diff: "—", highlight: true },
  ];

  return (
    <div
      ref={ref}
      className="relative w-full aspect-[4/3] bg-gradient-to-br from-[#0a0f1a] to-[#0d1117] rounded-2xl overflow-hidden border border-white/[0.06] shadow-2xl flex flex-col justify-center p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Globe size={16} weight="duotone" className="text-cyan" />
        <span className="text-[11px] text-white/30 uppercase tracking-[0.15em] font-semibold">
          Global Leaderboard — This Week
        </span>
      </div>

      {/* Entries */}
      <div className="space-y-1.5">
        {entries.map((entry, i) => (
          <motion.div
            key={entry.rank}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all",
              entry.highlight
                ? "bg-bitcoin/10 border border-bitcoin/20 shadow-lg shadow-bitcoin/5"
                : "bg-white/[0.02] border border-transparent hover:bg-white/[0.04]"
            )}
            initial={prefersReduced ? {} : { opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <span
              className={cn(
                "text-xs font-bold font-mono w-6 tabular-nums",
                entry.rank <= 3 ? "text-white/60" : "text-white/20"
              )}
            >
              {entry.medal || `#${entry.rank}`}
            </span>
            <span className="text-base">{entry.flag}</span>
            <span
              className={cn(
                "text-[13px] font-medium flex-1",
                entry.highlight ? "text-bitcoin font-semibold" : "text-white/70"
              )}
            >
              {entry.name}
            </span>
            <span className="text-[11px] font-mono text-white/30 tabular-nums">
              {entry.diff}
            </span>
          </motion.div>
        ))}
      </div>

      <FloatingParticles count={8} color="white" />
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   BLOCK DREAM — the big BTC reward moment
   ══════════════════════════════════════════════════════ */

function BlockDreamAnimation() {
  const prefersReduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <div ref={ref} className="relative py-12">
      {/* Radial glow */}
      {!prefersReduced && isInView && (
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(247,147,26,0.12) 0%, transparent 70%)",
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
        />
      )}

      <div className="relative z-10 text-center">
        {/* Bitcoin icon */}
        <motion.div
          initial={prefersReduced ? {} : { scale: 0, rotate: -180 }}
          animate={isInView ? { scale: 1, rotate: 0 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-6 relative"
        >
          <div className="absolute inset-0 rounded-full bg-bitcoin/20 border border-bitcoin/30" />
          {!prefersReduced && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-bitcoin/30"
              animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <CurrencyBtc size={44} weight="fill" className="text-bitcoin relative z-10" />
        </motion.div>

        {/* Amount */}
        <motion.p
          className="text-5xl sm:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-bitcoin via-yellow-400 to-bitcoin font-mono tabular-nums"
          initial={prefersReduced ? {} : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          3.125 BTC
        </motion.p>

        <motion.p
          className="text-xl text-white/40 mt-2 font-mono"
          initial={prefersReduced ? {} : { opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.7, duration: 0.5 }}
        >
          ≈ $312,500
        </motion.p>

        {/* Ring particles */}
        {!prefersReduced && isInView && (
          <>
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const radius = 70;
              return (
                <motion.div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-bitcoin/50"
                  style={{
                    left: "50%",
                    top: "28%",
                  }}
                  initial={{ x: 0, y: 0, opacity: 0 }}
                  animate={{
                    x: Math.cos(angle) * radius,
                    y: Math.sin(angle) * radius,
                    opacity: [0, 0.8, 0],
                  }}
                  transition={{ duration: 1.5, delay: 0.5 + i * 0.05, ease: "easeOut" }}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   FEATURE PILL — compact highlight
   ══════════════════════════════════════════════════════ */

function FeaturePill({
  icon,
  label,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  delay?: number;
}) {
  const prefersReduced = useReducedMotion();
  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.06] hover:border-white/10 transition-colors"
    >
      <span className="text-cyan">{icon}</span>
      <span className="text-[13px] text-white/60 font-medium">{label}</span>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   STEP CARD — for the "how to start" section
   ══════════════════════════════════════════════════════ */

function StepCard({
  step,
  title,
  description,
  icon,
  cta,
  href,
  delay = 0,
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  cta: string;
  href: string;
  delay?: number;
}) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="group relative bg-gradient-to-b from-white/[0.03] to-transparent border border-white/[0.06] rounded-2xl p-7 text-center hover:border-white/10 transition-all duration-500"
    >
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-cyan/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative z-10">
        {/* Step number */}
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] mb-5">
          <span className="text-sm font-bold text-white/40 font-mono">{step}</span>
        </div>

        {/* Icon */}
        <div className="mb-5">{icon}</div>

        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-[13px] text-white/40 leading-relaxed mb-5">{description}</p>

        <Link to={href}>
          <Button
            variant="ghost"
            size="sm"
            rightIcon={<ArrowRight size={14} />}
            className="text-cyan/70 hover:text-cyan"
          >
            {cta}
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
   ══════════════════════════════════════════════════════ */

export default function HowItWorksPage() {
  const prefersReduced = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 1], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  return (
    <div className="min-h-screen bg-canvas overflow-hidden">
      {/* ─── HERO SECTION ─── */}
      <section
        ref={heroRef}
        className="relative min-h-[90vh] flex flex-col items-center justify-center text-center px-6"
      >
        {/* Background effects */}
        <div className="absolute inset-0">
          {/* Top gradient glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px]"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(6,182,212,0.06) 0%, transparent 70%)",
            }}
          />
          {/* Grid */}
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />
          <FloatingParticles count={25} color="cyan" />
        </div>

        <motion.div
          style={prefersReduced ? {} : { opacity: heroOpacity, scale: heroScale, y: heroY }}
          className="relative z-10 max-w-3xl"
        >
          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] mb-8"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-cyan animate-pulse" />
            <span className="text-[11px] text-white/40 uppercase tracking-[0.2em] font-semibold">
              The Bitcoin Game
            </span>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            How Does Mining
            <br />
            Become a{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan via-cyan to-bitcoin">
              Game
            </span>
            ?
          </motion.h1>

          <motion.p
            className="text-lg sm:text-xl text-white/40 mt-6 max-w-lg mx-auto leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            In 60 seconds, you'll understand everything.
          </motion.p>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-10 z-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.5 }}
        >
          <motion.div
            animate={prefersReduced ? {} : { y: [0, 8, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            className="flex flex-col items-center gap-2"
          >
            <span className="text-[11px] text-white/20 uppercase tracking-[0.15em]">
              Scroll to begin
            </span>
            <ArrowDown size={16} weight="bold" className="text-white/20" />
          </motion.div>
        </motion.div>
      </section>

      {/* ─── STEPS SECTION ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-20 md:py-32 space-y-28 md:space-y-40">
        {/* Vertical timeline line */}
        <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />

        {/* Step 1: Your Miner Searches */}
        <ScrollSection>
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div className="order-2 md:order-1">
              <HashStream />
            </div>
            <div className="order-1 md:order-2">
              <StepBadge step={1} />
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-5">
                Your Miner Searches for a
                <span className="text-cyan"> Needle in a Haystack</span>
              </h2>
              <p className="text-base text-white/40 leading-relaxed mb-6">
                Your Bitaxe generates millions of random numbers every second, each one a guess
                at the winning hash. Think of it as rolling a die — but with a trillion sides.
                Every roll contributes to Bitcoin's security.
              </p>
              <div className="flex flex-wrap gap-2">
                <FeaturePill icon={<Cpu size={14} />} label="500 GH/s per Bitaxe" />
                <FeaturePill icon={<Shield size={14} />} label="Securing the network" delay={0.1} />
              </div>
            </div>
          </div>
        </ScrollSection>

        {/* Step 2: Every Attempt is Tracked */}
        <ScrollSection>
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div>
              <StepBadge step={2} />
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-5">
                Every Attempt is
                <span className="text-cyan"> Tracked</span>
              </h2>
              <p className="text-base text-white/40 leading-relaxed mb-6">
                Each hash gets a difficulty score — the higher the number, the closer you came to
                finding a block. We save your best score every week and track your progress over time.
              </p>
              <div className="flex flex-wrap gap-2">
                <FeaturePill icon={<ChartLineUp size={14} />} label="Personal bests" />
                <FeaturePill icon={<Star size={14} />} label="Global percentile" delay={0.1} />
              </div>
            </div>
            <div>
              <DifficultyMeter />
            </div>
          </div>
        </ScrollSection>

        {/* Step 3: Sunday Night = Lottery Night */}
        <ScrollSection>
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div className="order-2 md:order-1">
              <GameCarousel />
            </div>
            <div className="order-1 md:order-2">
              <StepBadge step={3} />
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-5">
                Sunday Night ={" "}
                <span className="text-bitcoin">Lottery Night</span>
              </h2>
              <p className="text-base text-white/40 leading-relaxed mb-6">
                Every Sunday, your best score becomes a lottery ticket. Pick your game —
                swing a hammer, race horses, spin slots, or scratch a card — and watch
                the results unfold in a cinematic experience.
              </p>
              <div className="flex flex-wrap gap-2">
                <FeaturePill icon={<GameController size={14} />} label="4 unique games" />
                <FeaturePill icon={<Lightning size={14} />} label="Real mining data" delay={0.1} />
              </div>
            </div>
          </div>
        </ScrollSection>

        {/* Step 4: Compete with the World */}
        <ScrollSection>
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <div>
              <StepBadge step={4} />
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight mb-5">
                Compete with{" "}
                <span className="text-cyan">the World</span>
              </h2>
              <p className="text-base text-white/40 leading-relaxed mb-6">
                Join the Solo Mining World Cup. Your country vs. the world. Climb leaderboards.
                Earn badges. Build streaks. Form cooperatives. Mining has never been this fun.
              </p>
              <div className="flex flex-wrap gap-2">
                <FeaturePill icon={<Trophy size={14} />} label="World Cup" />
                <FeaturePill icon={<Users size={14} />} label="Cooperatives" delay={0.1} />
                <FeaturePill icon={<Fire size={14} />} label="Streaks" delay={0.2} />
              </div>
            </div>
            <div>
              <CompeteVisualization />
            </div>
          </div>
        </ScrollSection>
      </section>

      {/* ─── BLOCK DREAM SECTION ─── */}
      <section className="relative py-20 md:py-28">
        {/* Divider glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.01] to-transparent" />

        <ScrollSection className="relative max-w-[800px] mx-auto px-6 text-center">
          <motion.p
            className="text-[11px] text-white/20 uppercase tracking-[0.2em] font-semibold mb-4"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            The Dream
          </motion.p>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
            And If You Actually
            <br />
            Find a Block...
          </h2>

          <BlockDreamAnimation />

          <motion.p
            className="text-base text-white/40 mt-6 max-w-md mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 1 }}
          >
            It's rare. It's random. But someone has to win.{" "}
            <span className="text-bitcoin font-semibold">47 solo miners already have.</span>
          </motion.p>

          <motion.div
            className="mt-10"
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 1.2 }}
          >
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
          </motion.div>
        </ScrollSection>
      </section>

      {/* ─── HOW TO START SECTION ─── */}
      <section className="relative max-w-[1200px] mx-auto px-6 py-20 md:py-28">
        <ScrollSection>
          <div className="text-center mb-14">
            <p className="text-[11px] text-white/20 uppercase tracking-[0.2em] font-semibold mb-4">
              Getting Started
            </p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white">
              Three Steps. Five Minutes.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            <StepCard
              step={1}
              title="Get a Miner"
              description="A Bitaxe, Antminer, or any SHA-256 miner. Small, quiet, and ready to mine."
              icon={<Cpu size={36} weight="duotone" className="text-cyan" />}
              cta="Shop Miners"
              href="/shop"
              delay={0}
            />
            <StepCard
              step={2}
              title="Point It at Us"
              description="Configure your stratum URL to our pool. Copy, paste, done — takes 2 minutes."
              icon={<Globe size={36} weight="duotone" className="text-cyan" />}
              cta="Setup Guide"
              href="/mining/setup"
              delay={0.1}
            />
            <StepCard
              step={3}
              title="Start Playing"
              description="Watch your dashboard light up. Earn XP. Compete worldwide. Mining is now a game."
              icon={<GameController size={36} weight="duotone" className="text-cyan" />}
              cta="Sign Up"
              href="/connect"
              delay={0.2}
            />
          </div>
        </ScrollSection>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="relative py-20 md:py-28 px-6">
        <div className="absolute inset-0">
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px]"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(247,147,26,0.05) 0%, transparent 70%)",
            }}
          />
        </div>

        <ScrollSection className="relative max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight mb-6">
            Mining Bitcoin is a game.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-bitcoin to-yellow-400">
              Start playing.
            </span>
          </h2>
          <p className="text-base text-white/40 mb-10 max-w-md mx-auto">
            Join thousands of solo miners who turned their Bitaxe into the most
            exciting lottery on Earth.
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
                Learn More
              </Button>
            </Link>
          </div>
        </ScrollSection>
      </section>
    </div>
  );
}