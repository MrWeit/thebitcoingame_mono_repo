import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  CalendarBlank,
  Trophy,
  Ticket,
  Fire,
  ArrowRight,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";
import { mockUpcomingEvents, formatCountdown } from "@/mocks/data";

const EVENT_ICONS: Record<string, React.ReactNode> = {
  "world-cup": <Trophy size={20} weight="fill" className="text-gold" />,
  lottery: <Ticket size={20} weight="fill" className="text-purple" />,
  streak: <Fire size={20} weight="fill" className="text-bitcoin" />,
};

const EVENT_ACCENTS: Record<string, string> = {
  "world-cup": "border-l-gold",
  lottery: "border-l-purple",
  streak: "border-l-bitcoin",
};

export function UpcomingEvents() {
  const [countdowns, setCountdowns] = useState<Record<string, string>>({});

  /* Recalculate countdowns every minute */
  useEffect(() => {
    const update = () => {
      const next: Record<string, string> = {};
      for (const event of mockUpcomingEvents) {
        next[event.id] = formatCountdown(event.endsAt);
      }
      setCountdowns(next);
    };

    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card variant="standard" padding="md" className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <CalendarBlank size={18} weight="bold" className="text-cyan" />
        <h3 className="text-body-lg font-semibold text-primary">
          Upcoming Events
        </h3>
      </div>

      {/* Event list */}
      <motion.div
        className="flex-1 space-y-3"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {mockUpcomingEvents.map((event) => (
          <motion.div
            key={event.id}
            variants={staggerItem}
            className={cn(
              "bg-elevated/50 rounded-radius-md border border-white/4 border-l-2 p-4",
              EVENT_ACCENTS[event.type] || "border-l-cyan"
            )}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 mt-0.5">
                {EVENT_ICONS[event.type] || (
                  <CalendarBlank size={20} weight="fill" className="text-cyan" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-body font-medium text-primary truncate">
                    {event.title}
                  </h4>
                  <Mono className="text-caption font-medium text-cyan flex-shrink-0">
                    {countdowns[event.id] || "..."}
                  </Mono>
                </div>
                <p className="text-caption text-secondary mt-0.5 truncate">
                  {event.description}
                </p>

                {/* Action link */}
                {event.action && (
                  <a
                    href={event.action.href}
                    className="inline-flex items-center gap-1 text-micro text-cyan hover:text-primary transition-colors mt-2 font-medium"
                  >
                    {event.action.label}
                    <ArrowRight size={12} weight="bold" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </Card>
  );
}
