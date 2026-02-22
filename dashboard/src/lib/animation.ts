import type { Transition, Variants } from "framer-motion";

/* ══════════════════════════════════════════════════════
   THE BITCOIN GAME — Centralized Animation Config
   Single source of truth for ALL animation values.
   ══════════════════════════════════════════════════════ */

/* ── Timing Curves (Framer Motion transition.ease) ── */
export const easings = {
  smooth: [0.25, 0.1, 0.25, 1.0] as const,
  snappy: [0.2, 0, 0, 1.0] as const,
  dramatic: [0.7, 0, 0.3, 1.0] as const,
  gentle: [0.4, 0, 0.2, 1.0] as const,
  easeOut: [0.0, 0, 0.2, 1.0] as const,
  easeIn: [0.4, 0, 1, 1] as const,
};

/* ── Spring Presets (Framer Motion transition) ── */
export const springs = {
  bouncy: { type: "spring" as const, stiffness: 300, damping: 20 },
  stiff: { type: "spring" as const, stiffness: 400, damping: 30 },
  gentle: { type: "spring" as const, stiffness: 200, damping: 25 },
  light: { type: "spring" as const, stiffness: 100, damping: 30 },
  meter: { type: "spring" as const, stiffness: 60, damping: 20 },
  reel: { type: "spring" as const, stiffness: 200, damping: 18, mass: 1.2 },
  reward: { type: "spring" as const, stiffness: 200, damping: 15, mass: 1.2 },
};

/* ── Duration Presets (seconds) ── */
export const durations = {
  micro: 0.12,
  small: 0.2,
  medium: 0.35,
  large: 0.5,
  xl: 1.5,
  dramatic: 1.2,
  epic: 4,
};

/* ── Stagger Presets (seconds between children) ── */
export const staggers = {
  fast: 0.03,
  default: 0.05,
  slow: 0.08,
  row: 0.1,
};

/* ── Common Transition Configs ── */
export const transitions = {
  snappy: { duration: durations.small, ease: easings.snappy } as Transition,
  smooth: { duration: durations.medium, ease: easings.smooth } as Transition,
  gentle: { duration: durations.large, ease: easings.gentle } as Transition,
  dramatic: { duration: durations.dramatic, ease: easings.dramatic } as Transition,
  flip: { duration: 0.6, ease: easings.smooth } as Transition,
  dismiss: { duration: durations.medium, ease: easings.snappy } as Transition,
};

/* ── Page Transition Variants ── */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
};

export const pageTransitionConfig: Transition = {
  duration: durations.medium,
  ease: easings.gentle,
};

/* ── Reusable Variants ── */
export const variants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  } as Variants,
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -10 },
  } as Variants,
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  } as Variants,
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  } as Variants,
};

/* ── Stagger Children ── */
export const staggerContainer: Variants = {
  animate: {
    transition: {
      staggerChildren: staggers.default,
    },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
};

/* ── Modal Variants ── */
export const modalBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalContent: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
};

/* ── Slide Over Variants ── */
export const slideOverVariants: Variants = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
};

/* ── Toast Variants ── */
export const toastVariants: Variants = {
  initial: { opacity: 0, x: 80 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 80 },
};

/* ── Overlay Variants (for celebrations, overlays) ── */
export const overlayBackdrop: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 0.9 },
  exit: { opacity: 0 },
};

/* ── Reduced Motion Helpers ── */
export const noMotionTransition: Transition = { duration: 0 };

export function getTransition(
  prefersReduced: boolean,
  normalTransition: Transition
): Transition {
  return prefersReduced ? noMotionTransition : normalTransition;
}
