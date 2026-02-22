import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Trophy,
  CalendarBlank,
  Lock,
  ArrowRight,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, durations, easings } from "@/lib/animation";
import {
  mockLeaderboardWeekly,
  getCountryFlag,
  type LeaderboardEntry,
} from "@/mocks/competition";
import { formatDifficulty } from "@/mocks/data";

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-xl">🥇</span>;
  if (rank === 2) return <span className="text-xl">🥈</span>;
  if (rank === 3) return <span className="text-xl">🥉</span>;
  return <span className="font-mono text-secondary tabular-nums">#{rank}</span>;
}

function getRankBorderClass(rank: number): string {
  if (rank === 1) return "border-l-2 border-l-gold shadow-[inset_0_0_20px_rgba(212,168,67,0.08)]";
  if (rank === 2) return "border-l-2 border-l-secondary shadow-[inset_0_0_20px_rgba(139,148,158,0.06)]";
  if (rank === 3) return "border-l-2 border-l-[#CD7F32] shadow-[inset_0_0_20px_rgba(205,127,50,0.06)]";
  return "";
}

function PublicLeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Truncate difficulty for public view
  const truncatedDiff = formatDifficulty(entry.bestDifficulty);

  return (
    <div
      className={cn(
        "relative group rounded-radius-md transition-colors",
        "hover:bg-spotlight/30",
        getRankBorderClass(entry.rank)
      )}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Rank */}
        <div className="w-10 flex-shrink-0 flex justify-center">
          <RankBadge rank={entry.rank} />
        </div>

        {/* Avatar + Name */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-secondary">
              {entry.displayName.charAt(0)}
            </span>
          </div>
          <span className="font-medium text-primary truncate">
            {entry.displayName}
          </span>
        </div>

        {/* Country */}
        <div className="hidden sm:flex items-center gap-1.5 w-12 flex-shrink-0">
          <span className="text-sm">{getCountryFlag(entry.countryCode)}</span>
        </div>

        {/* Best Diff (truncated) */}
        <div className="w-16 flex-shrink-0 text-right">
          <span className="font-mono tabular-nums text-body font-semibold text-primary">
            {truncatedDiff}
          </span>
        </div>
      </div>

      {/* Sign in tooltip on hover */}
      {showTooltip && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 bg-floating border border-white/10 rounded-radius-sm px-3 py-1.5 shadow-heavy pointer-events-none">
          <Lock size={12} className="text-secondary" />
          <span className="text-micro text-secondary whitespace-nowrap">
            Sign in to see details
          </span>
        </div>
      )}
    </div>
  );
}

export default function PublicLeaderboardPage() {
  // Only show top 25 from weekly
  const top25 = mockLeaderboardWeekly.slice(0, 25);

  return (
    <div className="max-w-[1280px] mx-auto px-6 py-12">
      <motion.div
        className="space-y-8"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div variants={staggerItem} className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-radius-full bg-bitcoin/10 text-bitcoin text-micro font-semibold mb-4">
            <CalendarBlank size={14} weight="bold" />
            This Week
          </div>
          <h1 className="text-display-md font-bold text-primary">Leaderboard</h1>
          <p className="text-body text-secondary mt-2">
            Top 25 solo miners this week — ranked by best difficulty
          </p>
        </motion.div>

        {/* CTA: Connect to see your rank */}
        <motion.div variants={staggerItem}>
          <Card padding="md" className="bg-gradient-to-r from-bitcoin/[0.06] to-transparent border-bitcoin/20">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-bitcoin/20 flex items-center justify-center">
                  <Trophy size={20} weight="duotone" className="text-bitcoin" />
                </div>
                <div>
                  <p className="text-body font-semibold text-primary">
                    Where do you rank?
                  </p>
                  <p className="text-caption text-secondary">
                    Connect your miner to see your position
                  </p>
                </div>
              </div>
              <Link to="/connect">
                <Button
                  variant="primary"
                  size="md"
                  rightIcon={<ArrowRight size={16} weight="bold" />}
                >
                  Connect Your Miner
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

        {/* Leaderboard Table */}
        <motion.div variants={staggerItem}>
          <Card padding="sm">
            {/* Column headers */}
            <div className="flex items-center gap-3 px-4 py-2 text-micro text-secondary uppercase tracking-wider border-b border-white/4">
              <div className="w-10 text-center">#</div>
              <div className="flex-1">Miner</div>
              <div className="hidden sm:block w-12">Country</div>
              <div className="w-16 text-right">Best Diff</div>
            </div>

            {/* Rows */}
            <motion.div
              variants={staggerContainer}
              initial="initial"
              animate="animate"
              className="divide-y divide-white/[0.02]"
            >
              {top25.map((entry, i) => (
                <motion.div
                  key={entry.userId}
                  variants={{
                    initial: { opacity: 0, x: -20 },
                    animate: { opacity: 1, x: 0 },
                  }}
                  transition={{
                    delay: i * 0.03,
                    duration: durations.medium,
                    ease: easings.gentle,
                  }}
                >
                  <PublicLeaderboardRow entry={entry} />
                </motion.div>
              ))}
            </motion.div>

            {/* Bottom fade + sign in CTA */}
            <div className="relative border-t border-white/4">
              <div className="px-4 py-8 text-center">
                <Lock size={20} className="mx-auto text-secondary mb-2" />
                <p className="text-caption text-secondary mb-3">
                  Sign in to see the full leaderboard and your position
                </p>
                <Link to="/connect">
                  <Button variant="secondary" size="sm">
                    Sign In
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Bottom Upsell */}
        <motion.div variants={staggerItem}>
          <div className="text-center py-8">
            <h2 className="text-title font-bold text-primary mb-2">
              Ready to compete?
            </h2>
            <p className="text-body text-secondary mb-6 max-w-md mx-auto">
              Connect your miner and see your position on the board. Join thousands of solo miners competing worldwide.
            </p>
            <Link to="/connect">
              <Button
                variant="primary"
                size="lg"
                rightIcon={<ArrowRight size={18} weight="bold" />}
              >
                Connect Your Miner
              </Button>
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
