import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lightning, ArrowUp, Star } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import { durations, easings } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  mockSharesFeed,
  mockWorkers,
  formatDifficulty,
  formatTimeAgo,
  generateShareId,
} from "@/mocks/data";

interface Share {
  id: string;
  timestamp: Date;
  worker: string;
  difficulty: number;
  isPersonalBest: boolean;
  isAboveAverage: boolean;
}

const MAX_VISIBLE = 15;

function getShareColor(share: Share): string {
  if (share.isPersonalBest) return "text-gold";
  if (share.isAboveAverage) return "text-green";
  return "text-primary";
}

function getShareBg(share: Share): string {
  if (share.isPersonalBest) return "bg-gold/5 border-gold/20";
  if (share.isAboveAverage) return "bg-green/5 border-green/10";
  return "bg-transparent border-white/4";
}

function getShareIcon(share: Share) {
  if (share.isPersonalBest) return <Star size={14} weight="fill" className="text-gold" />;
  if (share.isAboveAverage) return <ArrowUp size={14} weight="bold" className="text-green" />;
  return <Lightning size={14} weight="bold" className="text-secondary" />;
}

function generateRandomShare(): Share {
  const workers = mockWorkers.filter((w) => w.isOnline);
  const worker = workers[Math.floor(Math.random() * workers.length)];
  const difficulty = Math.floor(Math.random() * 100_000_000) + 500_000;
  const isAboveAverage = difficulty > 50_000_000;
  const isPersonalBest = Math.random() < 0.02; // 2% chance

  return {
    id: generateShareId(),
    timestamp: new Date(),
    worker: worker.name,
    difficulty,
    isPersonalBest,
    isAboveAverage: isAboveAverage && !isPersonalBest,
  };
}

export function LiveShareFeed() {
  const prefersReduced = useReducedMotion();
  const [shares, setShares] = useState<Share[]>(
    mockSharesFeed.slice(0, MAX_VISIBLE)
  );

  useEffect(() => {
    const getInterval = () => 2000 + Math.random() * 3000; // 2-5 seconds

    let timeout: ReturnType<typeof setTimeout>;

    const addShare = () => {
      setShares((prev) => {
        const newShare = generateRandomShare();
        return [newShare, ...prev].slice(0, MAX_VISIBLE);
      });
      timeout = setTimeout(addShare, getInterval());
    };

    timeout = setTimeout(addShare, getInterval());
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Card variant="standard" padding="md" className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Lightning size={18} weight="fill" className="text-cyan" />
          <h3 className="text-body-lg font-semibold text-primary">
            Live Shares
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green animate-pulse" />
          <span className="text-micro text-secondary">Live</span>
        </div>
      </div>

      {/* Feed list */}
      <div aria-live="polite" aria-label="Live mining share feed" className="flex-1 overflow-hidden space-y-1.5 min-h-0">
        <AnimatePresence initial={false} mode="popLayout">
          {shares.map((share) => (
            <motion.div
              key={share.id}
              layout={!prefersReduced}
              initial={prefersReduced ? { opacity: 1 } : { opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, x: 20, height: 0 }}
              transition={{
                duration: durations.small,
                ease: easings.snappy,
                layout: { duration: durations.small },
              }}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-radius-sm border",
                getShareBg(share)
              )}
            >
              {/* Icon */}
              <div className="flex-shrink-0">
                {getShareIcon(share)}
              </div>

              {/* Worker name */}
              <span className="text-caption text-secondary truncate min-w-0 flex-shrink-0 w-28">
                {share.worker}
              </span>

              {/* Difficulty */}
              <Mono
                className={cn(
                  "text-caption font-medium flex-1 text-right",
                  getShareColor(share)
                )}
              >
                {formatDifficulty(share.difficulty)}
              </Mono>

              {/* Time */}
              <span className="text-micro text-subtle flex-shrink-0 w-12 text-right">
                {formatTimeAgo(share.timestamp)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/4">
        <div className="flex items-center gap-1.5">
          <Star size={10} weight="fill" className="text-gold" />
          <span className="text-micro text-secondary">Best</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ArrowUp size={10} weight="bold" className="text-green" />
          <span className="text-micro text-secondary">Above Avg</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Lightning size={10} weight="bold" className="text-secondary" />
          <span className="text-micro text-secondary">Normal</span>
        </div>
      </div>
    </Card>
  );
}
