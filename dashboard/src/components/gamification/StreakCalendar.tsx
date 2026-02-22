import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

interface StreakCalendarProps {
  streakWeeks: number;
  streakStartDate: string;
}

interface WeekCell {
  weekIndex: number;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  isCurrent: boolean;
}

function getWeekCells(streakWeeks: number, streakStartDate: string): WeekCell[] {
  const cells: WeekCell[] = [];
  const now = new Date();
  const startDate = new Date(streakStartDate);

  // Build 52 weeks ending at current week
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(currentWeekStart.getDate() - currentWeekStart.getDay() + 1);
  currentWeekStart.setHours(0, 0, 0, 0);

  for (let i = 51; i >= 0; i--) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(weekStart.getDate() - i * 7);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // A week is active if it falls within the streak window
    const isActive = weekStart >= startDate && weekStart <= now;
    const isCurrent = i === 0;

    cells.push({
      weekIndex: 51 - i,
      startDate: weekStart,
      endDate: weekEnd,
      isActive,
      isCurrent,
    });
  }

  // Only mark the last N weeks as active based on streakWeeks count
  const activeCount = Math.min(streakWeeks, 52);
  const totalCells = cells.length;
  for (let i = 0; i < totalCells; i++) {
    cells[i].isActive = i >= totalCells - activeCount;
  }

  return cells;
}

function formatDateShort(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function StreakCalendar({
  streakWeeks,
  streakStartDate,
}: StreakCalendarProps) {
  const prefersReduced = useReducedMotion();
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);

  const weeks = useMemo(
    () => getWeekCells(streakWeeks, streakStartDate),
    [streakWeeks, streakStartDate]
  );

  return (
    <div className="w-full">
      {/* Labels */}
      <div className="flex items-center justify-between mb-2 text-micro text-secondary">
        <span>52 weeks ago</span>
        <span>This week</span>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto pb-2 -mx-1 px-1">
        <div className="flex gap-1 min-w-[520px]">
          {weeks.map((week) => (
            <div key={week.weekIndex} className="relative group">
              <motion.div
                className={cn(
                  "w-[9px] h-[9px] rounded-[2px] cursor-pointer transition-colors",
                  week.isActive
                    ? "bg-bitcoin"
                    : "bg-elevated",
                  week.isCurrent && "ring-1 ring-bitcoin/60"
                )}
                animate={
                  !prefersReduced && week.isCurrent
                    ? {
                        boxShadow: [
                          "0 0 0px rgba(247,147,26,0.4)",
                          "0 0 6px rgba(247,147,26,0.6)",
                          "0 0 0px rgba(247,147,26,0.4)",
                        ],
                      }
                    : {}
                }
                transition={
                  !prefersReduced && week.isCurrent
                    ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
                    : {}
                }
                onMouseEnter={() => setHoveredWeek(week.weekIndex)}
                onMouseLeave={() => setHoveredWeek(null)}
              />

              {/* Tooltip */}
              {hoveredWeek === week.weekIndex && (
                <div
                  className={cn(
                    "absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2",
                    "bg-floating border border-white/10 rounded-radius-sm px-2.5 py-1.5",
                    "text-micro whitespace-nowrap shadow-heavy pointer-events-none"
                  )}
                >
                  <div className="text-primary font-medium">
                    {formatDateShort(week.startDate)} - {formatDateShort(week.endDate)}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5",
                      week.isActive ? "text-bitcoin" : "text-secondary"
                    )}
                  >
                    {week.isCurrent
                      ? "Current week"
                      : week.isActive
                        ? "Active"
                        : "Missed"}
                  </div>
                  {/* Arrow */}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-floating" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-micro text-secondary">
        <div className="flex items-center gap-1.5">
          <div className="w-[9px] h-[9px] rounded-[2px] bg-elevated" />
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-[9px] h-[9px] rounded-[2px] bg-bitcoin" />
          <span>Active</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-[9px] h-[9px] rounded-[2px] bg-bitcoin ring-1 ring-bitcoin/60" />
          <span>Current</span>
        </div>
      </div>
    </div>
  );
}
