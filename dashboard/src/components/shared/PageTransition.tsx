import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "react-router-dom";
import { pageTransition, pageTransitionConfig, noMotionTransition } from "../../lib/animation";
import { useReducedMotion } from "../../hooks/useReducedMotion";

interface PageTransitionProps {
  children: React.ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const location = useLocation();
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={pageTransition}
        transition={prefersReduced ? noMotionTransition : pageTransitionConfig}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
