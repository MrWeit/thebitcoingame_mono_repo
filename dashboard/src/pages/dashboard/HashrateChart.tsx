import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { ChartLine } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import { mockHashrateHistory, formatHashrate } from "@/mocks/data";

type TimeRange = "1h" | "24h" | "7d" | "30d";

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: "1h", label: "1H" },
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
];

function formatXAxis(iso: string, range: TimeRange): string {
  const d = new Date(iso);
  switch (range) {
    case "1h":
      return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    case "24h":
      return d.toLocaleTimeString("en-US", { hour: "2-digit" });
    case "7d":
      return d.toLocaleDateString("en-US", { weekday: "short" });
    case "30d":
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
}

function formatYAxis(value: number): string {
  if (value >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(0)}G`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)}M`;
  return `${value}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-floating border border-white/8 rounded-radius-sm px-3 py-2 shadow-heavy">
      <p className="text-micro text-secondary mb-1">
        {label ? new Date(label).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) : ""}
      </p>
      <Mono className="text-caption font-medium text-primary">
        {formatHashrate(payload[0].value)}
      </Mono>
    </div>
  );
}

export function HashrateChart() {
  const [range, setRange] = useState<TimeRange>("24h");

  const data = useMemo(() => mockHashrateHistory[range], [range]);

  const avgHashrate = useMemo(() => {
    const sum = data.reduce((acc, d) => acc + d.value, 0);
    return sum / data.length;
  }, [data]);

  return (
    <Card variant="standard" padding="md" className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ChartLine size={18} weight="bold" className="text-cyan" />
          <h3 className="text-body-lg font-semibold text-primary">
            Hashrate
          </h3>
          <Mono className="text-caption text-secondary ml-2">
            avg {formatHashrate(avgHashrate)}
          </Mono>
        </div>

        {/* Time range segmented control */}
        <div className="flex items-center bg-elevated rounded-radius-sm p-0.5 border border-white/4">
          {TIME_RANGES.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={cn(
                "relative px-3 py-1 text-micro font-medium rounded-radius-sm transition-colors",
                range === key
                  ? "text-primary"
                  : "text-secondary hover:text-primary"
              )}
            >
              {range === key && (
                <motion.div
                  layoutId="hashrate-range"
                  className="absolute inset-0 bg-surface border border-white/8 rounded-radius-sm shadow-subtle"
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0" style={{ minHeight: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="hashrateGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F7931A" stopOpacity={0.3} />
                <stop offset="50%" stopColor="#F7931A" stopOpacity={0.1} />
                <stop offset="100%" stopColor="#F7931A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tickFormatter={(v) => formatXAxis(v, range)}
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tickFormatter={formatYAxis}
              tick={{ fill: "#8B949E", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{
                stroke: "rgba(88,166,255,0.3)",
                strokeDasharray: "4 4",
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#F7931A"
              strokeWidth={2}
              fill="url(#hashrateGradient)"
              animationDuration={800}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
