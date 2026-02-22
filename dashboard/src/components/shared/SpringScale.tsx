import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { springs } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface SpringScaleProps {
  children: ReactNode;
  trigger?: boolean | number | string;
  from?: number;
  to?: number;
  className?: string;
}

export function SpringScale({
  children,
  trigger,
  from = 0,
  to = 1,
  className,
}: SpringScaleProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={typeof trigger === "boolean" ? (trigger ? 1 : 0) : trigger}
      initial={{ scale: from, opacity: from === 0 ? 0 : 1 }}
      animate={{ scale: to, opacity: 1 }}
      transition={springs.bouncy}
      className={className}
    >
      {children}
    </motion.div>
  );
}
