import type { HTMLAttributes } from "react";

type MonoProps = HTMLAttributes<HTMLSpanElement> & {
  as?: "span" | "p" | "div";
};

export function Mono({ as: Tag = "span", className = "", ...props }: MonoProps) {
  return (
    <Tag
      className={`font-mono tabular-nums ${className}`}
      {...props}
    />
  );
}
