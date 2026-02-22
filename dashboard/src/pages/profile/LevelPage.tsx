import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Rocket,
  CheckCircle,
  MapPin,
  Lock,
  Lightning,
} from "@phosphor-icons/react";
import { PageTransition } from "@/components/shared/PageTransition";
import { Display } from "@/components/shared/Display";
import { Mono } from "@/components/shared/Mono";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import XPBar from "@/components/gamification/XPBar";
import LevelUpOverlay from "@/components/gamification/LevelUpOverlay";
import { useUserStore, getLevelInfo, LEVEL_THRESHOLDS } from "@/stores/userStore";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";

interface XPHistoryEntry {
  id: number;
  xp: number;
  description: string;
  timeAgo: string;
}

const MOCK_XP_HISTORY: XPHistoryEntry[] = [
  { id: 1, xp: 50, description: "Daily share submitted", timeAgo: "2 hours ago" },
  { id: 2, xp: 100, description: "Earned badge: Quarter Master", timeAgo: "5 hours ago" },
  { id: 3, xp: 25, description: "Streak bonus (12 weeks)", timeAgo: "1 day ago" },
  { id: 4, xp: 50, description: "Best difficulty record broken", timeAgo: "1 day ago" },
  { id: 5, xp: 150, description: "Completed education track", timeAgo: "3 days ago" },
  { id: 6, xp: 50, description: "Daily share submitted", timeAgo: "3 days ago" },
  { id: 7, xp: 200, description: "World Cup participation bonus", timeAgo: "5 days ago" },
  { id: 8, xp: 50, description: "Daily share submitted", timeAgo: "6 days ago" },
  { id: 9, xp: 25, description: "Streak bonus (11 weeks)", timeAgo: "1 week ago" },
  { id: 10, xp: 50, description: "Daily share submitted", timeAgo: "1 week ago" },
];

// Mock earned dates for past levels
const MOCK_LEVEL_DATES: Record<number, string> = {
  1: "Nov 15, 2025",
  2: "Nov 16, 2025",
  3: "Nov 22, 2025",
  4: "Dec 3, 2025",
  5: "Dec 18, 2025",
  6: "Jan 8, 2026",
  7: "Jan 28, 2026",
};

