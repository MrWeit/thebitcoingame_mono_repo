import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Cube,
  Medal,
  UserPlus,
  Trophy,
  CaretDown,
  CaretUp,
  Globe,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { durations, easings, staggerContainer, staggerItem } from "@/lib/animation";
import { mockGlobalFeed, formatTimeAgo } from "@/mocks/data";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const FEED_ICONS: Record<string, React.ReactNode> = {
  block: <Cube size={16} weight="fill" className="text-bitcoin" />,
  badge: <Medal size={16} weight="fill" className="text-purple" />,
  miner: <UserPlus size={16} weight="fill" className="text-green" />,
  worldcup: <Trophy size={16} weight="fill" className="text-gold" />,
};

const INITIAL_VISIBLE = 4;

export function GlobalFeed() {
  const [expanded, setExpanded] = useState(false);
  const prefersReduced = useReducedMotion();

  const visibleItems = expanded
    ? mockGlobalFeed
    : mockGlobalFeed.slice(0, INITIAL_VISIBLE);

  const hasMore = mockGlobalFeed.length > INITIAL_VISIBLE;

  return (
    <Card variant="standard" padding="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Globe size={18} weight="bold" className="text-cyan" />
          <h3 className="text-body-lg font-semibold text-primary">
            Global Feed
          </h3>
          <span className="text-micro text-secondary">
            Platform activity
          </span>
        </div>
      </div>

      {/* Feed items */}
      <motion.div
        className="space-y-1"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <AnimatePresence initial={false}>
          {visibleItems.map((item) => (
            <motion.div
              key={item.id}
              variants={staggerItem}
              initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{
                duration: durations.small,
                ease: easings.gentle,
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-radius-sm hover:bg-spotlight/50 transition-colors"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-elevated flex items-center justify-center">
                {FEED_ICONS[item.type] || (
                  <Globe size={16} className="text-secondary" />
                )}
              </div>

              {/* Text */}
              <p className="flex-1 text-caption text-secondary min-w-0 truncate">
                {item.text}
              </p>

              {/* Time */}
              <span className="flex-shrink-0 text-micro text-subtle font-mono tabular-nums">
                {formatTimeAgo(item.time)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Toggle expand */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center justify-center gap-1.5 w-full mt-3 pt-3 border-t border-white/4",
            "text-caption text-secondary hover:text-primary transition-colors font-medium"
          )}
        >
          {expanded ? (
            <>
              Show Less
              <CaretUp size={14} weight="bold" />
            </>
          ) : (
            <>
              Show More ({mockGlobalFeed.length - INITIAL_VISIBLE} more)
              <CaretDown size={14} weight="bold" />
            </>
          )}
        </button>
      )}
    </Card>
  );
}
