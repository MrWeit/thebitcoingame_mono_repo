import { motion } from "framer-motion";
import { durations, easings } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "xl";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
}

const variantStyles = {
  primary: "bg-gradient-to-r from-bitcoin to-[#E8720A] text-white shadow-medium hover:shadow-glow-orange",
  secondary: "bg-surface border border-white/6 text-cyan shadow-subtle hover:shadow-glow-cyan hover:border-white/10",
  ghost: "bg-transparent text-secondary hover:text-primary hover:bg-white/5",
  danger: "bg-gradient-to-r from-red to-[#E03C33] text-white shadow-medium hover:shadow-[0_0_20px_rgba(248,81,73,0.3)]",
};

const sizeStyles = {
  sm: "h-8 px-3 text-caption rounded-radius-sm",
  md: "h-10 px-4 text-body rounded-radius-md",
  lg: "h-11 px-5 text-body rounded-radius-md",
  xl: "h-13 px-6 text-body-lg rounded-radius-md",
};

export function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  loading = false,
  disabled = false,
  fullWidth = false,
  children,
  onClick,
  className,
  type = "button",
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const prefersReduced = useReducedMotion();

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading}
      aria-disabled={isDisabled}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 font-medium transition-colors",
        "focus-visible:outline-cyan focus-visible:outline-2 focus-visible:outline-offset-2",
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && "w-full",
        isDisabled && "opacity-50 cursor-not-allowed",
        className
      )}
      whileHover={!isDisabled && !prefersReduced ? { scale: 1.02 } : undefined}
      whileTap={!isDisabled && !prefersReduced ? { scale: 0.98 } : undefined}
      transition={{
        duration: durations.small,
        ease: easings.snappy,
      }}
    >
      {loading ? (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <>
          {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
          <span>{children}</span>
          {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
        </>
      )}
    </motion.button>
  );
}
