import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { springs, durations, easings, overlayBackdrop } from "@/lib/animation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";

/* ══════════════════════════════════════════════════════
   BLOCK FOUND CELEBRATION
   The most important animation in the entire app.
   Full-screen timed sequence celebrating a mined block.
   ══════════════════════════════════════════════════════ */

interface BlockFoundCelebrationProps {
  isOpen: boolean;
  onClose: () => void;
  blockHeight: number;
  reward: number;
  fiatValue?: number;
  isFirstBlock?: boolean;
  onShareClick?: () => void;
  onViewDetailsClick?: () => void;
}

/* ── Gold Particle Generator ── */
function generateGoldParticles(count: number) {
  return [...Array(count)].map((_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: Math.random() * 2,
    duration: 3 + Math.random() * 4,
    size: 2 + Math.random() * 4,
    opacity: 0.3 + Math.random() * 0.7,
    sway: -30 + Math.random() * 60,
  }));
}

/* ── Confetti Cannons ── */
function fireConfettiCannons() {
  const colors = ["#F7931A", "#D4A843", "#FFD700"];

  // Left cannon
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { x: 0.1, y: 0.6 },
    colors,
    disableForReducedMotion: true,
  });

  // Right cannon
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { x: 0.9, y: 0.6 },
    colors,
    disableForReducedMotion: true,
  });
}

/* ── Phase Constants ── */
const PHASE = {
  IDLE: 0,
  OVERLAY: 1,       // 0.0s — dark overlay fades in
  GOLD_GLOW: 2,     // 0.3s — screen edges glow gold
  FLASH: 3,         // 1.0s — white flash
  PARTICLES: 4,     // 1.2s — gold particle rain
  SYMBOL: 5,        // 1.5s — giant bitcoin symbol
  HEADLINE: 6,      // 2.0s — "YOU FOUND A BLOCK"
  BLOCK_HEIGHT: 7,  // 2.5s — block height flies in
  REWARD: 8,        // 3.0s — reward drops in
  FIAT: 9,          // 3.5s — fiat equivalent fades
  CONFETTI: 10,     // 4.0s — confetti cannons
  BUTTONS: 11,      // 5.0s — action buttons
} as const;

const PHASE_TIMINGS = [
  { phase: PHASE.OVERLAY, delay: 0 },
  { phase: PHASE.GOLD_GLOW, delay: 300 },
  { phase: PHASE.FLASH, delay: 1000 },
  { phase: PHASE.PARTICLES, delay: 1200 },
  { phase: PHASE.SYMBOL, delay: 1500 },
  { phase: PHASE.HEADLINE, delay: 2000 },
  { phase: PHASE.BLOCK_HEIGHT, delay: 2500 },
  { phase: PHASE.REWARD, delay: 3000 },
  { phase: PHASE.FIAT, delay: 3500 },
  { phase: PHASE.CONFETTI, delay: 4000 },
  { phase: PHASE.BUTTONS, delay: 5000 },
];

