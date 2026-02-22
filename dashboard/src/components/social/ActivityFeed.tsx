import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Cube,
  Trophy,
  Medal,
  Hammer,
  Fire,
  FunnelSimple,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { durations } from "@/lib/animation";
import { formatTimeAgo } from "@/mocks/data";
import { type FeedItem, type FeedItemType } from "@/mocks/social";

type FilterTab = "all" | FeedItemType;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "block_found", label: "Blocks" },
  { id: "badge_earned", label: "Badges" },
  { id: "world_cup", label: "Competition" },
  { id: "new_miners", label: "Social" },
  { id: "streak_milestone", label: "Streaks" },
];

function getFeedIcon(type: FeedItemType) {
  switch (type) {
    case "block_found":
      return <Cube size={16} weight="duotone" className="text-gold" />;
    case "badge_earned":
      return <Medal size={16} weight="duotone" className="text-purple" />;
    case "world_cup":
      return <Trophy size={16} weight="duotone" className="text-cyan" />;
    case "new_miners":
      return <Hammer size={16} weight="duotone" className="text-green" />;
    case "streak_milestone":
      return <Fire size={16} weight="fill" className="text-bitcoin" />;
  }
}

function getFeedBg(type: FeedItemType) {
  switch (type) {
    case "block_found": return "bg-gold/10";
    case "badge_earned": return "bg-purple/10";
    case "world_cup": return "bg-cyan/10";
    case "new_miners": return "bg-green/10";
    case "streak_milestone": return "bg-bitcoin/10";
  }
}

interface ActivityFeedProps {
  items: FeedItem[];
  showFilters?: boolean;
  maxItems?: number;
  className?: string;
}

export function ActivityFeed({
  items,
  showFilters = true,
  maxItems = 20,
  className,
}: ActivityFeedProps) {
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");

  const filtered =
    activeFilter === "all"
      ? items.slice(0, maxItems)
      : items.filter((i) => i.type === activeFilter).slice(0, maxItems);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <FunnelSimple size={14} className="text-secondary flex-shrink-0" />
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={cn(
                "px-2.5 py-1 rounded-full text-micro font-medium whitespace-nowrap transition-colors",
                activeFilter === tab.id
                  ? "bg-bitcoin/10 text-bitcoin"
                  : "bg-elevated text-secondary hover:text-primary"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Feed items */}
      <AnimatePresence mode="popLayout">
        <div className="space-y-1">
          {filtered.map((item, i) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: durations.small, delay: i * 0.02 }}
              onClick={() => item.link && navigate(item.link)}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 rounded-radius-md transition-colors",
                item.link && "cursor-pointer hover:bg-spotlight/50"
              )}
            >
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                getFeedBg(item.type)
              )}>
                {getFeedIcon(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-caption text-primary leading-snug">{item.text}</p>
                <span className="text-micro text-secondary mt-0.5 block">
                  {formatTimeAgo(item.timestamp)}
                </span>
              </div>
            </motion.div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-8">
              <p className="text-caption text-secondary">No activity to show</p>
            </div>
          )}
        </div>
      </AnimatePresence>
    </div>
  );
}
