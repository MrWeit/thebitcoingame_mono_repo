import { useState, useEffect } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: SearchInputProps) {
  const [internalValue, setInternalValue] = useState(value);

  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(internalValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [internalValue, onChange]);

  return (
    <div className={cn("relative", className)}>
      <MagnifyingGlass
        weight="bold"
        className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary pointer-events-none"
      />
      <input
        type="text"
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full h-11 pl-11 pr-4 rounded-radius-full",
          "bg-surface/60 backdrop-blur-xl text-primary text-body",
          "border border-white/6 transition-all duration-200",
          "placeholder:text-secondary",
          "focus:border-white/12 focus:bg-surface/80 focus:outline-none"
        )}
      />
    </div>
  );
}
