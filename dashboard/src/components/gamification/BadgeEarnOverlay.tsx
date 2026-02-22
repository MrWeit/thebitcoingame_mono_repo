import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type EarnedBadge } from "@/mocks/badges";
import XPFloatUp from "@/components/gamification/XPFloatUp";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { durations, easings, springs, transitions } from "@/lib/animation";

interface BadgeForOverlay {
  slug: string;
  name: string;
  description: string;
  rarity: string;
  xpReward: number;
  iconUrl?: string;
}

interface BadgeEarnOverlayProps {
  badge: BadgeForOverlay;
  earned: EarnedBadge;
  onDismiss: () => void;
  show: boolean;
}

const RARITY_COLORS: Record<string, string> = {
  common: "#8B949E",
  rare: "#58A6FF",
  epic: "#A371F7",
  legendary: "#D4A843",
};

const RARITY_LABELS: Record<string, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

// Placeholder sound function
function playSound(_name: string) {
  // Sound integration placeholder
}

function generateParticles(count: number, color: string) {
  return [...Array(count)].map((_, i) => {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = 80 + Math.random() * 100;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      size: 3 + Math.random() * 5,
      color,
      delay: Math.random() * 0.2,
    };
  });
}

export default function BadgeEarnOverlay({
  badge,
  earned,
  onDismiss,
  show,
}: BadgeEarnOverlayProps) {
  const prefersReduced = useReducedMotion();
  const [canDismiss, setCanDismiss] = useState(false);
  const [showXP, setShowXP] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const rarityColor = RARITY_COLORS[badge.rarity] ?? RARITY_COLORS.common;
  const particles = generateParticles(16, rarityColor);

  useEffect(() => {
    if (!show) {
      setCanDismiss(false);
      setShowXP(false);
      setIsDismissing(false);
      return;
    }

    playSound("badge-earn");

    const xpTimer = setTimeout(() => setShowXP(true), 2000);
    const dismissTimer = setTimeout(() => setCanDismiss(true), 3000);

    return () => {
      clearTimeout(xpTimer);
      clearTimeout(dismissTimer);
    };
  }, [show]);

  const handleDismiss = useCallback(() => {
    if (!canDismiss) return;
    setIsDismissing(true);
    // Small delay for exit animation
    setTimeout(() => {
      onDismiss();
    }, 400);
  }, [canDismiss, onDismiss]);

  // Reduced motion: simple centered display
  if (prefersReduced && show) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70"
        onClick={onDismiss}
      >
        <div className="text-headline font-semibold text-primary mb-4">
          Achievement Unlocked!
        </div>
        <div
          className="bg-surface rounded-radius-lg p-6 border-2 flex flex-col items-center text-center max-w-xs"
          style={{ borderColor: rarityColor }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="w-20 h-20 rounded-full bg-elevated flex items-center justify-center mb-4"
            style={{ border: `2px solid ${rarityColor}` }}
          >
            {badge.iconUrl ? (
              <img src={badge.iconUrl} alt={badge.name} className="w-12 h-12" />
            ) : (
              <span className="text-3xl">&#x1F3C6;</span>
            )}
          </div>
          <div className="text-title font-bold text-primary mb-1">{badge.name}</div>
          <div className="text-caption text-secondary mb-3">{badge.description}</div>
          <div
            className="text-micro font-medium px-2 py-0.5 rounded-radius-full"
            style={{
              color: rarityColor,
              backgroundColor: `${rarityColor}15`,
            }}
          >
            {RARITY_LABELS[badge.rarity]}
          </div>
          <div className="mt-3">
            <span className="font-mono text-bitcoin font-semibold">
              +{badge.xpReward} XP
            </span>
          </div>
        </div>
        <div className="mt-4 text-micro text-secondary">
          Earned {earned.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </div>
        <div className="mt-6 text-caption text-secondary">Tap anywhere to dismiss</div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          onClick={handleDismiss}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durations.medium }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.medium }}
          />

          {/* Achievement Unlocked text */}
          <motion.div
            className="relative z-10 text-headline font-bold text-primary mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: durations.large }}
          >
            Achievement Unlocked!
          </motion.div>

          {/* Badge card container */}
          <motion.div
            className="relative z-10"
            initial={{ y: 300, opacity: 0 }}
            animate={
              isDismissing
                ? { x: "40vw", y: "-40vh", scale: 0.2, opacity: 0 }
                : { y: 0, opacity: 1 }
            }
            transition={
              isDismissing
                ? { duration: durations.large, ease: easings.snappy }
                : { ...springs.bouncy, delay: 0.3 }
            }
            onClick={(e) => e.stopPropagation()}
          >
            {/* Card with 3D flip */}
            <motion.div
              className="relative"
              style={{ perspective: 1000 }}
            >
              <motion.div
                className="relative"
                initial={{ rotateY: 180 }}
                animate={{ rotateY: 0 }}
                transition={{ delay: 0.6, ...transitions.flip }}
                style={{ transformStyle: "preserve-3d" }}
              >
                {/* Front face (revealed) */}
                <div
                  className={cn(
                    "bg-surface rounded-radius-lg p-8 border-2 flex flex-col items-center text-center",
                    "w-[280px] shadow-heavy"
                  )}
                  style={{ borderColor: rarityColor, backfaceVisibility: "hidden" }}
                >
                  {/* Badge icon with scale animation */}
                  <motion.div
                    className="w-24 h-24 rounded-full bg-elevated flex items-center justify-center mb-4 relative"
                    style={{ border: `3px solid ${rarityColor}` }}
                    initial={{ scale: 1 }}
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ delay: 1.0, duration: durations.large, ease: easings.smooth }}
                  >
                    {badge.iconUrl ? (
                      <img src={badge.iconUrl} alt={badge.name} className="w-14 h-14 object-contain" />
                    ) : (
                      <span className="text-4xl">&#x1F3C6;</span>
                    )}
                  </motion.div>

                  {/* Badge name */}
                  <motion.div
                    className="text-title font-bold text-primary mb-1"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.8, duration: durations.medium }}
                  >
                    {badge.name}
                  </motion.div>

                  {/* Badge description */}
                  <motion.div
                    className="text-caption text-secondary mb-3"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.9, duration: durations.medium }}
                  >
                    {badge.description}
                  </motion.div>

                  {/* Rarity tag */}
                  <motion.div
                    className="text-micro font-medium px-3 py-1 rounded-radius-full"
                    style={{
                      color: rarityColor,
                      backgroundColor: `${rarityColor}15`,
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1.8, duration: durations.medium }}
                  >
                    {RARITY_LABELS[badge.rarity]}
                  </motion.div>

                  {/* XP float up */}
                  <div className="mt-4 h-8 relative flex items-center justify-center">
                    <XPFloatUp amount={badge.xpReward} show={showXP} />
                  </div>
                </div>
              </motion.div>
            </motion.div>

            {/* Rarity particles burst */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              {particles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    width: p.size,
                    height: p.size,
                    backgroundColor: p.color,
                  }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{
                    x: p.x,
                    y: p.y,
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                  }}
                  transition={{
                    delay: 1.3 + p.delay,
                    duration: durations.large,
                    ease: easings.easeOut,
                  }}
                />
              ))}
            </div>
          </motion.div>

          {/* Earned date */}
          <motion.div
            className="relative z-10 mt-3 text-micro text-secondary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.0, duration: durations.medium }}
          >
            Earned {earned.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </motion.div>

          {/* Dismiss hint */}
          <motion.div
            className="relative z-10 mt-6 text-caption text-secondary"
            initial={{ opacity: 0 }}
            animate={{ opacity: canDismiss ? 0.7 : 0 }}
            transition={{ duration: durations.medium }}
          >
            Tap anywhere to dismiss
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
