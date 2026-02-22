import { useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { DownloadSimple, X, Check } from "@phosphor-icons/react";
import { type WeeklyGameData } from "@/hooks/useGameData";
import { formatNumber } from "@/mocks/data";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface ShareCardProps {
  gameName: string;
  gameData: WeeklyGameData;
  variant?: "landscape" | "square";
  onClose: () => void;
}

function ShareCardContent({
  gameName,
  gameData,
  variant,
}: Omit<ShareCardProps, "onClose">) {
  const isSquare = variant === "square";
  const weekStr = `${gameData.weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${gameData.weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-canvas",
        isSquare ? "w-[540px] h-[540px]" : "w-[600px] h-[315px]"
      )}
      style={{
        background: "linear-gradient(135deg, #06080C 0%, #0D1117 40%, #161B22 100%)",
      }}
    >
      {/* Decorative grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(247,147,26,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(247,147,26,0.15) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Content */}
      <div
        className={cn(
          "relative z-10 flex flex-col justify-between h-full",
          isSquare ? "p-10" : "p-8"
        )}
      >
        {/* Top: Game name + week */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-bitcoin flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="text-caption text-secondary font-medium uppercase tracking-wider">
              {gameName}
            </span>
          </div>
          <span className="text-micro text-secondary">{weekStr}</span>
        </div>

        {/* Center: Result */}
        <div className={cn("text-center", isSquare ? "space-y-6" : "space-y-3")}>
          {gameData.blockFound ? (
            <>
              <p className="text-headline font-bold text-bitcoin uppercase tracking-wider">
                Block Found!
              </p>
              <p
                className={cn(
                  "font-bold font-mono text-gold tabular-nums",
                  isSquare ? "text-hero" : "text-display-lg"
                )}
              >
                {gameData.blockData?.reward} BTC
              </p>
              <p className="text-body text-secondary">
                Block #{formatNumber(gameData.blockData?.height ?? 0)}
              </p>
            </>
          ) : (
            <>
              <p className="text-caption text-secondary uppercase tracking-wider">
                Best Difficulty
              </p>
              <p
                className={cn(
                  "font-bold font-mono text-primary tabular-nums",
                  isSquare ? "text-hero" : "text-display-lg"
                )}
              >
                {formatNumber(gameData.bestDifficulty)}
              </p>
              <p className="text-body text-secondary">
                Higher than{" "}
                <span className="text-bitcoin font-semibold">
                  {gameData.percentile}%
                </span>{" "}
                of all miners — Rank #{gameData.weeklyRank}
              </p>
            </>
          )}
        </div>

        {/* Bottom: Branding */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-caption font-bold text-primary">
              TheBitcoinGame
            </span>
          </div>
          <span className="text-micro text-secondary font-mono">
            {gameData.userName}
          </span>
        </div>
      </div>

      {/* Corner accent */}
      <div
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #F7931A 0%, transparent 70%)",
        }}
      />
    </div>
  );
}

export function ShareCardModal({ gameName, gameData, onClose }: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [variant, setVariant] = useState<"landscape" | "square">("landscape");

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);

    try {
      // Dynamic import html-to-image (lighter than html2canvas)
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        quality: 0.95,
      });

      const link = document.createElement("a");
      link.download = `thebitcoingame-${gameName.toLowerCase().replace(/\s+/g, "-")}-result.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      // Fallback: try canvas approach
      console.warn("Share card generation failed");
    } finally {
      setDownloading(false);
    }
  }, [gameName]);

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
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/6">
          <h3 className="text-headline font-semibold">Share Your Result</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-radius-sm text-secondary hover:text-primary transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Size toggle */}
        <div className="flex gap-2 px-6 pt-4">
          <button
            onClick={() => setVariant("landscape")}
            className={cn(
              "px-3 py-1.5 rounded-radius-sm text-caption transition-colors",
              variant === "landscape"
                ? "bg-bitcoin/20 text-bitcoin"
                : "bg-elevated text-secondary hover:text-primary"
            )}
          >
            1200 x 630
          </button>
          <button
            onClick={() => setVariant("square")}
            className={cn(
              "px-3 py-1.5 rounded-radius-sm text-caption transition-colors",
              variant === "square"
                ? "bg-bitcoin/20 text-bitcoin"
                : "bg-elevated text-secondary hover:text-primary"
            )}
          >
            1080 x 1080
          </button>
        </div>

        {/* Card preview */}
        <div className="p-6 flex justify-center">
          <div
            ref={cardRef}
            className="rounded-radius-md overflow-hidden shadow-heavy"
            style={{ transform: "scale(0.85)", transformOrigin: "center" }}
          >
            <ShareCardContent
              gameName={gameName}
              gameData={gameData}
              variant={variant}
            />
          </div>
        </div>

        {/* Download button */}
        <div className="px-6 pb-6">
          <Button
            variant="primary"
            onClick={handleDownload}
            className="w-full"
          >
            {downloading ? (
              <>
                <Check size={18} className="mr-2" />
                Generating...
              </>
            ) : (
              <>
                <DownloadSimple size={18} className="mr-2" />
                Download PNG
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
