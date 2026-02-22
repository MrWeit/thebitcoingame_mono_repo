import { motion } from "framer-motion";
import { durations, easings } from "@/lib/animation";
import { cn } from "@/lib/utils";

interface IconButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  "aria-label": string;
}

const variantStyles = {
  primary: "bg-gradient-to-r from-bitcoin to-[#E8720A] text-white shadow-medium hover:shadow-glow-orange",
  secondary: "bg-surface border border-white/6 text-secondary hover:text-primary shadow-subtle hover:border-white/10",
  ghost: "bg-transparent text-secondary hover:text-primary hover:bg-white/5",
  danger: "bg-gradient-to-r from-red to-[#E03C33] text-white shadow-medium hover:shadow-[0_0_20px_rgba(248,81,73,0.3)]",
};

const sizeStyles = {
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-lg",
};

export function IconButton({
  variant = "secondary",
  size = "md",
  icon,
  onClick,
  className,
  disabled = false,
  "aria-label": ariaLabel,
}: IconButtonProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full transition-colors",
        "focus-visible:outline-cyan focus-visible:outline-2 focus-visible:outline-offset-2",
        variantStyles[variant],
        sizeStyles[size],
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      whileHover={!disabled ? { scale: 1.05 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      transition={{
        duration: durations.small,
        ease: easings.snappy,
      }}
    >
      <motion.span
        className="flex items-center justify-center"
        whileHover={!disabled ? { filter: "brightness(1.2)" } : undefined}
        transition={{ duration: durations.micro }}
      >
        {icon}
      </motion.span>
    </motion.button>
  );
}
