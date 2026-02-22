import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FunnelSimple, Trophy, SortAscending } from "@phosphor-icons/react";
import { type BadgeDefinition, type BadgeCategory, type BadgeRarity } from "@/mocks/badges";
import {
  badgeCatalog,
  isEarned,
  getEarnedCount,
  getTotalCount,
  rarityPercentages,
  getBadgeDefinition,
} from "@/mocks/badges";
import { PageTransition } from "@/components/shared/PageTransition";
import { Display } from "@/components/shared/Display";
import { Mono } from "@/components/shared/Mono";
import { BadgeCard } from "@/components/ui/BadgeCard";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import XPBar from "@/components/gamification/XPBar";
import BadgeEarnOverlay from "@/components/gamification/BadgeEarnOverlay";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";

type CategoryFilter = "all" | BadgeCategory;
type SortMode = "newest" | "rarity";

const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mining", label: "Mining" },
  { key: "streak", label: "Streaks" },
  { key: "competition", label: "Competition" },
  { key: "social", label: "Social" },
  { key: "node", label: "Node" },
];

const RARITY_FILTERS: { key: BadgeRarity; label: string; color: string }[] = [
  { key: "common", label: "Common", color: "#8B949E" },
  { key: "rare", label: "Rare", color: "#58A6FF" },
  { key: "epic", label: "Epic", color: "#A371F7" },
  { key: "legendary", label: "Legendary", color: "#D4A843" },
];

const RARITY_ORDER: Record<BadgeRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

// Demo badge for overlay
const DEMO_BADGE = getBadgeDefinition("block_finder")!;
const DEMO_EARNED = { slug: "block_finder", date: new Date(), metadata: { blockHeight: "879,234" } };

