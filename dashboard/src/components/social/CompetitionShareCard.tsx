import { useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { DownloadSimple, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { getCountryFlag, getCountryName } from "@/mocks/competition";
import { formatHashrate } from "@/mocks/data";

type CardType = "match" | "ranking" | "coop";

interface MatchData {
  teamACode: string;
  teamBCode: string;
  scoreA: number;
  scoreB: number;
  hashrateA: number;
  hashrateB: number;
  round: string;
}

interface RankingData {
  rank: number;
  displayName: string;
  bestDiff: string;
  period: string;
}

interface CoopData {
  coopName: string;
  memberCount: number;
  combinedHashrate: number;
  weeklyStreak: number;
}

interface ShareCardProps {
  type: CardType;
  matchData?: MatchData;
  rankingData?: RankingData;
  coopData?: CoopData;
  onClose: () => void;
}

// ── Card Contents ──

function MatchShareContent({ data }: { data: MatchData }) {
  const total = data.hashrateA + data.hashrateB;
  const pctA = total > 0 ? (data.hashrateA / total) * 100 : 50;

  return (
    <div className="w-[600px] h-[315px] relative overflow-hidden" style={{ background: "linear-gradient(135deg, #06080C 0%, #0D1117 40%, #161B22 100%)" }}>
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(247,147,26,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(247,147,26,0.15) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 flex flex-col justify-between h-full p-8">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#8B949E] font-medium uppercase tracking-wider">{data.round}</span>
          <span className="text-xs text-[#8B949E]">TheBitcoinGame</span>
        </div>

        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <span className="text-4xl block">{getCountryFlag(data.teamACode)}</span>
              <span className="text-xs text-[#E6EDF3] font-medium mt-1 block">{getCountryName(data.teamACode)}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-3xl text-[#E6EDF3]">{data.scoreA}</span>
              <span className="text-[#8B949E] text-lg">—</span>
              <span className="font-mono font-bold text-3xl text-[#E6EDF3]">{data.scoreB}</span>
            </div>
            <div className="text-center">
              <span className="text-4xl block">{getCountryFlag(data.teamBCode)}</span>
              <span className="text-xs text-[#E6EDF3] font-medium mt-1 block">{getCountryName(data.teamBCode)}</span>
            </div>
          </div>

          {/* Hashrate bar */}
          <div className="max-w-[400px] mx-auto">
            <div className="h-3 rounded-full overflow-hidden bg-[#161B22] border border-[rgba(255,255,255,0.06)]">
              <div className="h-full bg-gradient-to-r from-[#58A6FF] to-[#58A6FF]/60 rounded-full" style={{ width: `${pctA}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] font-mono text-[#58A6FF]">{formatHashrate(data.hashrateA)}</span>
              <span className="text-[10px] font-mono text-[#F7931A]">{formatHashrate(data.hashrateB)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#F7931A] flex items-center justify-center">
              <span className="text-white font-bold text-[8px]">B</span>
            </div>
            <span className="text-[10px] font-bold text-[#E6EDF3]">Solo Mining World Cup</span>
          </div>
          <span className="text-[10px] text-[#8B949E]">Presented by Bitaxe</span>
        </div>
      </div>

      <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #F7931A 0%, transparent 70%)" }} />
    </div>
  );
}

function RankingShareContent({ data }: { data: RankingData }) {
  return (
    <div className="w-[600px] h-[315px] relative overflow-hidden" style={{ background: "linear-gradient(135deg, #06080C 0%, #0D1117 40%, #161B22 100%)" }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(247,147,26,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(247,147,26,0.15) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 flex flex-col justify-between h-full p-8">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#8B949E] font-medium uppercase tracking-wider">{data.period} Leaderboard</span>
          <span className="text-xs text-[#8B949E]">TheBitcoinGame</span>
        </div>

        <div className="text-center space-y-3">
          <p className="text-xs text-[#8B949E] uppercase tracking-wider">Ranked</p>
          <p className="font-mono font-bold text-5xl text-[#F7931A]">#{data.rank}</p>
          <p className="text-sm text-[#E6EDF3] font-semibold">{data.displayName}</p>
          <p className="text-xs text-[#8B949E]">Best Difficulty: <span className="text-[#E6EDF3] font-mono">{data.bestDiff}</span></p>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#F7931A] flex items-center justify-center">
            <span className="text-white font-bold text-[8px]">B</span>
          </div>
          <span className="text-[10px] font-bold text-[#E6EDF3]">TheBitcoinGame</span>
        </div>
      </div>

      <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #F7931A 0%, transparent 70%)" }} />
    </div>
  );
}

function CoopShareContent({ data }: { data: CoopData }) {
  return (
    <div className="w-[600px] h-[315px] relative overflow-hidden" style={{ background: "linear-gradient(135deg, #06080C 0%, #0D1117 40%, #161B22 100%)" }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "linear-gradient(rgba(247,147,26,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(247,147,26,0.15) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 flex flex-col justify-between h-full p-8">
        <div className="flex justify-between items-center">
          <span className="text-xs text-[#8B949E] font-medium uppercase tracking-wider">Cooperative</span>
          <span className="text-xs text-[#8B949E]">TheBitcoinGame</span>
        </div>

        <div className="text-center space-y-3">
          <p className="font-bold text-2xl text-[#E6EDF3]">{data.coopName}</p>
          <div className="flex items-center justify-center gap-6 text-xs text-[#8B949E]">
            <span>{data.memberCount} members</span>
            <span>{formatHashrate(data.combinedHashrate)}</span>
            <span className="text-[#F7931A]">{data.weeklyStreak}w streak</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-[#F7931A] flex items-center justify-center">
            <span className="text-white font-bold text-[8px]">B</span>
          </div>
          <span className="text-[10px] font-bold text-[#E6EDF3]">TheBitcoinGame</span>
        </div>
      </div>

      <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20" style={{ background: "radial-gradient(circle, #F7931A 0%, transparent 70%)" }} />
    </div>
  );
}

// ── Share Card Modal ──

export function CompetitionShareCardModal({
  type,
  matchData,
  rankingData,
  coopData,
  onClose,
}: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, quality: 0.95 });
      const link = document.createElement("a");
      link.download = `thebitcoingame-${type}-result.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      console.warn("Share card generation failed");
    } finally {
      setDownloading(false);
    }
  }, [type]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="bg-surface rounded-radius-lg border border-white/6 overflow-hidden max-w-[680px] w-full"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
          <h3 className="text-headline font-semibold">Share Result</h3>
          <button onClick={onClose} className="p-1 rounded-radius-sm text-secondary hover:text-primary transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex justify-center">
          <div ref={cardRef} className="rounded-radius-md overflow-hidden shadow-heavy" style={{ transform: "scale(0.85)", transformOrigin: "center" }}>
            {type === "match" && matchData && <MatchShareContent data={matchData} />}
            {type === "ranking" && rankingData && <RankingShareContent data={rankingData} />}
            {type === "coop" && coopData && <CoopShareContent data={coopData} />}
          </div>
        </div>

        <div className="px-6 pb-6">
          <Button variant="primary" onClick={handleDownload} className="w-full">
            <DownloadSimple size={18} className="mr-2" />
            {downloading ? "Generating..." : "Download PNG"}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
