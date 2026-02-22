import { useRef } from "react";
import { motion } from "framer-motion";
import { Medal, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { BadgeCard } from "@/components/ui/BadgeCard";
import { staggerContainer, staggerItem } from "@/lib/animation";
import { mockBadgesEarned } from "@/mocks/data";
import { useReducedMotion } from "@/hooks/useReducedMotion";

export function RecentBadges() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 200;
    scrollRef.current.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: prefersReduced ? "auto" : "smooth",
    });
  };

  /* Show most recent earned badges first */
  const sortedBadges = [...mockBadgesEarned]
    .filter((b) => b.earned)
    .sort((a, b) => {
      const dateA = a.earned?.date ? new Date(a.earned.date).getTime() : 0;
      const dateB = b.earned?.date ? new Date(b.earned.date).getTime() : 0;
      return dateB - dateA;
    });

  return (
    <Card variant="standard" padding="md" className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Medal size={18} weight="fill" className="text-purple" />
          <h3 className="text-body-lg font-semibold text-primary">
            Recent Badges
          </h3>
          <span className="text-micro text-secondary ml-1">
            {sortedBadges.length} earned
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => scroll("left")}
            className="w-7 h-7 rounded-radius-sm flex items-center justify-center text-secondary hover:text-primary hover:bg-spotlight transition-colors"
            aria-label="Scroll badges left"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
          <button
            onClick={() => scroll("right")}
            className="w-7 h-7 rounded-radius-sm flex items-center justify-center text-secondary hover:text-primary hover:bg-spotlight transition-colors"
            aria-label="Scroll badges right"
          >
            <CaretRight size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Horizontal scroll of badge cards */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        <motion.div
          className="flex gap-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          {sortedBadges.map((badge) => (
            <motion.div
              key={badge.slug}
              variants={staggerItem}
              className="flex-shrink-0"
              style={{ width: 140 }}
            >
              <BadgeCard
                badge={{
                  slug: badge.slug,
                  name: badge.name,
                  description: badge.description,
                  rarity: badge.rarity,
                }}
                earned={badge.earned}
                className="h-full"
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* View all link */}
      <div className="mt-3 pt-3 border-t border-white/4 text-center">
        <a
          href="/profile/badges"
          className="text-caption text-cyan hover:text-primary transition-colors font-medium"
        >
          View All Badges
        </a>
      </div>
    </Card>
  );
}
