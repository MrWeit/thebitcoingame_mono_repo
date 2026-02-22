import { motion } from "framer-motion";
import {
  HardDrives,
  Lightning,
  Fire,
  Cpu,
} from "@phosphor-icons/react";
import { StatCard } from "@/components/ui/StatCard";
import { staggerContainer, staggerItem } from "@/lib/animation";
import {
  mockDashboardStats,
  mockSparklineData,
  formatHashrate,
} from "@/mocks/data";

import { DifficultyMeter } from "./dashboard/DifficultyMeter";
import { LiveShareFeed } from "./dashboard/LiveShareFeed";
import { HashrateChart } from "./dashboard/HashrateChart";
import { RecentBadges } from "./dashboard/RecentBadges";
import { UpcomingEvents } from "./dashboard/UpcomingEvents";
import { GlobalFeed } from "./dashboard/GlobalFeed";

export default function Dashboard() {
  const stats = mockDashboardStats;

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* ── Row 1: Difficulty Meter (full-width hero) ── */}
      <motion.div variants={staggerItem}>
        <DifficultyMeter />
      </motion.div>

      {/* ── Row 2: Stat Cards (4 columns) ── */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <motion.div variants={staggerItem}>
          <StatCard
            label="Hashrate"
            value={formatHashrate(stats.hashrate)}
            change={{ value: stats.hashrateChange, direction: "up" }}
            icon={<Cpu size={22} weight="duotone" />}
            sparklineData={mockSparklineData.hashrate}
          />
        </motion.div>

        <motion.div variants={staggerItem}>
          <StatCard
            label="Shares Today"
            value={stats.sharesToday}
            change={{
              value: stats.sharesChange,
              direction: stats.sharesChange >= 0 ? "up" : "down",
            }}
            icon={<Lightning size={22} weight="duotone" />}
            sparklineData={mockSparklineData.shares}
          />
        </motion.div>

        <motion.div variants={staggerItem}>
          <StatCard
            label="Workers"
            value={`${stats.workersOnline}/${stats.workersTotal}`}
            icon={<HardDrives size={22} weight="duotone" />}
            className="[&_[class*='text-title']]:flex [&_[class*='text-title']]:items-center [&_[class*='text-title']]:gap-2"
          />
        </motion.div>

        <motion.div variants={staggerItem}>
          <StatCard
            label="Streak"
            value={`${stats.streak} weeks`}
            icon={<Fire size={22} weight="duotone" />}
          />
        </motion.div>
      </motion.div>

      {/* ── Row 3: Live Feed + Hashrate Chart ── */}
      <motion.div
        variants={staggerItem}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <LiveShareFeed />
        <HashrateChart />
      </motion.div>

      {/* ── Row 4: Recent Badges + Upcoming Events ── */}
      <motion.div
        variants={staggerItem}
        className="grid grid-cols-1 lg:grid-cols-2 gap-4"
      >
        <RecentBadges />
        <UpcomingEvents />
      </motion.div>

      {/* ── Row 5: Global Feed (collapsible) ── */}
      <motion.div variants={staggerItem}>
        <GlobalFeed />
      </motion.div>
    </motion.div>
  );
}
