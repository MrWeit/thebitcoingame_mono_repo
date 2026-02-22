import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Circle,
  Lightning,
  ShareNetwork,
  Star,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, durations } from "@/lib/animation";
import {
  mockWorldCup,
  mockGroupMatches,
  getCountryFlag,
  getCountryName,
} from "@/mocks/competition";
import { formatHashrate, formatNumber } from "@/mocks/data";

// ── Hashrate Comparison Bar ──

function HashrateBar({
  hashrateA,
  hashrateB,
  isLive,
}: {
  hashrateA: number;
  hashrateB: number;
  isLive: boolean;
}) {
  const total = hashrateA + hashrateB;
  const pctA = total > 0 ? (hashrateA / total) * 100 : 50;

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-caption text-secondary">
        <span>Hashrate</span>
        <span>Hashrate</span>
      </div>

      {/* Bar */}
      <div className="relative h-8 rounded-full overflow-hidden bg-elevated border border-white/6">
        <motion.div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan to-cyan/60"
          initial={{ width: 0 }}
          animate={{ width: `${pctA}%` }}
          transition={{ duration: durations.large, ease: "easeOut" }}
        />
        <motion.div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-bitcoin to-bitcoin/60"
          initial={{ width: 0 }}
          animate={{ width: `${100 - pctA}%` }}
          transition={{ duration: durations.large, ease: "easeOut" }}
        />

        {/* Center divider */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/20 -translate-x-0.5" />

        {isLive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-canvas/80 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Circle size={6} weight="fill" className="text-red animate-pulse" />
              <span className="text-micro font-bold text-red">LIVE</span>
            </div>
          </div>
        )}
      </div>

      {/* Values */}
      <div className="flex justify-between">
        <span className="font-mono tabular-nums text-body font-semibold text-cyan">
          {formatHashrate(hashrateA)}
        </span>
        <span className="font-mono tabular-nums text-body font-semibold text-bitcoin">
          {formatHashrate(hashrateB)}
        </span>
      </div>
    </div>
  );
}

// ── Match Stat Row ──

function StatRow({
  label,
  valueA,
  valueB,
}: {
  label: string;
  valueA: string;
  valueB: string;
}) {
  return (
    <div className="flex items-center py-3 border-b border-white/[0.03] last:border-0">
      <div className="flex-1 text-right">
        <span className="font-mono tabular-nums text-body text-primary">{valueA}</span>
      </div>
      <div className="w-32 text-center">
        <span className="text-caption text-secondary">{label}</span>
      </div>
      <div className="flex-1 text-left">
        <span className="font-mono tabular-nums text-body text-primary">{valueB}</span>
      </div>
    </div>
  );
}

// ── Top Miners List ──

