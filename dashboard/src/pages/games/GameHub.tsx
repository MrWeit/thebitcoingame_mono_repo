import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Hammer,
  Horse,
  Coins,
  Ticket,
  Trophy,
  CaretRight,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, durations, easings } from "@/lib/animation";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useGameData } from "@/hooks/useGameData";
import type { PastWeekResult } from "@/hooks/useGameData";
import { formatDifficulty } from "@/mocks/data";

/* ── Game Definitions ── */
interface GameDef {
  id: string;
  name: string;
  tagline: string;
  route: string;
  icon: Icon;
  accentColor: string;
  glowColor: string;
}

const GAMES: GameDef[] = [
  {
    id: "hammer",
    name: "The Hammer",
    tagline: "How high can your hash launch the weight?",
    route: "/games/hammer",
    icon: Hammer,
    accentColor: "text-bitcoin",
    glowColor: "rgba(247, 147, 26, 0.4)",
  },
  {
    id: "horse-race",
    name: "Horse Race",
    tagline: "Watch your difficulty race against the odds",
    route: "/games/horse-race",
    icon: Horse,
    accentColor: "text-green",
    glowColor: "rgba(63, 185, 80, 0.4)",
  },
  {
    id: "slots",
    name: "Slot Machine",
    tagline: "Visual hash matching on spinning reels",
    route: "/games/slots",
    icon: Coins,
    accentColor: "text-purple",
    glowColor: "rgba(163, 113, 247, 0.4)",
  },
  {
    id: "scratch",
    name: "Scratch Card",
    tagline: "Scratch to reveal your weekly difficulty",
    route: "/games/scratch",
    icon: Ticket,
    accentColor: "text-cyan",
    glowColor: "rgba(88, 166, 255, 0.4)",
  },
];

/* ── Game name lookup for past results ── */
const GAME_NAME_MAP: Record<string, string> = {
  hammer: "The Hammer",
  "horse-race": "Horse Race",
  slots: "Slot Machine",
  scratch: "Scratch Card",
};

const GAME_ICON_MAP: Record<string, Icon> = {
  hammer: Hammer,
  "horse-race": Horse,
  slots: Coins,
  scratch: Ticket,
};

/* ── 3D Tilt Card ── */
interface TiltCardProps {
  game: GameDef;
  onPlay: (route: string) => void;
  reducedMotion: boolean;
}

