import { motion, AnimatePresence } from "framer-motion";
import { Mono } from "@/components/shared/Mono";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { durations, easings } from "@/lib/animation";

interface XPFloatUpProps {
  amount: number;
  onComplete?: () => void;
  show: boolean;
}

export default function XPFloatUp({
  amount,
  onComplete,
  show,
}: XPFloatUpProps) {
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none"
          initial={
            prefersReduced
              ? { opacity: 1, y: 0 }
              : { opacity: 1, y: 0, scale: 0.8 }
          }
          animate={
            prefersReduced
              ? { opacity: 1, y: 0 }
              : { opacity: 1, y: -40, scale: 1 }
          }
          exit={
            prefersReduced
              ? { opacity: 0 }
              : { opacity: 0, y: -60, scale: 0.9 }
          }
          transition={
            prefersReduced
              ? { duration: durations.medium }
              : { duration: durations.xl, ease: easings.smooth }
          }
          onAnimationComplete={() => {
            onComplete?.();
          }}
        >
          <Mono className="text-bitcoin font-semibold text-body-lg drop-shadow-[0_0_8px_rgba(247,147,26,0.5)]">
            +{amount.toLocaleString()} XP
          </Mono>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
