import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { durations, springs } from "@/lib/animation";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  className?: string;
}

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = "Select an option",
  error,
  className,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const hasError = !!error;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn("flex flex-col gap-1.5 relative", className)}>
      {label && (
        <label className="text-caption text-secondary font-medium">
          {label}
        </label>
      )}

      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "w-full h-11 px-4 rounded-radius-md",
          "bg-elevated text-primary text-body",
          "border transition-all duration-200",
          "flex items-center justify-between gap-2",
          hasError && "border-red",
          !hasError && "border-white/6",
          !hasError && "focus:border-cyan focus:shadow-glow-cyan focus:outline-none"
        )}
      >
        <span className={cn(!selectedOption && "text-secondary")}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: durations.small }}
        >
          <CaretDown weight="bold" className="w-5 h-5 text-secondary" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: durations.micro }}
            className={cn(
              "absolute top-full left-0 right-0 mt-2 z-50",
              "bg-elevated rounded-radius-md shadow-heavy",
              "border border-white/8",
              "overflow-hidden"
            )}
          >
            <div className="py-1 max-h-64 overflow-y-auto">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "w-full px-4 h-10 text-left text-body",
                      "flex items-center justify-between gap-2",
                      "transition-colors duration-150",
                      isSelected ? "text-cyan bg-spotlight" : "text-primary",
                      !isSelected && "hover:bg-spotlight"
                    )}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={springs.stiff}
                      >
                        <Check weight="bold" className="w-5 h-5 text-cyan" />
                      </motion.div>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.micro }}
          className="text-micro text-red"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
