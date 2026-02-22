import { motion } from "framer-motion";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { durations, easings, springs } from "@/lib/animation";

interface TextInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  success?: boolean;
  helperText?: string;
  disabled?: boolean;
  type?: "text" | "email" | "password" | "number" | "tel" | "url";
  className?: string;
}

export function TextInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  success,
  helperText,
  disabled = false,
  type = "text",
  className,
}: TextInputProps) {
  const hasError = !!error;
  const displayHelperText = error || helperText;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-caption text-secondary font-medium">
          {label}
        </label>
      )}

      <div className="relative">
        <motion.input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          animate={hasError ? {
            x: [0, -8, 8, -8, 8, -4, 4, 0],
          } : {}}
          transition={{
            duration: durations.medium,
            ease: easings.smooth,
          }}
          className={cn(
            "w-full h-11 px-4 rounded-radius-md",
            "bg-elevated text-primary text-body",
            "border transition-all duration-200",
            "placeholder:text-secondary",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            hasError && "border-red",
            success && "border-green pr-11",
            !hasError && !success && "border-white/6",
            !hasError && !success && !disabled && "focus:border-cyan focus:shadow-glow-cyan focus:outline-none",
            disabled && "border-white/4"
          )}
        />

        {success && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springs.stiff}
            className="absolute right-3 top-1/2 -translate-y-1/2"
          >
            <Check weight="bold" className="w-5 h-5 text-green" />
          </motion.div>
        )}
      </div>

      {displayHelperText && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.micro }}
          className={cn(
            "text-micro",
            hasError ? "text-red" : "text-secondary"
          )}
        >
          {displayHelperText}
        </motion.p>
      )}
    </div>
  );
}
