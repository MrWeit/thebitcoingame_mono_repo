import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  UsersThree,
  Cpu,
  Fire,
  Trophy,
  Copy,
  Check,
  Plus,
  Cube,
  ChartLineUp,
  Gear,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";
import {
  mockCooperative,
  mockCoopHashrateHistory,
  mockBrowseCoops,
} from "@/mocks/competition";
import { formatHashrate, formatNumber } from "@/mocks/data";

// Import Recharts
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ── Coop Hashrate Chart ──

function CoopHashrateChart() {
  const data = mockCoopHashrateHistory.filter((_, i) => i % 4 === 0).map((d) => ({
    time: new Date(d.time).toLocaleTimeString("en-US", { hour: "2-digit" }),
    value: d.value / 1e12,
  }));

  return (
    <Card padding="md">
      <h3 className="text-caption font-bold text-secondary uppercase tracking-wider mb-4">
        Combined Hashrate (7d)
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="coopGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F7931A" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F7931A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tick={{ fill: "#8B949E", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#8B949E", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(1)}`}
              domain={["dataMin - 0.5", "dataMax + 0.5"]}
              width={40}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#161B22",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelStyle={{ color: "#8B949E" }}
              formatter={(value: number | undefined) => [
                `${(value ?? 0).toFixed(2)} TH/s`,
                "Hashrate",
              ]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#F7931A"
              strokeWidth={2}
              fill="url(#coopGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ── Member List ──

function MemberList() {
  const members = mockCooperative.members;

  return (
    <Card padding="sm">
      <div className="px-4 py-3 border-b border-white/4">
        <h3 className="text-caption font-bold text-secondary uppercase tracking-wider">
          Members ({members.length})
        </h3>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 text-micro text-secondary uppercase tracking-wider">
        <div className="w-8 text-center">#</div>
        <div className="flex-1">Member</div>
        <div className="w-20 text-right">Hashrate</div>
        <div className="w-20 text-right hidden sm:block">Shares</div>
        <div className="w-16 text-right">Status</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.02]">
        {members.map((member, i) => (
          <motion.div
            key={member.userId}
            variants={{
              initial: { opacity: 0, x: -10 },
              animate: { opacity: 1, x: 0 },
            }}
            className="flex items-center gap-3 px-4 py-3 hover:bg-spotlight/50 transition-colors"
          >
            <div className="w-8 text-center font-mono text-caption text-secondary">
              {i + 1}
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                member.isOnline ? "bg-green/10" : "bg-elevated"
              )}>
                <span className="text-micro font-bold text-primary">
                  {member.displayName.charAt(0)}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-caption font-medium text-primary truncate block">
                  {member.displayName}
                </span>
                {member.role === "admin" && (
                  <span className="text-micro text-bitcoin">Admin</span>
                )}
              </div>
            </div>
            <div className="w-20 text-right font-mono tabular-nums text-caption text-primary">
              {formatHashrate(member.hashrate)}
            </div>
            <div className="w-20 text-right font-mono tabular-nums text-caption text-secondary hidden sm:block">
              {formatNumber(member.sharesToday)}
            </div>
            <div className="w-16 text-right">
              {member.isOnline ? (
                <span className="inline-flex items-center gap-1 text-micro text-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-green" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-micro text-secondary">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                  Offline
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </Card>
  );
}

// ── Invite Link ──

function InviteLink({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = `thebitcoingame.com/coop/join/${code}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(`https://${inviteUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteUrl]);

  return (
    <Card padding="md">
      <h3 className="text-caption font-bold text-secondary uppercase tracking-wider mb-3">
        Invite Link
      </h3>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-elevated border border-white/6 rounded-radius-md px-3 py-2">
          <span className="font-mono text-caption text-primary break-all">
            {inviteUrl}
          </span>
        </div>
        <Button
          variant="secondary"
          onClick={handleCopy}
          className="flex-shrink-0"
        >
          {copied ? (
            <Check size={16} className="text-green" />
          ) : (
            <Copy size={16} />
          )}
        </Button>
      </div>
    </Card>
  );
}

// ── No Coop View ──

function NoCoopView({ navigate }: { navigate: (path: string) => void }) {
  return (
    <motion.div
      className="space-y-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      <motion.div variants={staggerItem} className="text-center py-12 space-y-4">
        <div className="inline-flex p-4 rounded-full bg-elevated">
          <UsersThree size={48} weight="duotone" className="text-secondary" />
        </div>
        <h2 className="text-display-md font-bold">Join a Cooperative</h2>
        <p className="text-body text-secondary max-w-md mx-auto">
          Team up with other solo miners. Combine your hashrate, share strategies, and compete together.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="primary" onClick={() => navigate("/coop/create")}>
            <Plus size={18} className="mr-2" />
            Create a Cooperative
          </Button>
        </div>
      </motion.div>

      {/* Browse coops */}
      <motion.div variants={staggerItem}>
        <h2 className="text-headline font-bold mb-4">Browse Cooperatives</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mockBrowseCoops.map((coop) => (
            <Card key={coop.id} variant="interactive" padding="md">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center">
                  <UsersThree size={20} className="text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-primary text-caption truncate">{coop.name}</h3>
                  <p className="text-micro text-secondary">
                    {coop.memberCount} members · {formatHashrate(coop.combinedHashrate)}
                  </p>
                </div>
                {coop.weeklyStreak > 0 && (
                  <span className="text-micro text-bitcoin flex items-center gap-1">
                    <Fire size={12} weight="fill" />
                    {coop.weeklyStreak}w
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main Page ──

export default function CoopDashboard() {
  const navigate = useNavigate();
  // Toggle this to see both views
  const [isInCoop] = useState(true);
  const coop = mockCooperative;

  if (!isInCoop) {
    return (
      <motion.div
        className="space-y-6 pb-8"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <motion.div variants={staggerItem} className="flex items-center gap-3">
          <div className="p-2 rounded-radius-md bg-elevated">
            <UsersThree size={24} weight="duotone" className="text-secondary" />
          </div>
          <div>
            <h1 className="text-title font-bold">Cooperatives</h1>
            <p className="text-caption text-secondary">Mine together, grow together</p>
          </div>
        </motion.div>
        <NoCoopView navigate={navigate} />
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Coop Header */}
      <motion.div variants={staggerItem}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-elevated border border-white/6 flex items-center justify-center">
              <UsersThree size={28} weight="duotone" className="text-bitcoin" />
            </div>
            <div>
              <h1 className="text-title font-bold">{coop.name}</h1>
              <p className="text-caption text-secondary italic">"{coop.motto}"</p>
              <div className="flex items-center gap-3 mt-1 text-micro text-secondary">
                <span>{coop.memberCount} members</span>
                <span>·</span>
                <span>{formatHashrate(coop.combinedHashrate)} combined</span>
                <span>·</span>
                <span className="text-bitcoin flex items-center gap-1">
                  <Fire size={12} weight="fill" />
                  {coop.weeklyStreak} week streak
                </span>
              </div>
            </div>
          </div>
          <Button variant="ghost" onClick={() => navigate(`/coop/${coop.id}/settings`)}>
            <Gear size={18} className="mr-2" />
            Settings
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        <motion.div variants={staggerItem}>
          <StatCard
            label="Best Combined Diff"
            value={formatHashrate(coop.bestCombinedDiff)}
            icon={<ChartLineUp size={22} weight="duotone" />}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Blocks Found"
            value={coop.blocksFound}
            icon={<Cube size={22} weight="duotone" />}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Shares (Week)"
            value={formatNumber(coop.totalSharesWeek)}
            icon={<Cpu size={22} weight="duotone" />}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Weekly Rank"
            value={`#${coop.weeklyRank}`}
            icon={<Trophy size={22} weight="duotone" />}
          />
        </motion.div>
      </motion.div>

      {/* Hashrate Chart */}
      <motion.div variants={staggerItem}>
        <CoopHashrateChart />
      </motion.div>

      {/* Member List */}
      <motion.div variants={staggerItem}>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <MemberList />
        </motion.div>
      </motion.div>

      {/* Invite Link */}
      <motion.div variants={staggerItem}>
        <InviteLink code={coop.inviteCode} />
      </motion.div>
    </motion.div>
  );
}