function TopMinersList({
  miners,
  side,
}: {
  miners: { name: string; hashrate: number }[];
  side: "left" | "right";
}) {
  return (
    <div className={cn("space-y-2", side === "right" && "text-right")}>
      {miners.map((m, i) => (
        <div
          key={m.name}
          className={cn(
            "flex items-center gap-2",
            side === "right" && "flex-row-reverse"
          )}
        >
          <span className="text-micro text-secondary font-mono w-4">{i + 1}.</span>
          <span className="text-caption text-primary font-medium">{m.name}</span>
          <span className="text-micro text-secondary font-mono tabular-nums">
            {formatHashrate(m.hashrate)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──

export default function MatchDetailPage() {
  const { matchId } = useParams();
  const navigate = useNavigate();

  // Find match from mock data
  const allMatches = [...mockGroupMatches, ...mockWorldCup.knockoutMatches];
  const match = allMatches.find((m) => m.id === matchId);

  // Live simulation
  const [liveHashrateA, setLiveHashrateA] = useState(match?.teamA.hashrate ?? 0);
  const [liveHashrateB, setLiveHashrateB] = useState(match?.teamB.hashrate ?? 0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (match?.status === "live") {
      intervalRef.current = setInterval(() => {
        setLiveHashrateA((prev) => prev * (0.97 + Math.random() * 0.06));
        setLiveHashrateB((prev) => prev * (0.97 + Math.random() * 0.06));
      }, 5000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [match?.status]);

  if (!match) {
    return (
      <div className="text-center py-20">
        <p className="text-secondary">Match not found</p>
        <Button variant="ghost" onClick={() => navigate("/world-cup")} className="mt-4">
          Back to World Cup
        </Button>
      </div>
    );
  }

  const isLive = match.status === "live";
  const hrA = isLive ? liveHashrateA : match.teamA.hashrate;
  const hrB = isLive ? liveHashrateB : match.teamB.hashrate;
  const roundLabel = match.round === "group" ? "Group Stage" :
    match.round === "quarter" ? "Quarter-Final" :
    match.round === "semi" ? "Semi-Final" : "Final";

  return (
    <motion.div
      className="space-y-6 pb-8 max-w-3xl mx-auto"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Back button */}
      <motion.div variants={staggerItem}>
        <button
          onClick={() => navigate("/world-cup")}
          className="flex items-center gap-2 text-caption text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} />
          Back to World Cup
        </button>
      </motion.div>

      {/* Scoreboard */}
      <motion.div variants={staggerItem}>
        <Card padding="lg" className="text-center overflow-hidden relative">
          {/* Live indicator */}
          {isLive && (
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red/0 via-red to-red/0" />
          )}

          <div className="text-micro text-secondary uppercase tracking-wider mb-2">
            {roundLabel}
          </div>

          {/* Flags + Score */}
          <div className="flex items-center justify-center gap-6 sm:gap-10 my-6">
            <div className="text-center">
              <span className="text-4xl sm:text-5xl block mb-2">
                {getCountryFlag(match.teamA.countryCode)}
              </span>
              <span className="text-caption font-semibold text-primary">
                {getCountryName(match.teamA.countryCode)}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-display-lg tabular-nums text-primary">
                {match.teamA.score}
              </span>
              <span className="text-secondary text-title">—</span>
              <span className="font-mono font-bold text-display-lg tabular-nums text-primary">
                {match.teamB.score}
              </span>
            </div>

            <div className="text-center">
              <span className="text-4xl sm:text-5xl block mb-2">
                {getCountryFlag(match.teamB.countryCode)}
              </span>
              <span className="text-caption font-semibold text-primary">
                {getCountryName(match.teamB.countryCode)}
              </span>
            </div>
          </div>

          {isLive && (
            <div className="inline-flex items-center gap-1.5 bg-red/10 text-red px-3 py-1 rounded-full text-caption font-bold">
              <Circle size={6} weight="fill" className="animate-pulse" />
              LIVE
            </div>
          )}
          {match.status === "completed" && (
            <span className="text-caption text-secondary">Full Time</span>
          )}

          <p className="text-micro text-secondary mt-3">
            Presented by Bitaxe Open Source Mining
          </p>
        </Card>
      </motion.div>

      {/* Hashrate Bar */}
      <motion.div variants={staggerItem}>
        <Card padding="md">
          <HashrateBar hashrateA={hrA} hashrateB={hrB} isLive={isLive} />
        </Card>
      </motion.div>

      {/* Match Stats */}
      <motion.div variants={staggerItem}>
        <Card padding="md">
          <h3 className="text-caption font-bold text-secondary uppercase tracking-wider mb-4">
            Match Stats
          </h3>
          <StatRow
            label="Miners"
            valueA={formatNumber(match.teamA.miners)}
            valueB={formatNumber(match.teamB.miners)}
          />
          <StatRow
            label="Hashrate"
            valueA={formatHashrate(hrA)}
            valueB={formatHashrate(hrB)}
          />
          <StatRow
            label="Blocks Found"
            valueA="0"
            valueB="0"
          />
          <StatRow
            label="Goals"
            valueA={String(match.teamA.score)}
            valueB={String(match.teamB.score)}
          />
        </Card>
      </motion.div>

      {/* Scoring Explainer */}
      <motion.div variants={staggerItem}>
        <Card padding="sm">
          <div className="flex items-center gap-2 px-4 py-3">
            <Lightning size={16} className="text-bitcoin flex-shrink-0" />
            <span className="text-caption text-secondary">
              <span className="font-semibold text-primary">Scoring:</span>{" "}
              1 goal per 5 PH/s + 3 bonus goals per block found
            </span>
          </div>
        </Card>
      </motion.div>

      {/* Man of the Match */}
      {match.manOfTheMatch && (
        <motion.div variants={staggerItem}>
          <Card padding="md">
            <h3 className="text-caption font-bold text-secondary uppercase tracking-wider mb-3">
              Man of the Match
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
                <Star size={20} weight="fill" className="text-gold" />
              </div>
              <div>
                <span className="font-semibold text-primary">{match.manOfTheMatch}</span>
                {match.manOfTheMatchDiff && (
                  <p className="text-caption text-secondary">
                    Highest difficulty share: {formatHashrate(match.manOfTheMatchDiff)}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Top Miners */}
      {(match.topMinersA || match.topMinersB) && (
        <motion.div variants={staggerItem}>
          <Card padding="md">
            <h3 className="text-caption font-bold text-secondary uppercase tracking-wider mb-4">
              Top Miners
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span>{getCountryFlag(match.teamA.countryCode)}</span>
                  <span className="text-caption font-semibold text-primary">
                    {getCountryName(match.teamA.countryCode)}
                  </span>
                </div>
                {match.topMinersA && (
                  <TopMinersList miners={match.topMinersA} side="left" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-3 justify-end">
                  <span className="text-caption font-semibold text-primary">
                    {getCountryName(match.teamB.countryCode)}
                  </span>
                  <span>{getCountryFlag(match.teamB.countryCode)}</span>
                </div>
                {match.topMinersB && (
                  <TopMinersList miners={match.topMinersB} side="right" />
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* AI Match Recap */}
      {match.aiRecap && (
        <motion.div variants={staggerItem}>
          <Card padding="md">
            <h3 className="text-caption font-bold text-secondary uppercase tracking-wider mb-3">
              Match Recap
            </h3>
            <blockquote className="border-l-2 border-bitcoin/40 pl-4">
              <p className="text-body text-primary/80 italic leading-relaxed">
                "{match.aiRecap}"
              </p>
            </blockquote>
          </Card>
        </motion.div>
      )}

      {/* Share button */}
      <motion.div variants={staggerItem} className="flex justify-center">
        <Button variant="secondary">
          <ShareNetwork size={18} className="mr-2" />
          Share Match Result
        </Button>
      </motion.div>
    </motion.div>
  );
}
