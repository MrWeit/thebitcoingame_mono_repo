import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

interface CountUpProps {
  from?: number;
  to: number;
  duration?: number;
  format?: (value: number) => string;
  className?: string;
}

export function CountUp({
  from = 0,
  to,
  duration = 1000,
  format,
  className,
}: CountUpProps) {
  const prefersReduced = useReducedMotion();
  const [value, setValue] = useState(prefersReduced ? to : from);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (prefersReduced) {
      setValue(to);
      return;
    }

    const startTime = performance.now();
    const startVal = from;
    const diff = to - startVal;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setValue(startVal + diff * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [from, to, duration, prefersReduced]);

  const display = format ? format(value) : Math.round(value).toString();

  return <span className={className}>{display}</span>;
}
