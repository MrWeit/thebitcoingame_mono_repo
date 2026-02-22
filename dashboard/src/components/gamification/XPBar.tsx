import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Mono } from "@/components/shared/Mono";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { durations, easings } from "@/lib/animation";

interface XPBarProps {
  current: number;
  max: number;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeConfig = {
  sm: { height: "h-2", text: "text-micro" },
  md: { height: "h-3", text: "text-caption" },
  lg: { height: "h-4", text: "text-body" },
};

export default function XPBar({
  current,
  max,
  showLabel = true,
  size = "md",
  className,
}: XPBarProps) {
  const prefersReduced = useReducedMotion();
  const [animatedPercent, setAnimatedPercent] = useState(0);
  const percentage = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const config = sizeConfig[size];

  useEffect(() => {
    if (prefersReduced) {
      setAnimatedPercent(percentage);
      return;
    }
    const timer = setTimeout(() => {
      setAnimatedPercent(percentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [percentage, prefersReduced]);

  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex items-center justify-between mb-1.5">
          <Mono className={cn(config.text, "text-secondary")}>
            {current.toLocaleString()} / {max.toLocaleString()} XP
          </Mono>
          <Mono className={cn(config.text, "text-secondary")}>
            {Math.round(percentage)}%
          </Mono>
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Experience points progress"
        className={cn(
          "relative w-full rounded-radius-full bg-elevated overflow-hidden",
          config.height
        )}
      >
        {/* Filled bar */}
        <motion.div
          className="absolute inset-y-0 left-0 rounded-radius-full bg-gradient-to-r from-bitcoin to-[#E8720A]"
          initial={{ width: "0%" }}
          animate={{ width: `${animatedPercent}%` }}
          transition={
            prefersReduced
              ? { duration: 0 }
              : { duration: durations.large, ease: easings.smooth }
          }
        />

        {/* Particle flow effect */}
        {!prefersReduced && animatedPercent > 5 && (
          <div
            className="absolute inset-y-0 left-0 overflow-hidden rounded-radius-full"
            style={{ width: `${animatedPercent}%` }}
          >
            <div className="xp-bar-particles absolute inset-0">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="absolute rounded-full bg-white/40"
                  style={{
                    width: size === "sm" ? 2 : 3,
                    height: size === "sm" ? 2 : 3,
                    top: `${20 + Math.random() * 60}%`,
                    left: "-4px",
                    animation: `xpParticleFlow ${1.5 + i * 0.3}s linear ${i * 0.3}s infinite`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Glow at the edge */}
        {animatedPercent > 2 && (
          <motion.div
            className="absolute inset-y-0 w-4 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(247,147,26,0.6) 0%, transparent 70%)",
            }}
            initial={{ left: "0%" }}
            animate={{ left: `calc(${animatedPercent}% - 8px)` }}
            transition={
              prefersReduced
                ? { duration: 0 }
                : { duration: durations.large, ease: easings.smooth }
            }
          />
        )}
      </div>

      <style>{`
        @keyframes xpParticleFlow {
          0% { transform: translateX(0); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.4; }
          100% { transform: translateX(calc(100cqw)); opacity: 0; }
        }
        .xp-bar-particles { container-type: inline-size; }
      `}</style>
    </div>
  );
}