function TiltCard({ game, onPlay, reducedMotion }: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rotateX: 0, rotateY: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reducedMotion) return;
      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;

      const maxTilt = 10;
      const rotateY = (mouseX / (rect.width / 2)) * maxTilt;
      const rotateX = -(mouseY / (rect.height / 2)) * maxTilt;

      setTilt({ rotateX, rotateY });
    },
    [reducedMotion]
  );

  const handleMouseLeave = useCallback(() => {
    setTilt({ rotateX: 0, rotateY: 0 });
    setIsHovered(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const IconComponent = game.icon;

  return (
    <motion.div variants={staggerItem} className="w-full min-w-0">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseEnter={handleMouseEnter}
        className={cn(
          "relative overflow-hidden rounded-radius-lg w-full",
          "bg-surface border border-white/6",
          "transition-shadow duration-300",
          isHovered && "shadow-heavy border-white/10"
        )}
        style={{
          transform: `perspective(800px) rotateX(${tilt.rotateX}deg) rotateY(${tilt.rotateY}deg)`,
          transition: isHovered
            ? "transform 0.1s ease-out, box-shadow 0.3s ease"
            : "transform 0.4s ease-out, box-shadow 0.3s ease",
          width: "100%",
        }}
      >
        {/* Card content */}
        <div className="relative z-10 flex flex-col items-center p-6 sm:p-8 gap-4">
          {/* Icon with looping animation */}
          <div
            className={cn(
              "relative flex items-center justify-center",
              "w-20 h-20 rounded-full",
              "bg-elevated border border-white/6"
            )}
            style={{
              boxShadow: isHovered ? `0 0 30px ${game.glowColor}` : "none",
              transition: "box-shadow 0.3s ease",
            }}
          >
            <IconComponent
              size={40}
              weight="duotone"
              className={cn(game.accentColor, "game-icon-pulse")}
            />
          </div>

          {/* Game name */}
          <h3 className="text-headline font-semibold text-primary text-center">
            {game.name}
          </h3>

          {/* Tagline */}
          <p className="text-caption text-secondary text-center leading-relaxed max-w-[220px]">
            {game.tagline}
          </p>

          {/* Play button */}
          <Button
            variant="primary"
            size="md"
            onClick={() => onPlay(game.route)}
            rightIcon={<CaretRight size={16} weight="bold" />}
            className="mt-2"
          >
            PLAY NOW
          </Button>
        </div>

        {/* Subtle background gradient unique to each card */}
        <div
          className="absolute inset-0 opacity-0 transition-opacity duration-500 pointer-events-none"
          style={{
            opacity: isHovered ? 0.08 : 0,
            background: `radial-gradient(circle at 50% 0%, ${game.glowColor}, transparent 70%)`,
          }}
        />
      </div>
    </motion.div>
  );
}

/* ── Past Week Card ── */
interface PastWeekCardProps {
  week: PastWeekResult;
}

function PastWeekCard({ week }: PastWeekCardProps) {
  const IconComponent = GAME_ICON_MAP[week.gamePlayed] ?? Trophy;
  const gameName = GAME_NAME_MAP[week.gamePlayed] ?? week.gamePlayed;

  const weekStartStr = week.weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const weekEndStr = week.weekEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={cn(
        "flex-shrink-0 w-56 rounded-radius-lg",
        "bg-surface border border-white/4 p-4",
        "hover:border-white/8 transition-colors duration-200"
      )}
    >
      {/* Week range */}
      <p className="text-micro text-secondary uppercase tracking-wider mb-3">
        {weekStartStr} - {weekEndStr}
      </p>

      {/* Game played */}
      <div className="flex items-center gap-2 mb-3">
        <IconComponent size={18} weight="duotone" className="text-secondary" />
        <span className="text-caption text-primary font-medium">{gameName}</span>
      </div>

      {/* Stats */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-micro text-secondary">Best Diff</span>
          <Mono className="text-caption text-primary">
            {formatDifficulty(week.bestDifficulty)}
          </Mono>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-micro text-secondary">Rank</span>
          <Mono className="text-caption text-bitcoin font-medium">
            #{week.weeklyRank}
          </Mono>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function GameHub() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { data, pastWeeks } = useGameData();

  const handlePlay = useCallback(
    (route: string) => {
      navigate(route);
    },
    [navigate]
  );

  return (
    <div className="relative min-h-full pb-8">
      {/* ── Neon Grid Background ── */}
      <div className="neon-grid-bg" aria-hidden="true" />

      {/* ── Page Content ── */}
      <motion.div
        className="relative z-10 space-y-10 w-full"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {/* ── Header Section ── */}
        <motion.header
          className="text-center pt-4 sm:pt-8"
          variants={staggerItem}
        >
          <motion.h1
            className="text-display-lg sm:text-hero font-bold text-primary mb-4"
            initial={reducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: durations.large,
              ease: easings.gentle,
              delay: 0.1,
            }}
          >
            This Week&apos;s Results Are Ready!
          </motion.h1>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6"
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: durations.medium,
              ease: easings.gentle,
              delay: 0.3,
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-caption text-secondary">Your Best Diff:</span>
              <Mono className="text-body-lg text-primary font-semibold">
                {formatDifficulty(data.bestDifficulty)}
              </Mono>
            </div>
            <div className="hidden sm:block w-px h-5 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-caption text-secondary">Network Diff:</span>
              <Mono className="text-body-lg text-secondary">
                {formatDifficulty(data.networkDifficulty)}
              </Mono>
            </div>
          </motion.div>
        </motion.header>

        {/* ── Game Selection Grid ── */}
        <motion.section
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-3xl mx-auto">
            {GAMES.map((game) => (
              <TiltCard
                key={game.id}
                game={game}
                onPlay={handlePlay}
                reducedMotion={reducedMotion}
              />
            ))}
          </div>
        </motion.section>

        {/* ── Past Results Section ── */}
        {pastWeeks.length > 0 && (
          <motion.section variants={staggerItem}>
            <h2 className="text-headline font-semibold text-primary mb-4">
              Past Results
            </h2>

            <div
              className={cn(
                "flex gap-4 overflow-x-auto pb-4",
                "-mx-2 px-2",
                "scrollbar-thin"
              )}
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {pastWeeks.map((week, i) => (
                <PastWeekCard key={i} week={week} />
              ))}
            </div>
          </motion.section>
        )}
      </motion.div>

      {/* ── Inline Styles for Neon Grid + Icon Pulse ── */}
      <style>{`
        .neon-grid-bg {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
          z-index: 0;
        }

        .neon-grid-bg::before {
          content: "";
          position: absolute;
          inset: -50%;
          width: 200%;
          height: 200%;
          background-image:
            linear-gradient(
              to right,
              rgba(247, 147, 26, 0.06) 1px,
              transparent 1px
            ),
            linear-gradient(
              to bottom,
              rgba(247, 147, 26, 0.06) 1px,
              transparent 1px
            );
          background-size: 60px 60px;
          animation: neonGridDrift 20s linear infinite;
        }

        @keyframes neonGridDrift {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(60px, 60px);
          }
        }

        .game-icon-pulse {
          animation: iconPulse 2.5s ease-in-out infinite;
        }

        @keyframes iconPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }

        .scrollbar-thin::-webkit-scrollbar {
          height: 4px;
        }

        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }

        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(139, 148, 158, 0.3);
          border-radius: 9999px;
        }

        @media (prefers-reduced-motion: reduce) {
          .neon-grid-bg::before {
            animation: none;
          }
          .game-icon-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
