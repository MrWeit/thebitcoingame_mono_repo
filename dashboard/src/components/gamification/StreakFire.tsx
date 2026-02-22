import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface StreakFireProps {
  streakWeeks: number;
  size?: "sm" | "md" | "lg";
}

const sizeScale = {
  sm: 0.75,
  md: 1,
  lg: 1.5,
};

interface FireTier {
  scale: number;
  pulse: number;
  speed: number;
  glow: string;
  particles: boolean;
  flickerRotation: number[];
}

function getFireTier(weeks: number): FireTier {
  if (weeks >= 52) {
    return {
      scale: 3,
      pulse: 0.15,
      speed: 0.3,
      glow: "0 0 30px rgba(247,147,26,0.7), 0 0 60px rgba(247,147,26,0.4), 0 0 90px rgba(247,147,26,0.2)",
      particles: true,
      flickerRotation: [0, -3, 3, -2, 0],
    };
  }
  if (weeks >= 26) {
    return {
      scale: 2.5,
      pulse: 0.12,
      speed: 0.4,
      glow: "0 0 24px rgba(247,147,26,0.5), 0 0 48px rgba(247,147,26,0.25)",
      particles: false,
      flickerRotation: [0, -2, 2, -1, 0],
    };
  }
  if (weeks >= 12) {
    return {
      scale: 2,
      pulse: 0.08,
      speed: 0.5,
      glow: "0 0 16px rgba(247,147,26,0.4), 0 0 32px rgba(247,147,26,0.2)",
      particles: false,
      flickerRotation: [0, -1, 1, 0],
    };
  }
  if (weeks >= 4) {
    return {
      scale: 1.5,
      pulse: 0.05,
      speed: 0.8,
      glow: "0 0 10px rgba(247,147,26,0.3)",
      particles: false,
      flickerRotation: [0, -1, 1, 0],
    };
  }
  return {
    scale: 1,
    pulse: 0,
    speed: 0,
    glow: "none",
    particles: false,
    flickerRotation: [0],
  };
}

const FIRE_EMOJI = "\uD83D\uDD25";

export default function StreakFire({
  streakWeeks,
  size = "md",
}: StreakFireProps) {
  const prefersReduced = useReducedMotion();
  const fire = getFireTier(streakWeeks);
  const multiplier = sizeScale[size];
  const finalScale = fire.scale * multiplier;

  if (streakWeeks <= 0) {
    return (
      <span
        className="inline-flex items-center justify-center opacity-30"
        style={{ fontSize: `${1 * multiplier}rem` }}
        role="img"
        aria-label="No streak"
      >
        {FIRE_EMOJI}
      </span>
    );
  }

  if (prefersReduced) {
    return (
      <span
        className="inline-flex items-center justify-center"
        style={{ fontSize: `${finalScale}rem` }}
        role="img"
        aria-label={`${streakWeeks} week streak`}
      >
        {FIRE_EMOJI}
      </span>
    );
  }

  return (
    <div
      className={cn("relative inline-flex items-center justify-center")}
      role="img"
      aria-label={`${streakWeeks} week streak`}
    >
      {/* Glow backdrop */}
      {fire.glow !== "none" && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: finalScale * 20,
            height: finalScale * 20,
          }}
          animate={{
            boxShadow: [
              fire.glow,
              fire.glow.replace(/0\.\d+\)/g, (m) => {
                const val = parseFloat(m);
                return `${(val * 0.6).toFixed(2)})`;
              }),
              fire.glow,
            ],
          }}
          transition={{
            duration: fire.speed * 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Fire emoji with pulse/flicker */}
      <motion.span
        className="relative z-10"
        style={{ fontSize: `${finalScale}rem`, lineHeight: 1 }}
        animate={
          fire.pulse > 0
            ? {
                scale: [1, 1 + fire.pulse, 1 - fire.pulse * 0.5, 1],
                rotate: fire.flickerRotation,
              }
            : {}
        }
        transition={
          fire.pulse > 0
            ? {
                duration: fire.speed * 2,
                repeat: Infinity,
                ease: "easeInOut",
              }
            : {}
        }
      >
        {FIRE_EMOJI}
      </motion.span>

      {/* Particles for inferno tier */}
      {fire.particles && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full"
              style={{
                width: 3 * multiplier,
                height: 3 * multiplier,
                background: i % 2 === 0 ? "#F7931A" : "#E8720A",
                left: "50%",
                bottom: "50%",
              }}
              animate={{
                y: [0, -20 * multiplier - i * 4],
                x: [(i - 3) * 4 * multiplier, (i - 3) * 8 * multiplier],
                opacity: [0.8, 0],
                scale: [1, 0.3],
              }}
              transition={{
                duration: 1 + i * 0.2,
                repeat: Infinity,
                delay: i * 0.15,
                ease: "easeOut",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
