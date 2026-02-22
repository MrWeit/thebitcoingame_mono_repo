import { motion } from "framer-motion";
import { springs } from "@/lib/animation";
import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: ToggleProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 rounded-radius-full",
          "transition-colors duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none focus:ring-2 focus:ring-cyan focus:ring-offset-2 focus:ring-offset-canvas",
          checked ? "bg-bitcoin" : "bg-subtle"
        )}
      >
        <motion.span
          layout
          transition={springs.bouncy}
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md",
            "ring-0",
            checked ? "translate-x-6" : "translate-x-1"
          )}
          style={{
            position: "absolute",
            top: "50%",
            y: "-50%",
          }}
        />
      </button>

      {label && (
        <label
          onClick={() => !disabled && onChange(!checked)}
          className={cn(
            "text-body text-primary select-none",
            disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
          )}
        >
          {label}
        </label>
      )}
    </div>
  );
}
