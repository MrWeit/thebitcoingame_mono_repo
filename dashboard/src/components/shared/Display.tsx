import type { HTMLAttributes } from "react";

type DisplayProps = HTMLAttributes<HTMLElement> & {
  as?: "h1" | "h2" | "h3" | "h4" | "span" | "p";
};

export function Display({ as: Tag = "h2", className = "", ...props }: DisplayProps) {
  return (
    <Tag
      className={`font-display ${className}`}
      {...props}
    />
  );
}
