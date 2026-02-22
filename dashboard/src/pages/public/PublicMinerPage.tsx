import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Hammer,
  Diamond,
  Fire,
  ShieldSlash,
  ArrowRight,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { BadgeCard } from "@/components/ui/BadgeCard";
import { Button } from "@/components/ui/Button";
import StreakCalendar from "@/components/gamification/StreakCalendar";
import { staggerContainer, staggerItem } from "@/lib/animation";
import { RARITY_COLORS, type Rarity } from "@/lib/constants";
import { getCountryFlag } from "@/mocks/competition";
import { formatDifficulty, formatNumber } from "@/mocks/data";
import { mockBadgesEarned } from "@/mocks/data";

// Reuse avatar from profile page
function AddressAvatar({ address, size = 80, borderColor }: { address: string; size?: number; borderColor: string }) {
  const colors = useMemo(() => {
    const hash = address.split("").reduce((acc, char) => {
      const code = char.charCodeAt(0);
      return ((acc << 5) - acc + code) | 0;
    }, 0);
    const hue1 = Math.abs(hash % 360);
    const hue2 = (hue1 + 120) % 360;
    const hue3 = (hue1 + 240) % 360;
    return [
      `hsl(${hue1}, 60%, 50%)`,
      `hsl(${hue2}, 50%, 45%)`,
      `hsl(${hue3}, 55%, 40%)`,
    ];
  }, [address]);

  const grid = useMemo(() => {
    const cells: string[] = [];
    for (let i = 0; i < 9; i++) {
      const charCode = address.charCodeAt((i * 3 + 7) % address.length);
      cells.push(colors[charCode % 3]);
    }
    return cells;
  }, [address, colors]);

  const cellSize = size / 3;

  return (
    <div
      className="rounded-full overflow-hidden flex-shrink-0"
      style={{ width: size, height: size, border: `3px solid ${borderColor}` }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {grid.map((color, i) => (
          <rect
            key={i}
            x={(i % 3) * cellSize}
            y={Math.floor(i / 3) * cellSize}
            width={cellSize}
            height={cellSize}
            fill={color}
          />
        ))}
      </svg>
    </div>
  );
}

// Mock: determine if profile is public based on address
function isProfilePublic(address: string): boolean {
  // For demo: addresses starting with "bc1q" are public, others are private
  return address.startsWith("bc1q");
}

// Mock public profile data
const MOCK_PUBLIC_PROFILE = {
  displayName: "SatoshiHunter",
  countryCode: "PT",
  level: 7,
  levelTitle: "Hash Veteran",
  totalShares: 892_104,
  bestDifficulty: 7_104_293_847,
  streakWeeks: 12,
  streakStartDate: "2025-11-18",
};

export default function PublicMinerPage() {
  const { address } = useParams<{ address: string }>();
  const minerAddress = address ?? "";

  const isPublic = isProfilePublic(minerAddress);

  const highestRarity: Rarity = useMemo(() => {
    const rarities = mockBadgesEarned.map((b) => b.rarity as Rarity);
    if (rarities.includes("legendary")) return "legendary";
    if (rarities.includes("epic")) return "epic";
    if (rarities.includes("rare")) return "rare";
    return "common";
  }, []);

  const featuredBadges = mockBadgesEarned
    .sort((a, b) => {
      const order: Record<string, number> = { legendary: 0, epic: 1, rare: 2, common: 3 };
      return (order[a.rarity] ?? 4) - (order[b.rarity] ?? 4);
    })
    .slice(0, 5);

  // Private profile
  if (!isPublic) {
    return (
      <div className="max-w-[800px] mx-auto px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="w-16 h-16 rounded-full bg-elevated flex items-center justify-center mx-auto">
            <ShieldSlash size={32} weight="duotone" className="text-secondary" />
          </div>
          <h1 className="text-title font-bold text-primary">
            This miner profile is private
          </h1>
          <p className="text-body text-secondary max-w-md mx-auto">
            This miner has chosen to keep their profile private. Connect your own miner to join the community.
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
        </motion.div>
      </div>
    );
  }

  // Public profile
  const profile = MOCK_PUBLIC_PROFILE;

  return (
    <div className="max-w-[800px] mx-auto px-6 py-12">
      <motion.div
        className="space-y-8"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div variants={staggerItem} className="text-center">
          <AddressAvatar
            address={minerAddress}
            size={80}
            borderColor={RARITY_COLORS[highestRarity]}
          />
          <h1 className="text-title font-bold text-primary mt-4">
            {profile.displayName}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-1">
            <span className="text-sm">{getCountryFlag(profile.countryCode)}</span>
            <span className="text-caption text-secondary">
              Level {profile.level}: {profile.levelTitle}
            </span>
          </div>
          <p className="text-micro text-subtle font-mono mt-2">
            {minerAddress.slice(0, 12)}...{minerAddress.slice(-6)}
          </p>
        </motion.div>

        {/* Quick Stats */}
        <motion.div variants={staggerItem}>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: <Hammer size={16} weight="duotone" />, label: "Shares", value: `${formatNumber(profile.totalShares)}` },
              { icon: <Diamond size={16} weight="duotone" />, label: "Best Diff", value: formatDifficulty(profile.bestDifficulty) },
              { icon: <Fire size={16} weight="duotone" />, label: "Streak", value: `${profile.streakWeeks}wk` },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface border border-white/4 rounded-radius-lg p-4 text-center">
                <div className="flex items-center justify-center gap-1 text-secondary mb-1">
                  {stat.icon}
                  <span className="text-micro uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-body font-bold font-mono tabular-nums text-primary">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Featured Badges */}
        <motion.div variants={staggerItem}>
          <h3 className="text-body font-semibold text-primary mb-3">Featured Badges</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {featuredBadges.map((badge) => (
              <div key={badge.slug} className="shrink-0 w-28">
                <BadgeCard
                  badge={badge}
                  earned={badge.earned ? { date: badge.earned.date } : undefined}
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Streak Calendar */}
        <motion.div variants={staggerItem}>
          <h3 className="text-body font-semibold text-primary mb-3">Mining Streak</h3>
          <Card padding="md">
            <StreakCalendar
              streakWeeks={profile.streakWeeks}
              streakStartDate={profile.streakStartDate}
            />
          </Card>
        </motion.div>

        {/* CTA */}
        <motion.div variants={staggerItem} className="text-center pt-4">
          <p className="text-caption text-secondary mb-3">
            This could be you
          </p>
          <Link to="/connect">
            <Button
              variant="primary"
              size="md"
              rightIcon={<ArrowRight size={16} weight="bold" />}
            >
              Connect Your Miner
            </Button>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