export default function BadgesPage() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [activeRarities, setActiveRarities] = useState<Set<BadgeRarity>>(
    new Set(["common", "rare", "epic", "legendary"])
  );
  const [sort, setSort] = useState<SortMode>("newest");
  const [selectedBadge, setSelectedBadge] = useState<BadgeDefinition | null>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [shakeSlug, setShakeSlug] = useState<string | null>(null);
  const [animatedCount, setAnimatedCount] = useState(0);

  const earnedCount = getEarnedCount();
  const totalCount = getTotalCount();

  // Animated count-up on mount
  useEffect(() => {
    if (animatedCount >= earnedCount) return;
    const step = Math.ceil(earnedCount / 20);
    const timer = setTimeout(() => {
      setAnimatedCount((prev) => Math.min(prev + step, earnedCount));
    }, 50);
    return () => clearTimeout(timer);
  }, [animatedCount, earnedCount]);

  const toggleRarity = useCallback((rarity: BadgeRarity) => {
    setActiveRarities((prev) => {
      const next = new Set(prev);
      if (next.has(rarity)) {
        // Don't allow removing all
        if (next.size <= 1) return prev;
        next.delete(rarity);
      } else {
        next.add(rarity);
      }
      return next;
    });
  }, []);

  const filteredBadges = useMemo(() => {
    let badges = [...badgeCatalog];

    // Category filter
    if (category !== "all") {
      badges = badges.filter((b) => b.category === category);
    }

    // Rarity filter
    badges = badges.filter((b) => activeRarities.has(b.rarity));

    // Sort
    if (sort === "newest") {
      badges.sort((a, b) => {
        const aEarned = isEarned(a.slug);
        const bEarned = isEarned(b.slug);
        if (aEarned && bEarned) {
          return bEarned.date.getTime() - aEarned.date.getTime();
        }
        if (aEarned && !bEarned) return -1;
        if (!aEarned && bEarned) return 1;
        return 0;
      });
    } else {
      badges.sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
    }

    return badges;
  }, [category, activeRarities, sort]);

  const handleBadgeClick = useCallback((badge: BadgeDefinition) => {
    const earned = isEarned(badge.slug);
    if (earned) {
      setSelectedBadge(badge);
    } else {
      setShakeSlug(badge.slug);
      setTimeout(() => setShakeSlug(null), 600);
    }
  }, []);

  const selectedEarned = selectedBadge ? isEarned(selectedBadge.slug) : undefined;

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 pb-24">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div>
              <Display as="h1" className="text-display-md font-bold text-primary mb-2">
                Your Collection
              </Display>
              <p className="text-body text-secondary">
                <Mono className="text-bitcoin font-semibold">{animatedCount}</Mono>
                {" / "}
                <Mono>{totalCount}</Mono>
                {" badges earned"}
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Trophy size={16} weight="fill" />}
              onClick={() => setShowOverlay(true)}
            >
              Demo Badge Earn
            </Button>
          </div>

          {/* Collection progress bar */}
          <XPBar
            current={earnedCount}
            max={totalCount}
            showLabel={false}
            size="sm"
          />
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Category tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            <FunnelSimple size={16} className="text-secondary flex-shrink-0 mr-1" />
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  "px-3 py-1.5 rounded-radius-full text-caption font-medium transition-colors whitespace-nowrap",
                  category === cat.key
                    ? "bg-bitcoin/15 text-bitcoin"
                    : "bg-elevated text-secondary hover:text-primary hover:bg-spotlight"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Rarity toggles + Sort */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              {RARITY_FILTERS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => toggleRarity(r.key)}
                  className={cn(
                    "px-2.5 py-1 rounded-radius-full text-micro font-medium transition-all border",
                    activeRarities.has(r.key)
                      ? "border-current"
                      : "border-transparent opacity-40"
                  )}
                  style={{
                    color: r.color,
                    backgroundColor: activeRarities.has(r.key) ? `${r.color}15` : "transparent",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSort((prev) => (prev === "newest" ? "rarity" : "newest"))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-radius-sm text-caption text-secondary hover:text-primary transition-colors"
            >
              <SortAscending size={14} />
              {sort === "newest" ? "Newest First" : "By Rarity"}
            </button>
          </div>
        </div>

        {/* Badge Grid */}
        <motion.div
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <AnimatePresence mode="popLayout">
            {filteredBadges.map((badge) => {
              const earned = isEarned(badge.slug);
              const isShaking = shakeSlug === badge.slug;

              return (
                <motion.div
                  key={badge.slug}
                  variants={staggerItem}
                  layout
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="relative">
                    <BadgeCard
                      badge={badge}
                      earned={earned}
                      onClick={() => handleBadgeClick(badge)}
                      className={isShaking ? "animate-[shake_0.4s_ease-in-out]" : ""}
                    />

                    {/* "Keep mining!" tooltip on locked shake */}
                    <AnimatePresence>
                      {isShaking && !earned && (
                        <motion.div
                          className="absolute -top-8 left-1/2 -translate-x-1/2 bg-floating text-micro text-bitcoin px-2 py-1 rounded-radius-sm whitespace-nowrap shadow-medium z-10"
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          transition={{ duration: 0.2 }}
                        >
                          Keep mining!
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* Empty state */}
        {filteredBadges.length === 0 && (
          <div className="text-center py-16">
            <p className="text-body text-secondary">No badges match your filters.</p>
          </div>
        )}

        {/* Badge Detail Modal */}
        <Modal
          open={!!selectedBadge}
          onClose={() => setSelectedBadge(null)}
          title="Badge Details"
          maxWidth="sm"
        >
          {selectedBadge && selectedEarned && (
            <div className="flex flex-col items-center text-center">
              {/* Icon */}
              <div
                className="w-20 h-20 rounded-full bg-elevated flex items-center justify-center mb-4"
                style={{
                  border: `2px solid ${
                    selectedBadge.rarity === "legendary" ? "#D4A843"
                    : selectedBadge.rarity === "epic" ? "#A371F7"
                    : selectedBadge.rarity === "rare" ? "#58A6FF"
                    : "#8B949E"
                  }`,
                }}
              >
                <span className="text-3xl">&#x1F3C6;</span>
              </div>

              {/* Name */}
              <h3 className="text-title font-bold text-primary mb-1">
                {selectedBadge.name}
              </h3>

              {/* Description */}
              <p className="text-body text-secondary mb-3">
                {selectedBadge.description}
              </p>

              {/* Rarity tag */}
              <Tag variant="rarity" rarity={selectedBadge.rarity}>
                {selectedBadge.rarity.charAt(0).toUpperCase() + selectedBadge.rarity.slice(1)}
              </Tag>

              {/* Stats */}
              <div className="mt-4 w-full space-y-2 text-left">
                <div className="flex items-center justify-between py-2 border-b border-white/6">
                  <span className="text-caption text-secondary">Earned</span>
                  <Mono className="text-caption text-primary">
                    {selectedEarned.date.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Mono>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/6">
                  <span className="text-caption text-secondary">XP Reward</span>
                  <Mono className="text-caption text-bitcoin">
                    +{selectedBadge.xpReward} XP
                  </Mono>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-white/6">
                  <span className="text-caption text-secondary">Miners who have this</span>
                  <Mono className="text-caption text-primary">
                    {rarityPercentages[selectedBadge.slug] ?? 0}%
                  </Mono>
                </div>
                {selectedEarned.metadata && (
                  <>
                    {Object.entries(selectedEarned.metadata).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-white/6">
                        <span className="text-caption text-secondary capitalize">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                        <Mono className="text-caption text-primary">{value}</Mono>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </Modal>

        {/* Badge Earn Overlay Demo */}
        <BadgeEarnOverlay
          badge={DEMO_BADGE}
          earned={DEMO_EARNED}
          onDismiss={() => setShowOverlay(false)}
          show={showOverlay}
        />

        {/* Shake keyframe */}
        <style>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-4px); }
            40% { transform: translateX(4px); }
            60% { transform: translateX(-4px); }
            80% { transform: translateX(4px); }
          }
        `}</style>
      </div>
    </PageTransition>
  );
}
