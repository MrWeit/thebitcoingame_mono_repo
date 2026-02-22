import { useState, useEffect, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Hammer,
  Copy,
  Check,
  Eye,
  Thermometer,
  HardDrives,
  WifiHigh,
  Globe,
  BookOpen,
} from "@phosphor-icons/react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { Modal } from "@/components/ui/Modal";
import { Sparkline } from "@/components/ui/Sparkline";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import {
  staggerContainer,
  staggerItem,
  durations,
  easings,
} from "@/lib/animation";
import {
  mockWorkers,
  mockWorkerHashrateHistory,
  mockUptimeCalendar,
  mockSparklineData,
  mockShares,
  mockUser,
  formatHashrate,
  formatDifficulty,
  formatNumber,
  formatTimeAgo,
  formatUptime,
} from "@/mocks/data";

/* ── Types ── */
type Worker = (typeof mockWorkers)[number];

/* ── Constants ── */
const STRATUM_URL = "stratum+tcp://mine.thebitcoingame.com:3333";
const USERNAME_EXAMPLE = mockUser.address;
const PASSWORD = "x";

/* ══════════════════════════════════════════
   Status Dot — breathing glow when online
   ══════════════════════════════════════════ */
function StatusDot({ isOnline }: { isOnline: boolean }) {
  if (isOnline) {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green shadow-[0_0_6px_rgba(63,185,80,0.6)]" />
      </span>
    );
  }
  return <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red/60" />;
}

/* ══════════════════════════════════════════
   Accept Rate color helper
   ══════════════════════════════════════════ */
function acceptRateColor(rate: number): string {
  if (rate >= 99) return "text-green";
  if (rate >= 95) return "text-gold";
  return "text-red";
}

/* ══════════════════════════════════════════
   Live "last share" hook — ticks every second
   ══════════════════════════════════════════ */
function useLastShareTimer(date: Date) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return formatTimeAgo(date);
}

/* ══════════════════════════════════════════
   Copy-to-clipboard button
   ══════════════════════════════════════════ */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback: noop */
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "w-8 h-8 rounded-radius-sm flex items-center justify-center shrink-0",
        "text-secondary hover:text-primary hover:bg-spotlight transition-colors duration-150"
      )}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check size={16} weight="bold" className="text-green" />
      ) : (
        <Copy size={16} />
      )}
    </button>
  );
}

/* ══════════════════════════════════════════
   Uptime Calendar — GitHub contribution grid
   ══════════════════════════════════════════ */
function UptimeCalendar() {
  const weeks = useMemo(() => {
    const result: (typeof mockUptimeCalendar)[] = [];
    for (let i = 0; i < mockUptimeCalendar.length; i += 7) {
      result.push(mockUptimeCalendar.slice(i, i + 7));
    }
    return result;
  }, []);

  const maxShares = useMemo(
    () => Math.max(...mockUptimeCalendar.map((d) => d.shares), 1),
    []
  );

  function intensityClass(shares: number): string {
    if (shares === 0) return "bg-white/4";
    const ratio = shares / maxShares;
    if (ratio < 0.25) return "bg-green/20";
    if (ratio < 0.5) return "bg-green/40";
    if (ratio < 0.75) return "bg-green/60";
    return "bg-green/80";
  }

  return (
    <div className="space-y-2">
      <h4 className="text-caption text-secondary font-medium uppercase tracking-wide">
        Uptime (last 90 days)
      </h4>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                className={cn(
                  "w-3 h-3 rounded-[2px] transition-colors",
                  intensityClass(day.shares)
                )}
                title={`${day.date}: ${formatNumber(day.shares)} shares, ${day.uptimeHours}h uptime`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-micro text-subtle">
        <span>Less</span>
        <div className="flex gap-[2px]">
          {["bg-white/4", "bg-green/20", "bg-green/40", "bg-green/60", "bg-green/80"].map(
            (cls, i) => (
              <div key={i} className={cn("w-3 h-3 rounded-[2px]", cls)} />
            )
          )}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Hashrate Chart (Recharts AreaChart)
   ══════════════════════════════════════════ */
function HashrateChart({ workerId }: { workerId: number }) {
  const data = useMemo(() => {
    return mockWorkerHashrateHistory(workerId).map((d) => ({
      time: new Date(d.time).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      hashrate: d.value,
    }));
  }, [workerId]);

  return (
    <div className="space-y-2">
      <h4 className="text-caption text-secondary font-medium uppercase tracking-wide">
        Hashrate (24h)
      </h4>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="hashrateGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-cyan)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-cyan)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--color-secondary)", fontSize: 11 }}
              tickFormatter={(v: number) => formatHashrate(v)}
              width={70}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-floating)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                color: "var(--color-primary)",
                fontSize: "13px",
              }}
              formatter={(value: number | undefined) => [formatHashrate(value ?? 0), "Hashrate"]}
              labelStyle={{ color: "var(--color-secondary)" }}
            />
            <Area
              type="monotone"
              dataKey="hashrate"
              stroke="var(--color-cyan)"
              strokeWidth={2}
              fill="url(#hashrateGrad)"
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Recent Shares Table (for SlideOver)
   ══════════════════════════════════════════ */
