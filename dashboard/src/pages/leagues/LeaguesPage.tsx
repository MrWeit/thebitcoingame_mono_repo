import { useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy,
  Shield,
  CaretRight,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";
import { mockLeagues, type League } from "@/mocks/competition";
import { formatHashrate } from "@/mocks/data";

// ── League Table ──

function LeagueTable({ league }: { league: League }) {
  const sorted = [...league.clubs].sort((a, b) => b.points - a.points);
  const totalClubs = sorted.length;
  const promotionZone = 3;
  const relegationStart = totalClubs - 3;

  return (
    <Card padding="sm" className="overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-2.5 text-micro text-secondary uppercase tracking-wider border-b border-white/4 bg-elevated/50">
        <div className="w-8 text-center">#</div>
        <div className="flex-1">Club</div>
        <div className="w-8 text-center">P</div>
        <div className="w-8 text-center hidden sm:block">W</div>
        <div className="w-8 text-center hidden sm:block">D</div>
        <div className="w-8 text-center hidden sm:block">L</div>
        <div className="w-10 text-center font-bold">Pts</div>
        <div className="w-20 text-right hidden md:block">Hashrate</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.02]">
        {sorted.map((club, i) => {
          const isPromotion = i < promotionZone;
          const isRelegation = i >= relegationStart;

          return (
            <motion.div
              key={club.id}
              variants={{
                initial: { opacity: 0, x: -10 },
                animate: { opacity: 1, x: 0 },
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-3 transition-colors hover:bg-spotlight/50",
                club.isUserClub && "bg-bitcoin/[0.03]"
              )}
            >
              {/* Rank with zone indicator */}
              <div className="w-8 text-center relative">
                <div
                  className={cn(
                    "absolute left-0 top-0 bottom-0 w-1 rounded-full",
                    isPromotion && "bg-green",
                    isRelegation && "bg-red"
                  )}
                />
                <span className={cn(
                  "font-mono tabular-nums text-caption",
                  club.isUserClub ? "text-bitcoin font-bold" : "text-secondary"
                )}>
                  {i + 1}
                </span>
              </div>

              {/* Club name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                  club.isUserClub ? "bg-bitcoin/10" : "bg-elevated"
                )}>
                  <Shield size={14} weight="duotone" className={club.isUserClub ? "text-bitcoin" : "text-secondary"} />
                </div>
                <span className={cn(
                  "text-caption font-medium truncate",
                  club.isUserClub ? "text-bitcoin" : "text-primary"
                )}>
                  {club.name}
                  {club.isUserClub && <span className="text-micro text-secondary ml-1">(You)</span>}
                </span>
              </div>

              {/* Stats */}
              <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary">{club.played}</div>
              <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary hidden sm:block">{club.won}</div>
              <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary hidden sm:block">{club.drawn}</div>
              <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary hidden sm:block">{club.lost}</div>
              <div className="w-10 text-center font-mono tabular-nums text-caption font-bold text-primary">{club.points}</div>
              <div className="w-20 text-right font-mono tabular-nums text-micro text-secondary hidden md:block">
                {formatHashrate(club.hashrate)}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-white/4 bg-elevated/30">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green" />
          <span className="text-micro text-secondary">Promotion</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-red" />
          <span className="text-micro text-secondary">Relegation</span>
        </div>
      </div>
    </Card>
  );
}

// ── Featured League Card ──

function LeagueCard({
  league,
  selected,
  onClick,
}: {
  league: League;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Card
      variant="interactive"
      padding="md"
      onClick={onClick}
      className={cn(
        selected && "border-bitcoin/30 bg-bitcoin/[0.03]"
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-radius-md",
          league.division === 0 ? "bg-gold/10" : "bg-elevated"
        )}>
          <Trophy
            size={20}
            weight="duotone"
            className={league.division === 0 ? "text-gold" : "text-secondary"}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-primary text-caption">{league.name}</h3>
          <p className="text-micro text-secondary">{league.clubs.length} clubs</p>
        </div>
        <CaretRight size={16} className="text-secondary" />
      </div>
    </Card>
  );
}

// ── Main Page ──

export default function LeaguesPage() {
  const [selectedLeague, setSelectedLeague] = useState<string>("champions");
  const league = mockLeagues.find((l) => l.id === selectedLeague) ?? mockLeagues[0];

  const userClub = league.clubs.find((c) => c.isUserClub);
  const userPosition = userClub
    ? [...league.clubs].sort((a, b) => b.points - a.points).findIndex((c) => c.isUserClub) + 1
    : null;

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Header */}
      <motion.div variants={staggerItem} className="flex items-center gap-3">
        <div className="p-2 rounded-radius-md bg-gold/10">
          <Trophy size={24} weight="duotone" className="text-gold" />
        </div>
        <div>
          <h1 className="text-title font-bold">Leagues</h1>
          <p className="text-caption text-secondary">Club-based mining competition</p>
        </div>
      </motion.div>

      {/* My Club banner */}
      {userClub && (
        <motion.div variants={staggerItem}>
          <Card padding="md" className="border-l-2 border-l-bitcoin bg-bitcoin/[0.02]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-bitcoin/10 flex items-center justify-center">
                  <Shield size={20} weight="duotone" className="text-bitcoin" />
                </div>
                <div>
                  <span className="text-caption text-secondary">My Club</span>
                  <h3 className="font-semibold text-primary">{userClub.name}</h3>
                </div>
              </div>
              <div className="text-right">
                <span className="text-caption text-secondary block">{league.name}</span>
                <span className="font-mono tabular-nums font-bold text-primary">
                  Position: {userPosition}
                  {userPosition && userPosition <= 3 ? "th" : "th"}
                </span>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* League selector */}
      <motion.div variants={staggerItem}>
        <h2 className="text-headline font-bold mb-3">Featured Leagues</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {mockLeagues.map((l) => (
            <LeagueCard
              key={l.id}
              league={l}
              selected={selectedLeague === l.id}
              onClick={() => setSelectedLeague(l.id)}
            />
          ))}
        </div>
      </motion.div>

      {/* League table */}
      <motion.div variants={staggerItem}>
        <h2 className="text-headline font-bold mb-3">{league.name} Table</h2>
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <LeagueTable league={league} />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