export default function BlockFoundCelebration({
  isOpen,
  onClose,
  blockHeight,
  reward,
  fiatValue,
  isFirstBlock = false,
  onShareClick,
  onViewDetailsClick,
}: BlockFoundCelebrationProps) {
  const prefersReduced = useReducedMotion();
  const [phase, setPhase] = useState<number>(PHASE.IDLE);
  const [showFlash, setShowFlash] = useState(false);

  const goldParticles = useMemo(() => generateGoldParticles(20), []);

  /* ── Format display values ── */
  const formattedBlockHeight = `#${blockHeight.toLocaleString()}`;
  const formattedReward = `${reward.toFixed(3)} BTC`;
  const formattedFiat = fiatValue
    ? `\u2248 $${fiatValue.toLocaleString()}`
    : null;

  const headlineText = isFirstBlock
    ? "YOU FOUND YOUR FIRST BLOCK"
    : "YOU FOUND A BLOCK";

  /* ── Phase Progression ── */
  useEffect(() => {
    if (!isOpen) {
      setPhase(PHASE.IDLE);
      setShowFlash(false);
      return;
    }

    if (prefersReduced) {
      // Skip to fully revealed state immediately
      setPhase(PHASE.BUTTONS);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    for (const { phase: p, delay } of PHASE_TIMINGS) {
      timers.push(setTimeout(() => setPhase(p), delay));
    }

    // Flash is a single 200ms event for WCAG compliance
    timers.push(
      setTimeout(() => setShowFlash(true), 1000),
      setTimeout(() => setShowFlash(false), 1200)
    );

    // Fire confetti at phase 10
    timers.push(setTimeout(() => fireConfettiCannons(), 4000));

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [isOpen, prefersReduced]);

  /* ── Backdrop click handler ── */
  const handleBackdropClick = useCallback(() => {
    if (phase >= PHASE.BUTTONS) {
      onClose();
    }
  }, [phase, onClose]);

  /* ── Reduced Motion: simple centered modal ── */
  if (prefersReduced && isOpen) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Block found celebration"
      >
        <div
          className="flex flex-col items-center text-center px-6 max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Bitcoin Symbol */}
          <div className="text-[120px] font-bold text-bitcoin leading-none mb-4">
            &#x20BF;
          </div>

          {/* Headline */}
          <h1 className="text-display-lg font-bold tracking-wider text-primary mb-3">
            {headlineText}
          </h1>

          {/* Block Height */}
          <div className="text-title font-mono text-secondary mb-4">
            {formattedBlockHeight}
          </div>

          {/* Reward */}
          <div className="text-display-md font-bold font-mono text-bitcoin mb-2">
            {formattedReward}
          </div>

          {/* Fiat Value */}
          {formattedFiat && (
            <div className="text-headline text-secondary mb-8">
              {formattedFiat}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3 mt-4">
            {onShareClick && (
              <Button variant="primary" size="lg" onClick={onShareClick}>
                Share This Moment
              </Button>
            )}
            {onViewDetailsClick && (
              <Button variant="secondary" size="lg" onClick={onViewDetailsClick}>
                View Block Details
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ── Full Motion Celebration ── */
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
          onClick={handleBackdropClick}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: durations.small }}
          role="dialog"
          aria-modal="true"
          aria-label="Block found celebration"
        >
          {/* ── Phase 1: Dark Overlay ── */}
          <motion.div
            className="absolute inset-0 bg-black/90"
            variants={overlayBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, ease: easings.smooth }}
          />

          {/* ── Phase 2: Gold Edge Glow ── */}
          <AnimatePresence>
            {phase >= PHASE.GOLD_GLOW && (
              <motion.div
                className="absolute inset-0 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                style={{
                  boxShadow: "inset 0 0 100px rgba(247,147,26,0.3)",
                }}
              >
                {/* Pulsing glow layer */}
                <div
                  className="absolute inset-0"
                  style={{
                    animation: "block-found-glow 2s ease-in-out infinite",
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Phase 3: White Flash (single 200ms event) ── */}
          <AnimatePresence>
            {showFlash && (
              <motion.div
                className="absolute inset-0 bg-white z-50 pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.1 }}
              />
            )}
          </AnimatePresence>

          {/* ── Phase 4: Gold Particle Rain ── */}
          {phase >= PHASE.PARTICLES && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
              {goldParticles.map((p) => (
                <motion.div
                  key={p.id}
                  className="absolute rounded-full"
                  style={{
                    left: p.left,
                    top: -10,
                    width: p.size,
                    height: p.size,
                    backgroundColor: "#F7931A",
                  }}
                  initial={{ y: -10, opacity: 0, x: 0 }}
                  animate={{
                    y: [0, window.innerHeight + 20],
                    opacity: [0, p.opacity, p.opacity, 0],
                    x: [0, p.sway],
                  }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                />
              ))}
            </div>
          )}

          {/* ── Content Container ── */}
          <div
            className="relative z-20 flex flex-col items-center text-center px-6 max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Phase 5: Giant Bitcoin Symbol ── */}
            <AnimatePresence>
              {phase >= PHASE.SYMBOL && (
                <motion.div
                  className={cn(
                    "text-[120px] font-bold leading-none text-bitcoin",
                    "drop-shadow-[0_0_60px_rgba(247,147,26,0.6)]"
                  )}
                  initial={{ scale: 0, opacity: 0, rotate: -15 }}
                  animate={{
                    scale: [0, 1.2, 1.0],
                    opacity: 1,
                    rotate: [-15, 5, -3, 1, 0],
                  }}
                  transition={{
                    scale: { ...springs.reward, duration: 0.8 },
                    rotate: {
                      duration: 1.2,
                      ease: easings.smooth,
                      times: [0, 0.3, 0.5, 0.7, 1],
                    },
                    opacity: { duration: 0.2 },
                  }}
                >
                  &#x20BF;
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Phase 6: "YOU FOUND A BLOCK" Typewriter ── */}
            <AnimatePresence>
              {phase >= PHASE.HEADLINE && (
                <motion.h1
                  className="text-display-lg font-bold tracking-wider text-primary mt-4 mb-3"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 1 }}
                  aria-label={headlineText}
                >
                  {headlineText.split("").map((char, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        delay: i * 0.03,
                        duration: 0.05,
                      }}
                    >
                      {char}
                    </motion.span>
                  ))}
                </motion.h1>
              )}
            </AnimatePresence>

            {/* ── Phase 7: Block Height ── */}
            <AnimatePresence>
              {phase >= PHASE.BLOCK_HEIGHT && (
                <motion.div
                  className="text-title font-mono text-secondary mb-4"
                  initial={{ y: -60, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={springs.bouncy}
                >
                  {formattedBlockHeight}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Phase 8: Reward Amount ── */}
            <AnimatePresence>
              {phase >= PHASE.REWARD && (
                <motion.div
                  className={cn(
                    "text-display-md font-bold font-mono text-bitcoin mb-2",
                    "drop-shadow-[0_0_30px_rgba(247,147,26,0.4)]"
                  )}
                  initial={{ y: -80, opacity: 0, scale: 0.8 }}
                  animate={{
                    y: [-80, 8, -3, 0],
                    opacity: 1,
                    scale: [0.8, 1.05, 0.98, 1],
                  }}
                  transition={{
                    duration: 0.7,
                    ease: easings.smooth,
                    times: [0, 0.5, 0.75, 1],
                  }}
                >
                  {formattedReward}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Phase 9: Fiat Equivalent ── */}
            <AnimatePresence>
              {phase >= PHASE.FIAT && formattedFiat && (
                <motion.div
                  className="text-headline text-secondary mb-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{
                    duration: durations.medium,
                    ease: easings.gentle,
                  }}
                >
                  {formattedFiat}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── First Block Extra Flair ── */}
            <AnimatePresence>
              {phase >= PHASE.FIAT && isFirstBlock && (
                <motion.div
                  className={cn(
                    "text-caption font-semibold tracking-widest uppercase mb-4",
                    "text-gold drop-shadow-[0_0_12px_rgba(212,168,67,0.5)]"
                  )}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: 0.2,
                    duration: durations.medium,
                    ease: easings.smooth,
                  }}
                >
                  A Historic Moment
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Phase 11: Action Buttons ── */}
            <AnimatePresence>
              {phase >= PHASE.BUTTONS && (
                <motion.div
                  className="flex flex-col sm:flex-row items-center gap-3 mt-6"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: durations.medium,
                    ease: easings.gentle,
                  }}
                >
                  {onShareClick && (
                    <Button variant="primary" size="lg" onClick={onShareClick}>
                      Share This Moment
                    </Button>
                  )}
                  {onViewDetailsClick && (
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={onViewDetailsClick}
                    >
                      View Block Details
                    </Button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Inline Keyframes for Gold Glow Pulse ── */}
          <style>{`
            @keyframes block-found-glow {
              0%, 100% {
                box-shadow: inset 0 0 100px rgba(247,147,26,0.2);
              }
              50% {
                box-shadow: inset 0 0 150px rgba(247,147,26,0.4);
              }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