function RecentSharesTable({ workerName }: { workerName: string }) {
  const shares = useMemo(
    () => mockShares.filter((s) => s.worker === workerName).slice(0, 10),
    [workerName]
  );

  return (
    <div className="space-y-2">
      <h4 className="text-caption text-secondary font-medium uppercase tracking-wide">
        Recent Shares
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-caption">
          <thead>
            <tr className="text-subtle border-b border-white/4">
              <th className="text-left py-2 pr-4 font-medium">Time</th>
              <th className="text-right py-2 pr-4 font-medium">Difficulty</th>
              <th className="text-right py-2 font-medium">Valid</th>
            </tr>
          </thead>
          <tbody>
            {shares.map((share) => (
              <tr
                key={share.id}
                className="border-b border-white/4 last:border-0"
              >
                <td className="py-2 pr-4 text-secondary">
                  {formatTimeAgo(share.timestamp)}
                </td>
                <td className="py-2 pr-4 text-right">
                  <Mono className="text-primary">
                    {formatDifficulty(share.difficulty)}
                  </Mono>
                </td>
                <td className="py-2 text-right">
                  {share.valid ? (
                    <span className="text-green">Yes</span>
                  ) : (
                    <span className="text-red">No</span>
                  )}
                </td>
              </tr>
            ))}
            {shares.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-subtle">
                  No recent shares
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Worker Detail SlideOver Content
   ══════════════════════════════════════════ */
function WorkerDetailContent({ worker }: { worker: Worker }) {
  return (
    <div className="space-y-8">
      {/* Status banner */}
      <div className="flex items-center gap-3">
        <StatusDot isOnline={worker.isOnline} />
        <span
          className={cn(
            "text-body font-medium",
            worker.isOnline ? "text-green" : "text-red"
          )}
        >
          {worker.isOnline ? "Online" : "Offline"}
        </span>
        {worker.temperature !== null && (
          <span className="ml-auto flex items-center gap-1.5 text-caption text-secondary">
            <Thermometer size={14} />
            <Mono>{worker.temperature}C</Mono>
          </span>
        )}
      </div>

      {/* Key stats row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <span className="text-micro text-subtle uppercase tracking-wide">
            Hashrate (1m)
          </span>
          <Mono as="div" className="text-body-lg text-primary font-semibold">
            {formatHashrate(worker.hashrate1m)}
          </Mono>
        </div>
        <div className="space-y-1">
          <span className="text-micro text-subtle uppercase tracking-wide">
            Hashrate (24h)
          </span>
          <Mono as="div" className="text-body-lg text-primary font-semibold">
            {formatHashrate(worker.hashrate24h)}
          </Mono>
        </div>
        <div className="space-y-1">
          <span className="text-micro text-subtle uppercase tracking-wide">
            Best Difficulty
          </span>
          <Mono as="div" className="text-body-lg text-primary font-semibold">
            {formatDifficulty(worker.bestDiff)}
          </Mono>
        </div>
        <div className="space-y-1">
          <span className="text-micro text-subtle uppercase tracking-wide">
            Accept Rate
          </span>
          <Mono
            as="div"
            className={cn(
              "text-body-lg font-semibold",
              acceptRateColor(worker.acceptRate)
            )}
          >
            {worker.acceptRate}%
          </Mono>
        </div>
      </div>

      {/* Hashrate chart */}
      <HashrateChart workerId={worker.id} />

      {/* Uptime calendar */}
      <UptimeCalendar />

      {/* Connection info */}
      <div className="space-y-3">
        <h4 className="text-caption text-secondary font-medium uppercase tracking-wide">
          Connection Info
        </h4>
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-caption">
            <Globe size={14} className="text-subtle shrink-0" />
            <span className="text-secondary">IP:</span>
            <Mono className="text-primary">{worker.ip}</Mono>
          </div>
          <div className="flex items-center gap-3 text-caption">
            <HardDrives size={14} className="text-subtle shrink-0" />
            <span className="text-secondary">User Agent:</span>
            <Mono className="text-primary">{worker.userAgent}</Mono>
          </div>
          <div className="flex items-center gap-3 text-caption">
            <WifiHigh size={14} className="text-subtle shrink-0" />
            <span className="text-secondary">Stratum:</span>
            <Mono className="text-primary">v{worker.stratumVersion}</Mono>
          </div>
        </div>
      </div>

      {/* Recent shares */}
      <RecentSharesTable workerName={worker.name} />
    </div>
  );
}

/* ══════════════════════════════════════════
   Add Worker Guide Modal Content
   ══════════════════════════════════════════ */
function AddWorkerGuideContent() {
  const fields = [
    { label: "Stratum URL", value: STRATUM_URL },
    { label: "Username", value: USERNAME_EXAMPLE },
    { label: "Password", value: PASSWORD },
  ];

  return (
    <div className="space-y-6">
      <p className="text-body text-secondary">
        Configure your mining device with the following settings to connect to
        The Bitcoin Game pool.
      </p>

      <div className="space-y-4">
        {fields.map(({ label, value }) => (
          <div key={label} className="space-y-1.5">
            <label className="text-caption text-secondary font-medium">
              {label}
            </label>
            <div className="flex items-center gap-2 bg-canvas rounded-radius-md border border-white/4 px-3 py-2.5">
              <Mono className="text-body text-primary flex-1 truncate">
                {value}
              </Mono>
              <CopyButton text={value} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-canvas rounded-radius-md border border-white/4 p-4 space-y-2">
        <h4 className="text-caption text-cyan font-semibold">Quick Tips</h4>
        <ul className="text-caption text-secondary space-y-1.5 list-disc list-inside">
          <li>Worker name is appended after your BTC address with a dot separator</li>
          <li>
            Example: <Mono className="text-primary">{USERNAME_EXAMPLE}.bitaxe1</Mono>
          </li>
          <li>Most Bitaxe firmware auto-detects the stratum version</li>
          <li>Restart your miner after changing settings</li>
        </ul>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════
   Worker Card
   ══════════════════════════════════════════ */
function WorkerCard({
  worker,
  onViewDetails,
}: {
  worker: Worker;
  onViewDetails: () => void;
}) {
  const lastShareText = useLastShareTimer(worker.lastShare);

  return (
    <motion.div variants={staggerItem}>
      <Card
        variant="interactive"
        padding="md"
        className={cn(!worker.isOnline && "opacity-50")}
      >
        <div className="space-y-4">
          {/* Header: status + name */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <StatusDot isOnline={worker.isOnline} />
              <span
                className={cn(
                  "text-caption font-medium",
                  worker.isOnline ? "text-green" : "text-red"
                )}
              >
                {worker.isOnline ? "Online" : "Offline"}
              </span>
            </div>
            {worker.temperature !== null && (
              <span className="flex items-center gap-1 text-micro text-subtle">
                <Thermometer size={12} />
                <Mono>{worker.temperature}C</Mono>
              </span>
            )}
          </div>

          {/* Worker name */}
          <div className="flex items-center gap-2">
            <Hammer size={18} className="text-secondary shrink-0" />
            <h3 className="text-body font-semibold text-primary truncate">
              {worker.name}
            </h3>
          </div>

          {/* Hashrate + sparkline */}
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-micro text-subtle uppercase tracking-wide">
                Hashrate
              </span>
              <Mono as="div" className="text-headline text-primary font-semibold">
                {formatHashrate(worker.hashrate1m)}
              </Mono>
            </div>
            <Sparkline
              data={mockSparklineData.hashrate}
              width={72}
              height={28}
              color={
                worker.isOnline ? "var(--color-cyan)" : "var(--color-secondary)"
              }
            />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            <div className="space-y-0.5">
              <span className="text-micro text-subtle">Current Diff</span>
              <Mono as="div" className="text-caption text-primary">
                {formatDifficulty(worker.currentDiff)}
              </Mono>
            </div>
            <div className="space-y-0.5">
              <span className="text-micro text-subtle">Best Diff</span>
              <Mono as="div" className="text-caption text-primary">
                {formatDifficulty(worker.bestDiff)}
              </Mono>
            </div>
            <div className="space-y-0.5">
              <span className="text-micro text-subtle">Shares/hr</span>
              <Mono as="div" className="text-caption text-primary">
                {formatNumber(worker.sharesPerHour)}
              </Mono>
            </div>
            <div className="space-y-0.5">
              <span className="text-micro text-subtle">Uptime</span>
              <Mono as="div" className="text-caption text-primary">
                {worker.uptime > 0 ? formatUptime(worker.uptime) : "--"}
              </Mono>
            </div>
            <div className="space-y-0.5">
              <span className="text-micro text-subtle">
                {worker.isOnline ? "Last Share" : "Last Seen"}
              </span>
              <Mono as="div" className="text-caption text-primary">
                {lastShareText}
              </Mono>
            </div>
            <div className="space-y-0.5">
              <span className="text-micro text-subtle">Accept Rate</span>
              <Mono
                as="div"
                className={cn("text-caption", acceptRateColor(worker.acceptRate))}
              >
                {worker.acceptRate}%
              </Mono>
            </div>
          </div>

          {/* View details button */}
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            leftIcon={<Eye size={16} />}
            onClick={onViewDetails}
          >
            View Details
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   WORKERS PAGE — main export
   ══════════════════════════════════════════════════════════════════ */
export default function WorkersPage() {
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  /* Derived stats */
  const onlineWorkers = mockWorkers.filter((w) => w.isOnline);
  const totalHashrate = onlineWorkers.reduce((sum, w) => sum + w.hashrate1m, 0);

  /* Sort: online first, then by hashrate desc */
  const sortedWorkers = useMemo(
    () =>
      [...mockWorkers].sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return b.hashrate1m - a.hashrate1m;
      }),
    []
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.medium, ease: easings.gentle }}
        className="space-y-8"
      >
        {/* ── Page Header ── */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-title font-semibold text-primary">
              Your Mining Fleet
            </h1>
            <p className="text-body text-secondary">
              <Mono className="text-cyan">{onlineWorkers.length}</Mono>{" "}
              {onlineWorkers.length === 1 ? "worker" : "workers"} online
              {" \u2014 "}
              Total:{" "}
              <Mono className="text-primary font-medium">
                {formatHashrate(totalHashrate)}
              </Mono>
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            leftIcon={<BookOpen size={18} />}
            onClick={() => setGuideOpen(true)}
          >
            Add Worker Guide
          </Button>
        </div>

        {/* ── Worker Card Grid ── */}
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3"
        >
          {sortedWorkers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              onViewDetails={() => setSelectedWorker(worker)}
            />
          ))}
        </motion.div>
      </motion.div>

      {/* ── Worker Detail SlideOver ── */}
      <SlideOver
        open={selectedWorker !== null}
        onClose={() => setSelectedWorker(null)}
        title={selectedWorker?.name ?? "Worker Details"}
        width={480}
      >
        {selectedWorker && <WorkerDetailContent worker={selectedWorker} />}
      </SlideOver>

      {/* ── Add Worker Guide Modal ── */}
      <Modal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="Add Worker Guide"
        maxWidth="md"
      >
        <AddWorkerGuideContent />
      </Modal>
    </>
  );
}
