import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Cpu,
  ChartLineUp,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";
import {
  mockWorldCup,
  mockGroupMatches,
  getCountryFlag,
  getCountryName,
} from "@/mocks/competition";
import { formatHashrate, formatNumber } from "@/mocks/data";

export default function MyTeamPage() {
  const navigate = useNavigate();
  const countryCode = "PT";
  const countryName = getCountryName(countryCode);

  // Find team in groups
  const group = mockWorldCup.groups.find((g) =>
    g.teams.some((t) => t.countryCode === countryCode)
  );
  const team = group?.teams.find((t) => t.countryCode === countryCode);

  // Team matches
  const teamMatches = [
    ...mockGroupMatches.filter(
      (m) => m.teamA.countryCode === countryCode || m.teamB.countryCode === countryCode
    ),
    ...mockWorldCup.knockoutMatches.filter(
      (m) => m.teamA.countryCode === countryCode || m.teamB.countryCode === countryCode
    ),
  ].sort((a, b) => a.matchDate.getTime() - b.matchDate.getTime());

  // Top team miners
  const topMiners = [
    { name: "SatoshiHunter", hashrate: 0.8e15, shares: 412_847 },
    { name: "PortoHash", hashrate: 0.5e15, shares: 287_234 },
    { name: "LisbonMiner", hashrate: 0.4e15, shares: 198_456 },
    { name: "AlgarveBit", hashrate: 0.2e15, shares: 134_891 },
    { name: "MadeiraHash", hashrate: 0.1e15, shares: 87_234 },
  ];

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Back */}
      <motion.div variants={staggerItem}>
        <button
          onClick={() => navigate("/world-cup")}
          className="flex items-center gap-2 text-caption text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to World Cup
        </button>
      </motion.div>

      {/* Hero */}
      <motion.div variants={staggerItem} className="text-center space-y-3">
        <span className="text-6xl block">{getCountryFlag(countryCode)}</span>
        <h1 className="text-display-md font-bold">{countryName}</h1>
        {group && (
          <p className="text-body text-secondary">
            {group.name} — Position: {team ? [...group.teams].sort((a, b) => b.points - a.points).findIndex((t) => t.countryCode === countryCode) + 1 : "?"}
          </p>
        )}
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
            label="Total Miners"
            value="178"
            icon={<Users size={22} weight="duotone" />}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Hashrate"
            value={formatHashrate(2.0e15)}
            icon={<Cpu size={22} weight="duotone" />}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Group Points"
            value={String(team?.points ?? 0)}
            icon={<ChartLineUp size={22} weight="duotone" />}
          />
        </motion.div>
        <motion.div variants={staggerItem}>
          <StatCard
            label="Matches Played"
            value={String(team?.played ?? 0)}
          />
        </motion.div>
      </motion.div>

      {/* Match Schedule */}
      <motion.div variants={staggerItem}>
        <h2 className="text-headline font-bold mb-4">Matches</h2>
        <Card padding="sm">
          <div className="divide-y divide-white/[0.02]">
            {teamMatches.map((match) => {
              const isTeamA = match.teamA.countryCode === countryCode;
              const opponent = isTeamA ? match.teamB : match.teamA;
              const ownScore = isTeamA ? match.teamA.score : match.teamB.score;
              const oppScore = isTeamA ? match.teamB.score : match.teamA.score;

              const result =
                match.status !== "completed"
                  ? null
                  : ownScore > oppScore
                  ? "W"
                  : ownScore < oppScore
                  ? "L"
                  : "D";

              return (
                <div
                  key={match.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-spotlight/50 transition-colors"
                  onClick={() => navigate(`/world-cup/${mockWorldCup.id}/match/${match.id}`)}
                >
                  <div className="w-8 text-center">
                    {result && (
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-micro font-bold",
                          result === "W" && "bg-green/10 text-green",
                          result === "L" && "bg-red/10 text-red",
                          result === "D" && "bg-secondary/10 text-secondary"
                        )}
                      >
                        {result}
                      </span>
                    )}
                    {!result && (
                      <span className="text-micro text-secondary">
                        {match.matchDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-sm text-secondary">vs</span>
                    <span className="text-lg">{getCountryFlag(opponent.countryCode)}</span>
                    <span className="text-caption font-medium text-primary truncate">
                      {getCountryName(opponent.countryCode)}
                    </span>
                  </div>

                  {match.status === "completed" && (
                    <span className="font-mono tabular-nums text-body font-semibold">
                      {ownScore} — {oppScore}
                    </span>
                  )}
                  {match.status === "live" && (
                    <span className="text-micro font-bold text-red">LIVE</span>
                  )}
                  {match.status === "scheduled" && (
                    <span className="text-micro text-secondary">Upcoming</span>
                  )}

                  <span className="text-micro text-secondary capitalize">{match.round}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Top Miners */}
      <motion.div variants={staggerItem}>
        <h2 className="text-headline font-bold mb-4">Top Miners</h2>
        <Card padding="sm">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-2 text-micro text-secondary uppercase tracking-wider border-b border-white/4">
            <div className="w-8 text-center">#</div>
            <div className="flex-1">Miner</div>
            <div className="w-24 text-right">Hashrate</div>
            <div className="w-24 text-right hidden sm:block">Shares</div>
          </div>

          {topMiners.map((miner, i) => (
            <div
              key={miner.name}
              className={cn(
                "flex items-center gap-3 px-4 py-3",
                miner.name === "SatoshiHunter" && "bg-bitcoin/[0.03]"
              )}
            >
              <div className="w-8 text-center font-mono text-caption text-secondary">
                {i + 1}
              </div>
              <div className="flex-1 font-medium text-caption text-primary">
                {miner.name}
              </div>
              <div className="w-24 text-right font-mono tabular-nums text-caption text-primary">
                {formatHashrate(miner.hashrate)}
              </div>
              <div className="w-24 text-right font-mono tabular-nums text-caption text-secondary hidden sm:block">
                {formatNumber(miner.shares)}
              </div>
            </div>
          ))}
        </Card>
      </motion.div>
    </motion.div>
  );
}
