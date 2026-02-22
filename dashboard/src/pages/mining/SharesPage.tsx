import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  Star,
  CaretUp,
  CaretDown,
  FunnelSimple,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  staggerContainer,
  staggerItem,
  durations,
  easings,
} from "@/lib/animation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { Mono } from "@/components/shared/Mono";
import {
  mockShares,
  mockWorkers,
  formatDifficulty,
  formatTimeAgo,
} from "@/mocks/data";

/* ── Types ── */
type SortField =
  | "timestamp"
  | "worker"
  | "difficulty"
  | "shareDiff"
  | "valid"
  | "isBlock";
type SortDir = "asc" | "desc";
type ValidityFilter = "all" | "valid" | "invalid";

type Share = (typeof mockShares)[number];

const ROWS_PER_PAGE = 15;

/* ── Column definitions ── */
const columns: { key: SortField; label: string; align?: "center" }[] = [
  { key: "timestamp", label: "Time" },
  { key: "worker", label: "Worker" },
  { key: "difficulty", label: "Difficulty" },
  { key: "shareDiff", label: "Share Diff" },
  { key: "valid", label: "Valid", align: "center" },
  { key: "isBlock", label: "Block", align: "center" },
];

/* ── Helper: format date for table cell ── */
function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/* ── Helper: count leading zeros in hash ── */
function splitLeadingZeros(hash: string): [string, string] {
  const match = hash.match(/^(0+)(.*)/);
  if (!match) return ["", hash];
  return [match[1], match[2]];
}

/* ── Helper: row background class ── */
function getRowClasses(share: Share): string {
  if (!share.valid) return "bg-red/5";
  if (share.isPersonalBest) return "bg-gold/5 border-l-2 border-gold";
  if (share.isAboveAverage) return "bg-green/5";
  return "";
}

/* ── Ratio bar component ── */
function RatioBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  // For very tiny ratios, show at least 1px
  const displayPct = pct < 0.5 ? 0.5 : pct;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-caption">
        <span className="text-secondary">Share Diff / Network Diff</span>
        <Mono className="text-primary">{label}</Mono>
      </div>
      <div className="h-3 w-full rounded-full bg-elevated overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan to-purple"
          initial={{ width: 0 }}
          animate={{ width: `${displayPct}%` }}
          transition={{ duration: durations.large, ease: easings.gentle }}
        />
      </div>
      <div className="flex items-center justify-between text-micro text-subtle">
        <span>0</span>
        <span>Network Diff</span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════
   SharesPage Component
   ══════════════════════════════════ */
