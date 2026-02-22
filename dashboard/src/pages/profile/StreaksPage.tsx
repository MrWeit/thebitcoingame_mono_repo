import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Clock, Fire, Trophy } from "@phosphor-icons/react";
import { PageTransition } from "@/components/shared/PageTransition";
import { Display } from "@/components/shared/Display";
import { Mono } from "@/components/shared/Mono";
import { Card } from "@/components/ui/Card";
import StreakFire from "@/components/gamification/StreakFire";
import StreakCalendar from "@/components/gamification/StreakCalendar";
import { useUserStore } from "@/stores/userStore";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";

interface MilestoneConfig {
  weeks: number;
  label: string;
  icon: string;
}

const MILESTONES: MilestoneConfig[] = [
  { weeks: 4, label: "Month Strong", icon: "\uD83D\uDCAA" },
  { weeks: 12, label: "Quarter Master", icon: "\uD83C\uDFC5" },
  { weeks: 26, label: "Half Year Hero", icon: "\u2B50" },
  { weeks: 52, label: "Year of Mining", icon: "\uD83D\uDC51" },
];

function getStreakExpiry(): { label: string; urgent: boolean } {
  const now = new Date();
  const endOfWeek = new Date(now);
  // Calculate next Sunday 23:59 UTC
  const daysUntilSunday = 7 - now.getUTCDay();
  endOfWeek.setUTCDate(now.getUTCDate() + (daysUntilSunday === 7 ? 0 : daysUntilSunday));
  endOfWeek.setUTCHours(23, 59, 0, 0);

  const diff = endOfWeek.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return {
    label: `Sunday 23:59 UTC (${days}d ${hours}h left)`,
    urgent: days < 2,
  };
}

function getDaysThisWeek(): number {
  // Mock: 5 out of 7 days mined this week
  return 5;
}

export default function StreaksPage() {
  const profile = useUserStore((s) => s.profile);
  const { streakWeeks, longestStreak, streakStartDate } = profile;

  const isRecord = streakWeeks === longestStreak && streakWeeks > 0;
  const expiry = useMemo(() => getStreakExpiry(), []);
  const daysThisWeek = getDaysThisWeek();

  const startDateFormatted = useMemo(() => {
    const d = new Date(streakStartDate);
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }, [streakStartDate]);

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 pb-24">
        {/* Header */}
        <div className="mb-8">
          <Display as="h1" className="text-display-md font-bold text-primary mb-2">
            Streaks
          </Display>
          <p className="text-body text-secondary">
            Mine consistently every week to build your streak.
          </p>
        </div>

        {/* Weekly Streak Card */}
        <Card variant="standard" padding="lg" className="mb-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Fire icon */}
            <div className="flex-shrink-0">
              <StreakFire streakWeeks={streakWeeks} size="lg" />
            </div>

            {/* Stats */}
            <div className="flex-1 text-center sm:text-left">
              <div className="mb-3">
                <div className="text-caption text-secondary mb-1">Current Streak</div>
                <div className="flex items-baseline gap-2 justify-center sm:justify-start">
                  <Mono className="text-display-lg font-bold text-primary">
                    {streakWeeks}
                  </Mono>
                  <span className="text-body text-secondary">weeks</span>
                </div>
              </div>

              <div className="mb-3">
                <div className="text-caption text-secondary mb-1">Longest Streak</div>
                <div className="flex items-baseline gap-2 justify-center sm:justify-start">
                  <Mono className="text-headline font-semibold text-primary">
                    {longestStreak}
                  </Mono>
                  <span className="text-caption text-secondary">weeks</span>
                  {isRecord && (
                    <span className="text-micro font-semibold text-bitcoin uppercase tracking-wider">
                      This is your record!
                    </span>
                  )}
                </div>
              </div>

              <div className="text-caption text-secondary mb-4">
                <Fire size={14} weight="fill" className="inline mr-1 text-bitcoin" />
                Started: {startDateFormatted}
              </div>

              {/* Week progress bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-caption text-secondary">
                    {daysThisWeek}/7 days this week
                  </span>
                </div>
                <div className="flex gap-1">
                  {[...Array(7)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-2 flex-1 rounded-radius-full transition-colors",
                        i < daysThisWeek ? "bg-bitcoin" : "bg-elevated"
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Expiry warning */}
              <div
                className={cn(
                  "flex items-center gap-2 text-caption",
                  expiry.urgent ? "text-red" : "text-bitcoin"
                )}
              >
                <Clock size={14} weight="bold" />
                <span>
                  Streak expires: {expiry.label}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* Streak Calendar */}
        <Card variant="standard" padding="lg" className="mb-8">
          <h2 className="text-headline font-semibold text-primary mb-4">
            52-Week Activity
          </h2>
          <StreakCalendar
            streakWeeks={streakWeeks}
            streakStartDate={streakStartDate}
          />
        </Card>

        {/* Streak Milestones */}
        <div className="mb-8">
          <h2 className="text-headline font-semibold text-primary mb-4">
            Streak Milestones
          </h2>

          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
            variants={staggerContainer}
            initial="initial"
            animate="animate"
          >
            {MILESTONES.map((milestone) => {
              const isCompleted = streakWeeks >= milestone.weeks;
              const weeksToGo = milestone.weeks - streakWeeks;
              const progress = Math.min((streakWeeks / milestone.weeks) * 100, 100);

              return (
                <motion.div key={milestone.weeks} variants={staggerItem}>
                  <Card
                    variant="standard"
                    padding="md"
                    className={cn(
                      "text-center",
                      isCompleted && "border-green/20"
                    )}
                  >
                    {/* Icon */}
                    <div className="text-2xl mb-2">{milestone.icon}</div>

                    {/* Weeks label */}
                    <div className="text-body font-semibold text-primary mb-1">
                      {milestone.weeks} Weeks
                    </div>
                    <div className="text-micro text-secondary mb-3">
                      {milestone.label}
                    </div>

                    {/* Status */}
                    {isCompleted ? (
                      <div className="flex items-center justify-center gap-1.5 text-green text-caption">
                        <CheckCircle size={16} weight="fill" />
                        <span>Completed</span>
                      </div>
                    ) : (
                      <div>
                        {/* Mini progress bar */}
                        <div className="h-1.5 rounded-radius-full bg-elevated overflow-hidden mb-1.5">
                          <div
                            className="h-full rounded-radius-full bg-bitcoin/60 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-micro text-secondary">
                          {weeksToGo} weeks to go
                        </div>
                      </div>
                    )}
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Streak tips */}
        <Card variant="glass" padding="md">
          <div className="flex items-start gap-3">
            <Trophy size={20} weight="fill" className="text-bitcoin flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-body font-semibold text-primary mb-1">
                Streak Tips
              </h3>
              <ul className="text-caption text-secondary space-y-1">
                <li>Submit at least one share per week to maintain your streak.</li>
                <li>Weeks run Monday 00:00 UTC to Sunday 23:59 UTC.</li>
                <li>Longer streaks unlock exclusive badges and XP bonuses.</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </PageTransition>
  );
}
