import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { GameController } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { durations, springs } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  mockDashboardStats,
  formatDifficulty,
  formatNumber,
} from "@/mocks/data";

/* ── Log scale markers ── */
const SCALE_MARKERS = [
  { value: 1e3, label: "1K" },
  { value: 1e6, label: "1M" },
  { value: 1e9, label: "1B" },
  { value: 1e12, label: "1T" },
  { value: 1e13, label: "10T" },
  { value: 1e14, label: "100T" },
];

const LOG_MIN = Math.log10(SCALE_MARKERS[0].value);
const LOG_MAX = Math.log10(SCALE_MARKERS[SCALE_MARKERS.length - 1].value);

function toLogPercent(value: number): number {
  if (value <= SCALE_MARKERS[0].value) return 0;
  if (value >= SCALE_MARKERS[SCALE_MARKERS.length - 1].value) return 100;
  const logVal = Math.log10(value);
  return ((logVal - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
}

/* ── Animated Particle ── */
function Particle({
  fillPercent,
  index,
  total,
}: {
  fillPercent: number;
  index: number;
  total: number;
}) {
  const delay = (index / total) * 3;
  const duration = 2 + Math.random() * 1.5;
  const yOffset = -6 + Math.random() * 12;
  const size = 2 + Math.random() * 3;
  const opacity = 0.3 + Math.random() * 0.5;

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        top: `calc(50% + ${yOffset}px)`,
        background:
          "radial-gradient(circle, rgba(247,147,26,0.9) 0%, rgba(247,147,26,0) 70%)",
        boxShadow: "0 0 4px rgba(247,147,26,0.6)",
      }}
      initial={{ left: "0%", opacity: 0 }}
      animate={{
        left: [`0%`, `${fillPercent}%`],
        opacity: [0, opacity, opacity, 0],
      }}
      transition={{
        duration,
        delay,
        repeat: Infinity,
        ease: "linear",
      }}
    />
  );
}

export function DifficultyMeter() {
  const prefersReduced = useReducedMotion();

  const { bestDiffWeek, networkDiff } = mockDashboardStats;
  const fillPercent = toLogPercent(bestDiffWeek);
  const ratio = bestDiffWeek / networkDiff;
  const percentageText = ratio < 0.0001
    ? `${(ratio * 100).toFixed(6)}%`
    : `${(ratio * 100).toFixed(4)}%`;

  /* Spring-animated fill width */
  const fillMotion = useMotionValue(0);
  const fillSpring = useSpring(fillMotion, {
    stiffness: springs.meter.stiffness,
    damping: springs.meter.damping,
    restDelta: 0.01,
  });
  const fillWidth = useTransform(fillSpring, (v) => `${v}%`);

  useEffect(() => {
    fillMotion.set(fillPercent);
  }, [fillPercent, fillMotion]);

  const particleCount = prefersReduced ? 0 : 8;

  return (
    <Card variant="glass" padding="lg" className="relative overflow-hidden">
      {/* Subtle radial bg glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 30% 50%, rgba(247,147,26,0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-headline font-semibold text-primary">
              Difficulty Meter
            </h2>
            <p className="text-caption text-secondary mt-1">
              Your best difficulty vs network target
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            leftIcon={<GameController size={18} weight="bold" />}
          >
            Play Game
          </Button>
        </div>

        {/* Bar container */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(fillPercent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Mining difficulty meter"
          className="relative h-12 rounded-full bg-elevated border border-white/4 overflow-hidden"
        >
          {/* Gradient fill */}
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: fillWidth,
              background:
                "linear-gradient(90deg, rgba(247,147,26,0.15) 0%, rgba(247,147,26,0.4) 40%, rgba(247,147,26,0.8) 80%, #F7931A 100%)",
            }}
          />

          {/* Particles */}
          {Array.from({ length: particleCount }).map((_, i) => (
            <Particle
              key={i}
              fillPercent={fillPercent}
              index={i}
              total={particleCount}
            />
          ))}

          {/* User position marker */}
          <motion.div
            className="absolute top-0 bottom-0 w-0.5"
            style={{ left: fillWidth }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: durations.medium }}
          >
            {/* Vertical line */}
            <div className="absolute inset-y-0 w-0.5 bg-bitcoin" />
            {/* Pulsing glow */}
            <motion.div
              className="absolute -top-1 -bottom-1 -left-2 w-5"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(247,147,26,0.5) 0%, transparent 70%)",
              }}
              animate={
                prefersReduced
                  ? {}
                  : { opacity: [0.5, 1, 0.5] }
              }
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </motion.div>
        </div>

        {/* Scale markers */}
        <div className="relative h-8 mt-1">
          {SCALE_MARKERS.map((marker) => {
            const pos = toLogPercent(marker.value);
            return (
              <div
                key={marker.label}
                className="absolute flex flex-col items-center -translate-x-1/2"
                style={{ left: `${pos}%` }}
              >
                <div className="w-px h-2 bg-subtle" />
                <span className="text-micro text-secondary mt-0.5">
                  {marker.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 mt-4">
          {/* Best difficulty */}
          <div>
            <span className="text-micro text-secondary uppercase tracking-wide">
              Best Difficulty
            </span>
            <div className="mt-1">
              <Mono className="text-display-md font-semibold text-primary">
                {formatNumber(bestDiffWeek)}
              </Mono>
              <span className="text-caption text-secondary ml-2">
                ({formatDifficulty(bestDiffWeek)})
              </span>
            </div>
          </div>

          {/* vs network */}
          <div>
            <span className="text-micro text-secondary uppercase tracking-wide">
              vs Network
            </span>
            <div className="mt-1">
              <Mono className="text-title font-semibold text-secondary">
                {percentageText}
              </Mono>
            </div>
          </div>

          {/* Network difficulty */}
          <div>
            <span className="text-micro text-secondary uppercase tracking-wide">
              Network Diff
            </span>
            <div className="mt-1">
              <Mono className="text-title font-semibold text-secondary">
                {formatDifficulty(networkDiff)}
              </Mono>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
