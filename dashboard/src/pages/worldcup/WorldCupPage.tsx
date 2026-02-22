import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Trophy,
  Lightning,
  CalendarBlank,
  ArrowRight,
  Circle,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";
import {
  mockWorldCup,
  mockGroupMatches,
  getCountryFlag,
  getCountryName,
  type Competition,
  type Group,
  type Match,
} from "@/mocks/competition";
// TODO: formatHashrate will be used when live data is wired

// ── Countdown Timer ──

function Countdown({ target }: { target: Date }) {
  const [diff, setDiff] = useState(target.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (diff <= 0) return <span className="text-green font-bold">LIVE NOW</span>;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  const units = [
    { label: "DAYS", value: days },
    { label: "HRS", value: hours },
    { label: "MIN", value: minutes },
    { label: "SEC", value: seconds },
  ];

  return (
    <div className="flex gap-3">
      {units.map((u) => (
        <div key={u.label} className="text-center">
          <div className="bg-elevated border border-white/6 rounded-radius-md px-3 py-2 min-w-[52px]">
            <span className="font-mono text-headline font-bold tabular-nums text-primary">
              {String(u.value).padStart(2, "0")}
            </span>
          </div>
          <span className="text-micro text-secondary mt-1 block">{u.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Group Card ──

function GroupCard({ group }: { group: Group }) {
  const sorted = [...group.teams].sort((a, b) => b.points - a.points);

  return (
    <Card padding="sm" className="overflow-hidden">
      <div className="px-4 py-3 border-b border-white/4">
        <h3 className="text-caption font-bold text-secondary uppercase tracking-wider">
          {group.name}
        </h3>
      </div>

      <div className="divide-y divide-white/[0.02]">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 text-micro text-secondary">
          <div className="flex-1">Team</div>
          <div className="w-8 text-center">P</div>
          <div className="w-8 text-center">W</div>
          <div className="w-8 text-center">D</div>
          <div className="w-8 text-center">L</div>
          <div className="w-10 text-center font-bold">Pts</div>
        </div>

        {sorted.map((team, i) => (
          <div
            key={team.countryCode}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 transition-colors",
              i < 2 && "bg-green/[0.03]",
              team.countryCode === "PT" && "bg-bitcoin/[0.04]"
            )}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {i < 2 && (
                <div className="w-1 h-4 rounded-full bg-green flex-shrink-0" />
              )}
              <span className="text-sm">{getCountryFlag(team.countryCode)}</span>
              <span className="text-caption font-medium text-primary truncate">
                {team.countryName}
              </span>
            </div>
            <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary">{team.played}</div>
            <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary">{team.won}</div>
            <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary">{team.drawn}</div>
            <div className="w-8 text-center font-mono tabular-nums text-caption text-secondary">{team.lost}</div>
            <div className="w-10 text-center font-mono tabular-nums text-caption font-bold text-primary">{team.points}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Match Card ──

function MatchCard({ match, onClick }: { match: Match; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group flex items-center gap-3 px-4 py-3 rounded-radius-md cursor-pointer transition-colors hover:bg-spotlight/50"
    >
      {/* Team A */}
      <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
        <span className="font-medium text-primary text-caption truncate hidden sm:inline">
          {getCountryName(match.teamA.countryCode)}
        </span>
        <span className="text-lg">{getCountryFlag(match.teamA.countryCode)}</span>
      </div>

      {/* Score / Status */}
      <div className="w-24 text-center flex-shrink-0">
        {match.status === "completed" || match.status === "live" ? (
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono font-bold text-body tabular-nums text-primary">
              {match.teamA.score}
            </span>
            <span className="text-secondary text-caption">—</span>
            <span className="font-mono font-bold text-body tabular-nums text-primary">
              {match.teamB.score}
            </span>
          </div>
        ) : (
          <span className="text-micro text-secondary">
            {match.matchDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        )}
      </div>

      {/* Team B */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-lg">
          {match.teamB.countryCode ? getCountryFlag(match.teamB.countryCode) : "🏳️"}
        </span>
        <span className="font-medium text-primary text-caption truncate hidden sm:inline">
          {match.teamB.countryCode ? getCountryName(match.teamB.countryCode) : "TBD"}
        </span>
      </div>

      {/* Status tag */}
      <div className="w-20 flex-shrink-0 text-right">
        {match.status === "live" && (
          <span className="inline-flex items-center gap-1 text-micro font-bold text-red">
            <Circle size={6} weight="fill" className="animate-pulse" />
            LIVE
          </span>
        )}
        {match.status === "completed" && (
          <span className="text-micro text-secondary">FT</span>
        )}
        {match.status === "scheduled" && (
          <span className="text-micro text-secondary">
            {match.matchDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Tournament Bracket ──

function TournamentBracket({ matches, onMatchClick }: { matches: Match[]; onMatchClick: (m: Match) => void }) {
  const quarters = matches.filter((m) => m.round === "quarter");
  const semis = matches.filter((m) => m.round === "semi");
  const final = matches.filter((m) => m.round === "final");

  function BracketNode({ match }: { match: Match }) {
    const isCompleted = match.status === "completed";
    const isLive = match.status === "live";

    return (
      <div
        onClick={() => onMatchClick(match)}
        className={cn(
          "bg-elevated border rounded-radius-md p-3 cursor-pointer transition-all hover:border-white/12 min-w-[180px]",
          isLive ? "border-red/40 shadow-[0_0_12px_rgba(248,81,73,0.1)]" : "border-white/6"
        )}
      >
        {isLive && (
          <div className="flex items-center gap-1 mb-2">
            <Circle size={6} weight="fill" className="text-red animate-pulse" />
            <span className="text-micro font-bold text-red">LIVE</span>
          </div>
        )}

        {/* Team A */}
        <div className={cn(
          "flex items-center justify-between gap-2 py-1",
          isCompleted && match.teamA.score > match.teamB.score && "text-primary",
          isCompleted && match.teamA.score < match.teamB.score && "text-secondary"
        )}>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {match.teamA.countryCode ? getCountryFlag(match.teamA.countryCode) : "🏳️"}
            </span>
            <span className="text-caption font-medium">
              {match.teamA.countryCode ? match.teamA.countryCode : "TBD"}
            </span>
          </div>
          {(isCompleted || isLive) && (
            <span className="font-mono font-bold tabular-nums text-caption">
              {match.teamA.score}
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-white/4 my-1" />

        {/* Team B */}
        <div className={cn(
          "flex items-center justify-between gap-2 py-1",
          isCompleted && match.teamB.score > match.teamA.score && "text-primary",
          isCompleted && match.teamB.score < match.teamA.score && "text-secondary"
        )}>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {match.teamB.countryCode ? getCountryFlag(match.teamB.countryCode) : "🏳️"}
            </span>
            <span className="text-caption font-medium">
              {match.teamB.countryCode ? match.teamB.countryCode : "TBD"}
            </span>
          </div>
          {(isCompleted || isLive) && (
            <span className="font-mono font-bold tabular-nums text-caption">
              {match.teamB.score}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex items-center gap-8 min-w-[700px] px-4">
        {/* Quarter Finals */}
        <div className="space-y-4 flex-shrink-0">
          <div className="text-micro text-secondary uppercase tracking-wider text-center mb-2">
            Quarter-Finals
          </div>
          {quarters.map((m) => (
            <BracketNode key={m.id} match={m} />
          ))}
        </div>

        {/* Connectors */}
        <div className="flex flex-col gap-[120px] flex-shrink-0">
          {[0, 1].map((i) => (
            <div key={i} className="w-8 h-[1px] bg-white/10" />
          ))}
        </div>

        {/* Semi Finals */}
        <div className="space-y-[100px] flex-shrink-0">
          <div className="text-micro text-secondary uppercase tracking-wider text-center mb-2">
            Semi-Finals
          </div>
          {semis.map((m) => (
            <BracketNode key={m.id} match={m} />
          ))}
        </div>

        {/* Connector */}
        <div className="w-8 h-[1px] bg-white/10 flex-shrink-0" />

        {/* Final */}
        <div className="flex-shrink-0">
          <div className="text-micro text-secondary uppercase tracking-wider text-center mb-2">
            Final
          </div>
          {final.map((m) => (
            <BracketNode key={m.id} match={m} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Upcoming State ──

function UpcomingState() {
  const nextCupStart = new Date("2027-01-15");
  return (
    <div className="text-center space-y-8 py-12">
      <div className="inline-flex p-4 rounded-full bg-gold/10">
        <Trophy size={48} weight="duotone" className="text-gold" />
      </div>
      <div>
        <h2 className="text-display-md font-bold">Next World Cup</h2>
        <p className="text-body text-secondary mt-2">
          Registration opens soon. Gather your country's miners!
        </p>
      </div>
      <Countdown target={nextCupStart} />
      <Button variant="primary" className="mx-auto">
        <CalendarBlank size={18} className="mr-2" />
        Set Reminder
      </Button>
    </div>
  );
}

// ── Registration State ──

function RegistrationState({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-4 py-8">
        <h2 className="text-display-md font-bold">Registration Open</h2>
        <p className="text-body text-secondary max-w-lg mx-auto">
          Countries need a minimum of 5 miners to qualify. Register now to represent your country!
        </p>
        <Countdown target={new Date(Date.now() + 14 * 86_400_000)} />
      </div>
      <div className="flex justify-center">
        <Button variant="primary" onClick={() => navigate("/world-cup/register")}>
          Register Your Country
          <ArrowRight size={18} className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

// ── Group Stage State (primary) ──

function GroupStageState({
  cup,
  navigate,
}: {
  cup: Competition;
  navigate: (path: string) => void;
}) {
  const allMatches = [
    ...mockGroupMatches,
    ...cup.knockoutMatches.filter((m) => m.status === "live"),
  ].sort((a, b) => b.matchDate.getTime() - a.matchDate.getTime());

  const liveMatch = cup.knockoutMatches.find((m) => m.status === "live");

  return (
    <div className="space-y-6">
      {/* Live match banner */}
      {liveMatch && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden"
        >
          <Card
            padding="md"
            className="border-red/20 cursor-pointer"
            onClick={() => navigate(`/world-cup/${cup.id}/match/${liveMatch.id}`)}
          >
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red/0 via-red to-red/0" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Circle size={8} weight="fill" className="text-red animate-pulse" />
                <span className="text-caption font-bold text-red uppercase tracking-wider">
                  Live Now — Semi-Final
                </span>
              </div>
              <ArrowRight size={16} className="text-secondary" />
            </div>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getCountryFlag(liveMatch.teamA.countryCode)}</span>
                <span className="font-semibold text-primary">
                  {getCountryName(liveMatch.teamA.countryCode)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-title tabular-nums">
                  {liveMatch.teamA.score}
                </span>
                <span className="text-secondary">—</span>
                <span className="font-mono font-bold text-title tabular-nums">
                  {liveMatch.teamB.score}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-primary">
                  {getCountryName(liveMatch.teamB.countryCode)}
                </span>
                <span className="text-2xl">{getCountryFlag(liveMatch.teamB.countryCode)}</span>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Group standings */}
      <div>
        <h2 className="text-headline font-bold mb-4">Group Standings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cup.groups.map((group) => (
            <GroupCard key={group.name} group={group} />
          ))}
        </div>
      </div>

      {/* Knockout Bracket */}
      {cup.knockoutMatches.length > 0 && (
        <div>
          <h2 className="text-headline font-bold mb-4">Knockout Stage</h2>
          <Card padding="md">
            <TournamentBracket
              matches={cup.knockoutMatches}
              onMatchClick={(m) => navigate(`/world-cup/${cup.id}/match/${m.id}`)}
            />
          </Card>
        </div>
      )}

      {/* Recent matches */}
      <div>
        <h2 className="text-headline font-bold mb-4">Recent Matches</h2>
        <Card padding="sm">
          <div className="divide-y divide-white/[0.02]">
            {allMatches.slice(0, 8).map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onClick={() => navigate(`/world-cup/${cup.id}/match/${match.id}`)}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Completed State ──

function CompletedState({ cup }: { cup: Competition }) {
  const finalMatch = cup.knockoutMatches.find((m) => m.round === "final");
  const winnerCode = finalMatch?.teamA.countryCode ?? "US";

  return (
    <div className="text-center space-y-8 py-12">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
      >
        <span className="text-[64px]">{getCountryFlag(winnerCode)}</span>
      </motion.div>
      <div>
        <h2 className="text-display-lg font-bold text-gold">WORLD CHAMPIONS</h2>
        <p className="text-title text-primary mt-2">{getCountryName(winnerCode)}</p>
        <p className="text-body text-secondary mt-1">{cup.name}</p>
      </div>
      <Trophy size={64} weight="duotone" className="text-gold mx-auto" />
    </div>
  );
}

// ── Main Page ──

export default function WorldCupPage() {
  const navigate = useNavigate();
  const cup = mockWorldCup;

  const renderState = () => {
    switch (cup.status) {
      case "upcoming":
        return <UpcomingState />;
      case "registration":
        return <RegistrationState navigate={navigate} />;
      case "group_stage":
      case "knockout":
        return <GroupStageState cup={cup} navigate={navigate} />;
      case "completed":
        return <CompletedState cup={cup} />;
    }
  };

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* Header */}
      <motion.div variants={staggerItem}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-radius-md bg-gold/10">
              <Trophy size={24} weight="duotone" className="text-gold" />
            </div>
            <div>
              <h1 className="text-title font-bold">{cup.name}</h1>
              <p className="text-caption text-secondary flex items-center gap-2">
                {cup.status === "group_stage" && (
                  <>
                    <Lightning size={14} weight="fill" className="text-green" />
                    Group Stage Active
                  </>
                )}
                {cup.status === "knockout" && "Knockout Stage"}
                {cup.status === "upcoming" && "Coming Soon"}
                {cup.status === "registration" && "Registration Open"}
                {cup.status === "completed" && "Completed"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate("/world-cup/my-team")}
            >
              My Team
            </Button>
            {(cup.status === "registration" || cup.status === "upcoming") && (
              <Button
                variant="primary"
                onClick={() => navigate("/world-cup/register")}
              >
                Register
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* State-based content */}
      <motion.div variants={staggerItem}>{renderState()}</motion.div>
    </motion.div>
  );
}