export default function LevelPage() {
  const profile = useUserStore((s) => s.profile);
  const [showLevelUp, setShowLevelUp] = useState(false);

  const levelInfo = useMemo(() => getLevelInfo(profile.xp), [profile.xp]);
  const xpToNext = levelInfo.xpForLevel - levelInfo.xpIntoLevel;

  // Build roadmap around current level (2 before, current, 2 after)
  const roadmap = useMemo(() => {
    const currentIdx = LEVEL_THRESHOLDS.findIndex((t) => t.level === levelInfo.level);
    const startIdx = Math.max(0, currentIdx - 2);
    const endIdx = Math.min(LEVEL_THRESHOLDS.length - 1, currentIdx + 2);

    return LEVEL_THRESHOLDS.slice(startIdx, endIdx + 1).map((threshold) => {
      const isPast = threshold.level < levelInfo.level;
      const isCurrent = threshold.level === levelInfo.level;
      const isFuture = threshold.level > levelInfo.level;
      const xpDistance = isFuture
        ? threshold.cumulative - profile.xp
        : 0;

      return {
        ...threshold,
        isPast,
        isCurrent,
        isFuture,
        xpDistance,
        earnedDate: MOCK_LEVEL_DATES[threshold.level],
      };
    });
  }, [levelInfo.level, profile.xp]);

  // Estimate time to next level (rough: average ~100 XP/day)
  const weeksEstimate = Math.max(1, Math.ceil(xpToNext / 700));

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 pb-24">
        {/* Header */}
        <div className="mb-8">
          <Display as="h1" className="text-display-md font-bold text-primary mb-2">
            XP &amp; Level
          </Display>
          <p className="text-body text-secondary">
            Track your progress and see what's ahead.
          </p>
        </div>

        {/* Level Display Card */}
        <Card variant="standard" padding="lg" className="mb-8">
          <div className="flex flex-col items-center text-center mb-6">
            {/* Level number */}
            <Display
              as="h2"
              className={cn(
                "text-[4rem] leading-none font-bold text-bitcoin mb-2",
                "drop-shadow-[0_0_20px_rgba(247,147,26,0.3)]"
              )}
            >
              {levelInfo.level}
            </Display>

            {/* Title */}
            <Display as="h3" className="text-title font-semibold text-primary mb-1">
              {levelInfo.title}
            </Display>

            {/* Total XP */}
            <Mono className="text-caption text-secondary">
              {profile.xp.toLocaleString()} total XP
            </Mono>
          </div>

          {/* XP Bar */}
          <XPBar
            current={levelInfo.xpIntoLevel}
            max={levelInfo.xpForLevel}
            size="lg"
          />

          {/* XP to next */}
          <div className="mt-4 text-center space-y-1">
            <p className="text-body text-secondary">
              <Mono className="text-bitcoin font-semibold">
                {xpToNext.toLocaleString()} XP
              </Mono>
              {" to Level "}
              {levelInfo.nextLevel}: {levelInfo.nextTitle}
            </p>
            <p className="text-caption text-secondary">
              At your current pace, ~{weeksEstimate} week{weeksEstimate !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Demo button */}
          <div className="mt-6 flex justify-center">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Rocket size={16} weight="fill" />}
              onClick={() => setShowLevelUp(true)}
            >
              Demo Level Up
            </Button>
          </div>
        </Card>

        {/* Level Roadmap */}
        <div className="mb-8">
          <h2 className="text-headline font-semibold text-primary mb-4">
            Level Roadmap
          </h2>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[19px] top-0 bottom-0 w-[2px] bg-elevated" />

            <motion.div
              className="space-y-0"
              variants={staggerContainer}
              initial="initial"
              animate="animate"
            >
              {roadmap.map((level) => (
                <motion.div
                  key={level.level}
                  variants={staggerItem}
                  className="relative flex items-start gap-4 pb-6"
                >
                  {/* Node */}
                  <div
                    className={cn(
                      "relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2",
                      level.isPast && "bg-green/10 border-green",
                      level.isCurrent && "bg-bitcoin/15 border-bitcoin shadow-glow-orange",
                      level.isFuture && "bg-elevated border-white/10"
                    )}
                  >
                    {level.isPast && (
                      <CheckCircle size={18} weight="fill" className="text-green" />
                    )}
                    {level.isCurrent && (
                      <MapPin size={18} weight="fill" className="text-bitcoin" />
                    )}
                    {level.isFuture && (
                      <Lock size={14} weight="bold" className="text-secondary" />
                    )}
                  </div>

                  {/* Content */}
                  <div
                    className={cn(
                      "flex-1 pt-1.5",
                      level.isCurrent && "bg-bitcoin/5 -ml-2 pl-4 pr-3 py-3 rounded-radius-md border border-bitcoin/15"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "text-body font-semibold",
                          level.isPast && "text-secondary",
                          level.isCurrent && "text-bitcoin",
                          level.isFuture && "text-secondary"
                        )}
                      >
                        Level {level.level}
                      </span>
                      <span
                        className={cn(
                          "text-caption",
                          level.isCurrent ? "text-primary" : "text-secondary"
                        )}
                      >
                        {level.title}
                      </span>
                      {level.isCurrent && (
                        <span className="text-micro font-bold text-bitcoin uppercase tracking-wider">
                          You are here
                        </span>
                      )}
                    </div>

                    {level.isPast && level.earnedDate && (
                      <Mono className="text-micro text-secondary mt-0.5">
                        Reached {level.earnedDate}
                      </Mono>
                    )}

                    {level.isFuture && (
                      <Mono className="text-micro text-secondary mt-0.5">
                        {level.xpDistance.toLocaleString()} XP away
                      </Mono>
                    )}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* XP History Feed */}
        <div>
          <h2 className="text-headline font-semibold text-primary mb-4">
            Recent XP
          </h2>

          <motion.div
            className="space-y-1"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {MOCK_XP_HISTORY.map((entry) => (
              <motion.div
                key={entry.id}
                variants={staggerItem}
                className="flex items-center gap-3 px-3 py-2.5 rounded-radius-sm hover:bg-surface transition-colors"
              >
                <div className="flex-shrink-0">
                  <Lightning size={14} weight="fill" className="text-bitcoin" />
                </div>
                <Mono className="text-caption text-bitcoin font-semibold flex-shrink-0 w-16">
                  +{entry.xp} XP
                </Mono>
                <span className="text-caption text-primary flex-1 min-w-0 truncate">
                  {entry.description}
                </span>
                <span className="text-micro text-secondary flex-shrink-0">
                  {entry.timeAgo}
                </span>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Level Up Overlay Demo */}
        <LevelUpOverlay
          newLevel={levelInfo.nextLevel}
          newTitle={levelInfo.nextTitle}
          onDismiss={() => setShowLevelUp(false)}
          show={showLevelUp}
        />
      </div>
    </PageTransition>
  );
}
