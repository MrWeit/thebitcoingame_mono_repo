import { motion } from "framer-motion";
import { durations, easings } from "@/lib/animation";
import { cn } from "@/lib/utils";

interface CardProps {
  variant?: "standard" | "interactive" | "stat" | "glass";
  padding?: "sm" | "md" | "lg";
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}

const paddingStyles = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
};

export function Card({
  variant = "standard",
  padding = "md",
  onClick,
  className,
  children,
}: CardProps) {
  const isInteractive = variant === "interactive" || onClick;

  const baseStyles = "rounded-radius-lg transition-all";

  const variantStyles = {
    standard: "bg-surface border border-white/4 shadow-subtle hover:border-white/8 hover:shadow-medium",
    interactive: "bg-surface border border-white/4 shadow-subtle hover:border-white/8 hover:shadow-medium cursor-pointer",
    stat: "bg-surface border border-white/4 shadow-subtle hover:border-white/8 hover:shadow-medium",
    glass: "glass rounded-radius-lg",
  };

  if (isInteractive) {
    return (
      <motion.div
        onClick={onClick}
        className={cn(
          baseStyles,
          variantStyles[variant],
          paddingStyles[padding],
          className
        )}
        whileHover={{
          y: -2,
          scale: variant === "interactive" ? 1.01 : 1,
        }}
        transition={{
          duration: durations.small,
          ease: easings.gentle,
        }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <motion.div
      className={cn(
        baseStyles,
        variantStyles[variant],
        paddingStyles[padding],
        className
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: durations.medium,
        ease: easings.gentle,
      }}
    >
      {children}
    </motion.div>
  );
}