export default function SharesPage() {
  /* ── Filter state ── */
  const [workerFilter, setWorkerFilter] = useState<string>("all");
  const [validityFilter, setValidityFilter] = useState<ValidityFilter>("all");
  const [minDifficulty, setMinDifficulty] = useState<string>("");

  /* ── Sort state ── */
  const [sortField, setSortField] = useState<SortField>("timestamp");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  /* ── Pagination state ── */
  const [page, setPage] = useState(1);

  /* ── Detail slide-over state ── */
  const [selectedShare, setSelectedShare] = useState<Share | null>(null);

  /* ── Unique worker names ── */
  const workerNames = useMemo(
    () => mockWorkers.map((w) => w.name),
    [],
  );

  /* ── Filtered data ── */
  const filteredShares = useMemo(() => {
    let data = [...mockShares];

    // Worker filter
    if (workerFilter !== "all") {
      data = data.filter((s) => s.worker === workerFilter);
    }

    // Validity filter
    if (validityFilter === "valid") {
      data = data.filter((s) => s.valid);
    } else if (validityFilter === "invalid") {
      data = data.filter((s) => !s.valid);
    }

    // Min difficulty filter
    const minDiff = parseFloat(minDifficulty);
    if (!isNaN(minDiff) && minDiff > 0) {
      data = data.filter((s) => s.difficulty >= minDiff);
    }

    return data;
  }, [workerFilter, validityFilter, minDifficulty]);

  /* ── Sorted data ── */
  const sortedShares = useMemo(() => {
    const data = [...filteredShares];

    data.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "timestamp":
          cmp = a.timestamp.getTime() - b.timestamp.getTime();
          break;
        case "worker":
          cmp = a.worker.localeCompare(b.worker);
          break;
        case "difficulty":
          cmp = a.difficulty - b.difficulty;
          break;
        case "shareDiff":
          cmp = a.shareDiff - b.shareDiff;
          break;
        case "valid":
          cmp = (a.valid ? 1 : 0) - (b.valid ? 1 : 0);
          break;
        case "isBlock":
          cmp = (a.isBlock ? 1 : 0) - (b.isBlock ? 1 : 0);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return data;
  }, [filteredShares, sortField, sortDir]);

  /* ── Paginated data ── */
  const totalPages = Math.max(1, Math.ceil(sortedShares.length / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const paginatedShares = sortedShares.slice(
    (safePage - 1) * ROWS_PER_PAGE,
    safePage * ROWS_PER_PAGE,
  );

  /* ── Handlers ── */
  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
    setPage(1);
  }

  function handleFilterChange() {
    setPage(1);
  }

  /* ── Render ── */
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="space-y-6"
    >
      {/* ── Page Header ── */}
      <motion.div variants={staggerItem}>
        <h1 className="text-title text-primary font-semibold">
          Share History
        </h1>
        <p className="text-body text-secondary mt-1">
          All shares submitted by your workers
        </p>
      </motion.div>

      {/* ── Filters ── */}
      <motion.div variants={staggerItem}>
        <Card padding="md" className="!p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2 text-secondary text-caption">
              <FunnelSimple size={16} weight="bold" />
              <span className="font-medium">Filters</span>
            </div>

            {/* Worker filter */}
            <div className="flex flex-col gap-1">
              <label className="text-micro text-subtle font-medium uppercase tracking-wider">
                Worker
              </label>
              <select
                value={workerFilter}
                onChange={(e) => {
                  setWorkerFilter(e.target.value);
                  handleFilterChange();
                }}
                className={cn(
                  "h-9 px-3 rounded-radius-sm text-caption",
                  "bg-elevated border border-white/8 text-primary",
                  "focus:outline-none focus:border-cyan/50",
                  "transition-colors cursor-pointer",
                )}
              >
                <option value="all">All Workers</option>
                {workerNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Validity filter */}
            <div className="flex flex-col gap-1">
              <label className="text-micro text-subtle font-medium uppercase tracking-wider">
                Status
              </label>
              <select
                value={validityFilter}
                onChange={(e) => {
                  setValidityFilter(e.target.value as ValidityFilter);
                  handleFilterChange();
                }}
                className={cn(
                  "h-9 px-3 rounded-radius-sm text-caption",
                  "bg-elevated border border-white/8 text-primary",
                  "focus:outline-none focus:border-cyan/50",
                  "transition-colors cursor-pointer",
                )}
              >
                <option value="all">All</option>
                <option value="valid">Valid Only</option>
                <option value="invalid">Invalid Only</option>
              </select>
            </div>

            {/* Min difficulty input */}
            <div className="flex flex-col gap-1">
              <label className="text-micro text-subtle font-medium uppercase tracking-wider">
                Min Difficulty
              </label>
              <input
                type="number"
                value={minDifficulty}
                onChange={(e) => {
                  setMinDifficulty(e.target.value);
                  handleFilterChange();
                }}
                placeholder="e.g. 1000000"
                className={cn(
                  "h-9 px-3 rounded-radius-sm text-caption font-mono tabular-nums",
                  "bg-elevated border border-white/8 text-primary placeholder:text-subtle",
                  "focus:outline-none focus:border-cyan/50",
                  "transition-colors w-40",
                )}
              />
            </div>

            {/* Result count */}
            <div className="ml-auto text-caption text-secondary hidden sm:block">
              <Mono>{sortedShares.length}</Mono> shares
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── Table ── */}
      <motion.div variants={staggerItem}>
        <Card padding="sm" className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              {/* Table Head */}
              <thead>
                <tr className="border-b border-white/8">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={cn(
                        "px-4 py-3 text-micro font-medium uppercase tracking-wider text-subtle",
                        "cursor-pointer select-none hover:text-secondary transition-colors",
                        col.key === "timestamp" && "sticky left-0 bg-surface z-10",
                        col.align === "center" ? "text-center" : "text-left",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortField === col.key && (
                          <span className="text-cyan">
                            {sortDir === "asc" ? (
                              <CaretUp size={12} weight="bold" />
                            ) : (
                              <CaretDown size={12} weight="bold" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody>
                {paginatedShares.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-12 text-center text-secondary text-body"
                    >
                      No shares match your filters.
                    </td>
                  </tr>
                ) : (
                  paginatedShares.map((share, i) => (
                    <motion.tr
                      key={share.id}
                      onClick={() => setSelectedShare(share)}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: durations.small,
                        delay: i * 0.02,
                        ease: easings.gentle,
                      }}
                      className={cn(
                        "border-b border-white/4 cursor-pointer",
                        "hover:bg-spotlight/50 transition-colors",
                        getRowClasses(share),
                      )}
                    >
                      {/* Time */}
                      <td className="px-4 py-3 sticky left-0 bg-inherit z-10">
                        <Mono className="text-caption text-secondary whitespace-nowrap">
                          {formatDate(share.timestamp)}
                        </Mono>
                      </td>

                      {/* Worker */}
                      <td className="px-4 py-3">
                        <span className="text-caption text-primary">
                          {share.worker}
                        </span>
                      </td>

                      {/* Difficulty */}
                      <td className="px-4 py-3">
                        <Mono className="text-caption text-primary">
                          {formatDifficulty(share.difficulty)}
                        </Mono>
                      </td>

                      {/* Share Diff */}
                      <td className="px-4 py-3">
                        <Mono className="text-caption text-primary">
                          {formatDifficulty(share.shareDiff)}
                        </Mono>
                      </td>

                      {/* Valid */}
                      <td className="px-4 py-3 text-center">
                        {share.valid ? (
                          <CheckCircle
                            size={18}
                            weight="fill"
                            className="text-green inline-block"
                          />
                        ) : (
                          <XCircle
                            size={18}
                            weight="fill"
                            className="text-red inline-block"
                          />
                        )}
                      </td>

                      {/* Block */}
                      <td className="px-4 py-3 text-center">
                        {share.isBlock && (
                          <Star
                            size={18}
                            weight="fill"
                            className="text-gold inline-block"
                          />
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {sortedShares.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-white/8">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                leftIcon={<CaretLeft size={14} />}
              >
                Previous
              </Button>

              <span className="text-caption text-secondary">
                Page <Mono>{safePage}</Mono> of <Mono>{totalPages}</Mono>
              </span>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                rightIcon={<CaretRight size={14} />}
              >
                Next
              </Button>
            </div>
          )}
        </Card>
      </motion.div>

      {/* ── Share Detail SlideOver ── */}
      <SlideOver
        open={!!selectedShare}
        onClose={() => setSelectedShare(null)}
        title="Share Detail"
      >
        {selectedShare && <ShareDetail share={selectedShare} />}
      </SlideOver>
    </motion.div>
  );
}

/* ── Share Detail Panel ── */
function ShareDetail({ share }: { share: Share }) {
  const [zeros, rest] = splitLeadingZeros(share.hash);
  const ratio = share.shareDiff / share.networkDiffAtTime;
  const ratioLabel =
    ratio < 0.0001
      ? ratio.toExponential(2)
      : (ratio * 100).toFixed(4) + "%";

  return (
    <div className="space-y-6">
      {/* Status badge */}
      <div className="flex items-center gap-3">
        {share.valid ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium bg-green/10 text-green rounded-full">
            <CheckCircle size={14} weight="fill" />
            Valid Share
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium bg-red/10 text-red rounded-full">
            <XCircle size={14} weight="fill" />
            Invalid Share
          </span>
        )}
        {share.isBlock && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium bg-gold/10 text-gold rounded-full">
            <Star size={14} weight="fill" />
            Block Candidate
          </span>
        )}
        {share.isPersonalBest && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-caption font-medium bg-gold/10 text-gold rounded-full">
            Personal Best
          </span>
        )}
      </div>

      {/* Hash */}
      <div className="space-y-2">
        <label className="text-micro text-subtle font-medium uppercase tracking-wider">
          Hash
        </label>
        <div className="p-3 bg-elevated rounded-radius-md border border-white/4 overflow-x-auto">
          <Mono className="text-caption break-all leading-relaxed">
            <span className="text-bitcoin">{zeros}</span>
            <span className="text-secondary">{rest}</span>
          </Mono>
        </div>
      </div>

      {/* Nonce */}
      <div className="space-y-2">
        <label className="text-micro text-subtle font-medium uppercase tracking-wider">
          Nonce
        </label>
        <div className="p-3 bg-elevated rounded-radius-md border border-white/4">
          <Mono className="text-caption text-primary">
            0x{share.nonce}
          </Mono>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-micro text-subtle font-medium uppercase tracking-wider">
            Worker
          </label>
          <p className="text-body text-primary">{share.worker}</p>
        </div>

        <div className="space-y-1">
          <label className="text-micro text-subtle font-medium uppercase tracking-wider">
            Time
          </label>
          <p className="text-body text-secondary">{formatTimeAgo(share.timestamp)}</p>
        </div>

        <div className="space-y-1">
          <label className="text-micro text-subtle font-medium uppercase tracking-wider">
            Difficulty
          </label>
          <Mono as="p" className="text-body text-primary">
            {formatDifficulty(share.difficulty)}
          </Mono>
        </div>

        <div className="space-y-1">
          <label className="text-micro text-subtle font-medium uppercase tracking-wider">
            Share Diff
          </label>
          <Mono as="p" className="text-body text-primary">
            {formatDifficulty(share.shareDiff)}
          </Mono>
        </div>
      </div>

      {/* Network difficulty */}
      <div className="space-y-1">
        <label className="text-micro text-subtle font-medium uppercase tracking-wider">
          Network Difficulty at Time
        </label>
        <Mono as="p" className="text-body text-primary">
          {formatDifficulty(share.networkDiffAtTime)}
        </Mono>
      </div>

      {/* Ratio bar */}
      <div className="pt-2">
        <RatioBar
          value={share.shareDiff}
          max={share.networkDiffAtTime}
          label={ratioLabel}
        />
      </div>
    </div>
  );
}
