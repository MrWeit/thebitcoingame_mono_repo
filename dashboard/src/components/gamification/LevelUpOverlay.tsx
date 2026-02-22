import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { durations, easings, springs } from "@/lib/animation";
import { Mono } from "@/components/shared/Mono";
import { Display } from "@/components/shared/Display";

interface LevelUpOverlayProps {
  newLevel: number;
  newTitle: string;
  onDismiss: () => void;
  show: boolean;
}

// Placeholder sound function
function playSound(_name: string) {
  // Sound integration placeholder
}

function generateConfetti(count: number) {
  const colors = ["#F7931A", "#58A6FF", "#3FB950", "#A371F7", "#D4A843", "#E6EDF3"];
  return [...Array(count)].map((_, i) => ({
    id: i,
    x: -150 + Math.random() * 300,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 0.5,
    size: 3 + Math.random() * 4,
    rotation: Math.random() * 360,
  }));
}

function generateNumberParticles(count: number) {
  return [...Array(count)].map((_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const distance = 60 + Math.random() * 40;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      delay: Math.random() * 0.1,
    };
  });
}

export default function LevelUpOverlay({
  newLevel,
  newTitle,
  onDismiss,
  show,
}: LevelUpOverlayProps) {
  const prefersReduced = useReducedMotion();
  const [canDismiss, setCanDismiss] = useState(false);
  const [phase, setPhase] = useState(0);

  const confetti = generateConfetti(30);
  const numberParticles = generateNumberParticles(12);
  const prevLevel = newLevel - 1;

  useEffect(() => {
    if (!show) {
      setCanDismiss(false);
      setPhase(0);
      return;
    }

    playSound("level-up");

    // Phase progression
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase(1), 0));       // XP bar fills
    timers.push(setTimeout(() => setPhase(2), 300));      // White flash
    timers.push(setTimeout(() => setPhase(3), 500));      // Number explodes/reforms
    timers.push(setTimeout(() => setPhase(4), 800));      // Title sweeps in
    timers.push(setTimeout(() => setPhase(5), 1000));     // Congrats text
    timers.push(setTimeout(() => setPhase(6), 1500));     // Confetti
    timers.push(setTimeout(() => setPhase(7), 2000));     // XP bar resets
    timers.push(setTimeout(() => setCanDismiss(true), 2000));

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [show]);

  const handleDismiss = useCallback(() => {
    if (!canDismiss) return;
    onDismiss();
  }, [canDismiss, onDismiss]);

  // Reduced motion: simple display
  if (prefersReduced && show) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/70"
        onClick={onDismiss}
      >
        <div className="text-center">
          <div className="text-display-lg font-bold text-bitcoin mb-2">
            Level {newLevel}
          </div>
          <div className="text-headline text-primary font-semibold mb-4">
            {newTitle}
          </div>
          <div className="text-body text-secondary mb-6">
            Congratulations! Keep mining to reach the next level.
          </div>
          <div className="text-caption text-secondary">Tap to dismiss</div>
        </div>
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

          {/* White flash */}
          <AnimatePresence>
            {phase >= 2 && phase <= 3 && (
              <motion.div
                className="absolute inset-0 bg-white z-20"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations.small }}
              />
            )}
          </AnimatePresence>

          {/* XP bar at top */}
          <motion.div
            className="relative z-10 w-64 mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: durations.medium }}
          >
            <div className="flex items-center justify-between mb-1">
              <Mono className="text-micro text-secondary">
                {phase >= 7 ? `Level ${newLevel}` : `Level ${prevLevel}`}
              </Mono>
              <Mono className="text-micro text-secondary">
                {phase >= 7 ? "0%" : phase >= 1 ? "100%" : "85%"}
              </Mono>
            </div>
            <div className="relative h-2 rounded-radius-full bg-elevated overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-radius-full bg-gradient-to-r from-bitcoin to-[#E8720A]"
                initial={{ width: "85%" }}
                animate={{
                  width: phase >= 7 ? "0%" : phase >= 1 ? "100%" : "85%",
                }}
                transition={{ duration: durations.large, ease: easings.smooth }}
              />
            </div>
          </motion.div>

          {/* Level number display */}
          <div className="relative z-10 mb-4">
            {/* Old number particles (explosion) */}
            {phase >= 3 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                {numberParticles.map((p) => (
                  <motion.div
                    key={p.id}
                    className="absolute w-1.5 h-1.5 rounded-full bg-bitcoin"
                    initial={{ x: 0, y: 0, opacity: 1 }}
                    animate={{
                      x: p.x,
                      y: p.y,
                      opacity: 0,
                      scale: 0,
                    }}
                    transition={{
                      duration: durations.large,
                      delay: p.delay,
                      ease: easings.easeOut,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Level number */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={
                phase >= 3
                  ? { scale: [0, 1.2, 1], opacity: 1 }
                  : { scale: 0.8, opacity: 0 }
              }
              transition={{
                ...springs.bouncy,
                delay: phase >= 3 ? 0.1 : 0,
              }}
            >
              <Display
                as="h1"
                className={cn(
                  "text-[5rem] leading-none font-bold text-bitcoin",
                  "drop-shadow-[0_0_30px_rgba(247,147,26,0.5)]"
                )}
              >
                {newLevel}
              </Display>
            </motion.div>
          </div>

          {/* Title sweep in */}
          <motion.div
            className="relative z-10 overflow-hidden mb-2"
            initial={{ width: 0 }}
            animate={phase >= 4 ? { width: "auto" } : { width: 0 }}
            transition={{ duration: durations.large, ease: easings.snappy }}
          >
            <Display
              as="h2"
              className="text-headline font-semibold text-primary whitespace-nowrap px-1"
            >
              LEVEL {newLevel}: {newTitle}
            </Display>
          </motion.div>

          {/* Congrats text */}
          <motion.div
            className="relative z-10 text-center max-w-xs"
            initial={{ opacity: 0, y: 10 }}
            animate={phase >= 5 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: durations.large, delay: 0.1 }}
          >
            <p className="text-body text-secondary mb-1">
              Congratulations! You've reached a new level.
            </p>
            <p className="text-caption text-secondary">
              Keep mining to unlock more badges and rewards.
            </p>
          </motion.div>

          {/* Confetti */}
          {phase >= 6 && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
              {confetti.map((c) => (
                <motion.div
                  key={c.id}
                  className="absolute rounded-sm"
                  style={{
                    width: c.size,
                    height: c.size * 1.5,
                    backgroundColor: c.color,
                    left: "50%",
                    top: "-10px",
                    rotate: c.rotation,
                  }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{
                    x: c.x,
                    y: [0, window.innerHeight + 50],
                    opacity: [1, 1, 0],
                    rotate: c.rotation + 360 * (Math.random() > 0.5 ? 1 : -1),
                  }}
                  transition={{
                    duration: 2 + Math.random(),
                    delay: c.delay,
                    ease: easings.easeOut,
                  }}
                />
              ))}
            </div>
          )}

          {/* Dismiss hint */}
          <motion.div
            className="relative z-10 mt-8 text-caption text-secondary"
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
