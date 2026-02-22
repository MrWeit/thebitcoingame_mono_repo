import { useState, useCallback, type ComponentType } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gauge,
  GameController,
  Medal,
  Trophy,
  type IconProps,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Display } from "@/components/shared/Display";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { modalBackdrop, durations } from "@/lib/animation";

/* ── Types ── */
interface SpotlightTourProps {
  open: boolean;
  onComplete: () => void;
}

interface TourStop {
  icon: ComponentType<IconProps>;
  title: string;
  description: string;
  color: string;
  bgColor: string;
}

/* ── Tour stops ── */
const TOUR_STOPS: TourStop[] = [
  {
    icon: Gauge,
    title: "Difficulty Meter",
    description:
      "This is where the magic happens. Your best hash of the week lives here.",
    color: "text-cyan",
    bgColor: "bg-cyan/10",
  },
  {
    icon: GameController,
    title: "Games",
    description:
      "Check here every Sunday to play the weekly lottery with your mining results.",
    color: "text-purple",
    bgColor: "bg-purple/10",
  },
  {
    icon: Medal,
    title: "Badge Collection",
    description:
      "Earn badges as you mine. Collect them all!",
    color: "text-gold",
    bgColor: "bg-gold/10",
  },
  {
    icon: Trophy,
    title: "Leaderboard",
    description:
      "See how you rank against miners worldwide.",
    color: "text-green",
    bgColor: "bg-green/10",
  },
];

/* ── Slide animation ── */
const cardVariants = {
  enter: { opacity: 0, y: 30, scale: 0.97 },
  center: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -20, scale: 0.97 },
};

/* ── SpotlightTour ── */
export function SpotlightTour({ open, onComplete }: SpotlightTourProps) {
  const reduced = useReducedMotion();
  const [currentStop, setCurrentStop] = useState(0);

  const totalStops = TOUR_STOPS.length;
  const stop = TOUR_STOPS[currentStop];

  const handleNext = useCallback(() => {
    if (currentStop < totalStops - 1) {
      setCurrentStop((s) => s + 1);
    } else {
      onComplete();
    }
  }, [currentStop, totalStops, onComplete]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <motion.div
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: durations.small }}
            onClick={handleSkip}
            className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
          />

          {/* Tour card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStop}
              variants={reduced ? undefined : cardVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={
                reduced
                  ? { duration: 0.01 }
                  : { type: "spring", stiffness: 300, damping: 25, duration: 0.4 }
              }
              className={cn(
                "relative w-full max-w-[420px]",
                "bg-surface rounded-radius-lg border border-white/8 shadow-heavy",
                "p-6 sm:p-8"
              )}
            >
              {/* Step counter */}
              <div className="text-caption text-secondary mb-6 text-center">
                {currentStop + 1} of {totalStops}
              </div>

              {/* Icon */}
              <motion.div
                initial={reduced ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={
                  reduced
                    ? { duration: 0.01 }
                    : { type: "spring", stiffness: 400, damping: 20, delay: 0.1 }
                }
                className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5",
                  stop.bgColor
                )}
              >
                <stop.icon
                  weight="duotone"
                  className={cn("w-8 h-8", stop.color)}
                />
              </motion.div>

              {/* Title and description */}
              <Display
                as="h3"
                className="text-title text-primary text-center mb-3"
              >
                {stop.title}
              </Display>
              <p className="text-body text-secondary text-center mb-8 max-w-xs mx-auto">
                {stop.description}
              </p>

              {/* Progress dots */}
              <div className="flex items-center justify-center gap-2 mb-6">
                {TOUR_STOPS.map((_, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "w-2 h-2 rounded-full transition-colors duration-300",
                      idx === currentStop
                        ? "bg-bitcoin"
                        : idx < currentStop
                          ? "bg-green"
                          : "bg-white/10"
                    )}
                  />
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  fullWidth
                  onClick={handleNext}
                >
                  {currentStop < totalStops - 1 ? "Next" : "Done"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={handleSkip}
                >
                  Skip Tour
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
}
