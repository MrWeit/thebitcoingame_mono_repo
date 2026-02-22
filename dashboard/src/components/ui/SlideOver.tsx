import { useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { modalBackdrop, slideOverVariants, durations, springs } from "@/lib/animation";
import { cn } from "@/lib/utils";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
}

export function SlideOver({
  open,
  onClose,
  title,
  children,
  width = 440,
}: SlideOverProps) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        onClose();
      }
    };

    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          <motion.div
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: durations.small }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            variants={slideOverVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={springs.bouncy}
            onClick={(e) => e.stopPropagation()}
            style={{ width }}
            className={cn(
              "relative h-full bg-surface shadow-heavy",
              "border-l border-white/8",
              "flex flex-col"
            )}
          >
            {title && (
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0">
                <h2 className="text-headline text-primary font-semibold">
                  {title}
                </h2>
                <button
                  onClick={onClose}
                  className={cn(
                    "w-8 h-8 rounded-radius-sm",
                    "flex items-center justify-center",
                    "text-secondary hover:text-primary hover:bg-spotlight",
                    "transition-colors duration-150"
                  )}
                >
                  <X weight="bold" className="w-5 h-5" />
                </button>
              </div>
            )}

            {!title && (
              <button
                onClick={onClose}
                className={cn(
                  "absolute top-4 right-4 z-10",
                  "w-8 h-8 rounded-radius-sm",
                  "flex items-center justify-center",
                  "text-secondary hover:text-primary hover:bg-spotlight",
                  "transition-colors duration-150"
                )}
              >
                <X weight="bold" className="w-5 h-5" />
              </button>
            )}

            <div className={cn(
              "flex-1 overflow-y-auto",
              title ? "p-6" : "p-6 pt-16"
            )}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
