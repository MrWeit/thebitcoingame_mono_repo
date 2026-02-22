import { useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ShareNetwork, ArrowClockwise, GameController } from "@phosphor-icons/react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useGameData, type WeeklyGameData } from "@/hooks/useGameData";
import { Button } from "@/components/ui/Button";
import { formatDifficulty, formatNumber } from "@/mocks/data";

type GamePhase = "loading" | "intro" | "playing" | "result";

interface GameWrapperProps {
  gameName: string;
  gameSlug?: string;
  children: (props: {
    phase: GamePhase;
    setPhase: (phase: GamePhase) => void;
    gameData: WeeklyGameData;
    reducedMotion: boolean;
    onReplay: () => void;
  }) => ReactNode;
  onGenerateShareCard?: () => void;
}

export function GameWrapper({
  gameName,
  children,
  onGenerateShareCard,
}: GameWrapperProps) {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { data: gameData } = useGameData();
  const [phase, setPhase] = useState<GamePhase>(
    reducedMotion ? "result" : "loading"
  );
  const [replayKey, setReplayKey] = useState(0);

  const handleReplay = useCallback(() => {
    if (reducedMotion) return;
    setReplayKey((k) => k + 1);
    setPhase("loading");
  }, [reducedMotion]);

  const handleExit = useCallback(() => {
    navigate("/games");
  }, [navigate]);

  const handleShare = useCallback(() => {
    onGenerateShareCard?.();
  }, [onGenerateShareCard]);

  const handleTryDifferent = useCallback(() => {
    navigate("/games");
  }, [navigate]);

  return (
    <div className="fixed inset-0 z-50 bg-canvas overflow-hidden">
      {/* Exit button */}
      <motion.button
        onClick={handleExit}
        className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-radius-sm bg-surface/80 backdrop-blur-sm border border-white/6 text-secondary hover:text-primary transition-colors"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <ArrowLeft size={18} />
        <span className="text-caption hidden sm:inline">Exit</span>
      </motion.button>

      {/* Game name badge */}
      <motion.div
        className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-radius-full bg-surface/80 backdrop-blur-sm border border-white/6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <span className="text-caption text-secondary">{gameName}</span>
      </motion.div>

      {/* Game content */}
      <div key={replayKey} className="w-full h-full">
        {children({
          phase,
          setPhase,
          gameData,
          reducedMotion,
          onReplay: handleReplay,
        })}
      </div>

      {/* Reduced Motion Fallback */}
      {reducedMotion && (
        <div className="absolute inset-0 flex items-center justify-center bg-canvas p-6">
          <div className="max-w-md w-full bg-surface rounded-radius-lg border border-white/6 p-8 text-center space-y-6">
            <h2 className="text-display-md font-bold text-primary">
              {gameName}
            </h2>
            <div className="space-y-3">
              <p className="text-secondary">Your Result This Week</p>
              <p className="text-display-lg font-bold font-mono text-bitcoin tabular-nums">
                {formatDifficulty(gameData.bestDifficulty)}
              </p>
              <p className="text-body text-secondary">
                That&apos;s higher than {gameData.percentile}% of miners!
              </p>
              {gameData.blockFound && (
                <div className="mt-4 p-4 rounded-radius-md bg-bitcoin/10 border border-bitcoin/30">
                  <p className="text-title font-bold text-bitcoin">
                    YOU FOUND A BLOCK!
                  </p>
                  <p className="text-body-lg font-mono text-gold mt-1">
                    {gameData.blockData?.reward} BTC
                  </p>
                </div>
              )}
              <p className="text-caption text-secondary">
                Rank #{gameData.weeklyRank} this week
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button variant="primary" onClick={handleShare}>
                <ShareNetwork size={18} className="mr-2" />
                Share Result
              </Button>
              <Button variant="secondary" onClick={handleTryDifferent}>
                <GameController size={18} className="mr-2" />
                Try Different Game
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Post-game overlay */}
      <AnimatePresence>
        {phase === "result" && !reducedMotion && (
          <motion.div
            className="absolute bottom-0 left-0 right-0 z-40"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <div
              className="bg-gradient-to-t from-canvas via-canvas/95 to-transparent pt-10 sm:pt-16 px-4 sm:px-6"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}
            >
              <div className="max-w-lg mx-auto space-y-3 sm:space-y-4">
                {/* Result summary */}
                <div className="text-center space-y-1">
                  {gameData.blockFound ? (
                    <>
                      <p className="text-body-lg sm:text-title font-bold text-bitcoin">
                        YOU FOUND A BLOCK!
                      </p>
                      <p className="text-display-md font-bold font-mono text-gold tabular-nums">
                        {gameData.blockData?.reward} BTC
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-body-lg font-mono text-primary tabular-nums">
                        {formatNumber(gameData.bestDifficulty)}
                      </p>
                      <p className="text-caption text-secondary whitespace-nowrap">
                        Top {gameData.percentile}% — Rank #{gameData.weeklyRank}
                      </p>
                    </>
                  )}
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                  <Button
                    variant="secondary"
                    onClick={handleReplay}
                    size="sm"
                    leftIcon={<ArrowClockwise size={16} />}
                    fullWidth
                  >
                    Replay
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleShare}
                    size="sm"
                    leftIcon={<ShareNetwork size={16} />}
                    fullWidth
                  >
                    Share
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleTryDifferent}
                    size="sm"
                    leftIcon={<GameController size={16} />}
                    fullWidth
                  >
                    Other
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
