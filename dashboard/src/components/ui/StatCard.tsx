import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { CaretUp, CaretDown } from "@phosphor-icons/react";
import { Card } from "./Card";
import { cn } from "@/lib/utils";
import { durations, springs } from "@/lib/animation";

interface StatCardProps {
  label: string;
  value: string | number;
  change?: { value: number; direction: "up" | "down" };
  icon?: React.ReactNode;
  sparklineData?: number[];
  className?: string;
}

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, {
    stiffness: springs.light.stiffness,
    damping: springs.light.damping,
    restDelta: 0.001,
  });
  const displayValue = useTransform(springValue, (latest) =>
    Math.round(latest).toLocaleString()
  );

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span>{displayValue}</motion.span>;
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const width = 100;
  const height = 32;
  const step = width / (data.length - 1);

  const points = data
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const isPositive = data[data.length - 1] >= data[0];

  return (
    <div className="mt-4 h-8 w-full">
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="overflow-visible"
      >
        <motion.polyline
          points={points}
          fill="none"
          stroke={isPositive ? "var(--color-green)" : "var(--color-red)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.6 }}
          transition={{ duration: durations.large, ease: "easeOut" }}
        />
      </svg>
    </div>
  );
}

export function StatCard({
  label,
  value,
  change,
  icon,
  sparklineData,
  className,
}: StatCardProps) {
  const isNumeric = typeof value === "number";

  return (
    <Card variant="stat" padding="md" className={className}>
      <div className="flex flex-col gap-3">
        {/* Icon */}
        {icon && (
          <div className="text-secondary opacity-60 text-xl">{icon}</div>
        )}

        {/* Label */}
        <div className="text-caption text-secondary uppercase tracking-wide">
          {label}
        </div>

        {/* Value */}
        <div className="text-title font-semibold font-mono tabular-nums">
          {isNumeric ? <AnimatedNumber value={value} /> : value}
        </div>

        {/* Change Indicator */}
        {change && (
          <motion.div
            className={cn(
              "inline-flex items-center gap-1 text-caption font-medium",
              change.direction === "up" ? "text-green" : "text-red"
            )}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: durations.small }}
          >
            {change.direction === "up" ? (
              <CaretUp weight="bold" className="text-sm" />
            ) : (
              <CaretDown weight="bold" className="text-sm" />
            )}
            <span>
              {Math.abs(change.value)}%
            </span>
          </motion.div>
        )}

        {/* Sparkline */}
        {sparklineData && <Sparkline data={sparklineData} />}
      </div>
    </Card>
  );
}
