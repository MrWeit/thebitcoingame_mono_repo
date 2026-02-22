import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Horse } from "@phosphor-icons/react";
import { GameWrapper } from "@/components/games/GameWrapper";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/animation";
import { formatDifficulty } from "@/mocks/data";
import { playSound } from "@/hooks/useGameData";
import type { WeeklyGameData } from "@/hooks/useGameData";

/* ── Constants ── */
const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const DAY_SHORT: Record<DayKey, string> = {
  mon: "MON",
  tue: "TUE",
  wed: "WED",
  thu: "THU",
  fri: "FRI",
  sat: "SAT",
  sun: "SUN",
};

const HORSE_COLORS: Record<DayKey, string> = {
  mon: "#F85149",
  tue: "#58A6FF",
  wed: "#3FB950",
  thu: "#A371F7",
  fri: "#F7931A",
  sat: "#39D0D8",
  sun: "#D4A843",
};

const RACE_DURATION_MS = 12_000;
const TRACK_WIDTH = 1600;
const HORSE_START_X = 60;
const FINISH_X = TRACK_WIDTH - 120;
const LANE_HEIGHT = 64;
const TRACK_TOTAL_HEIGHT = LANE_HEIGHT * 7;

/* ── Types ── */
interface HorseData {
  day: DayKey;
  speed: number; // 0-1, winner = 1.0
  difficulty: number;
  color: string;
}

/* ── Suspense easing — keeps the race tight early, dramatic spread late ── */
function racePosition(baseSpeed: number, progress: number): number {
  if (progress <= 0) return 0;
  if (progress >= 1) return baseSpeed;

  // Phase 1 (0-60%): horses stay bunched
  if (progress < 0.6) {
    const compressed = 0.4 + baseSpeed * 0.6;
    return progress * compressed;
  }

  // Phase 2 (60-100%): true speeds emerge, leader pulls away
  const phase1End = 0.6 * (0.4 + baseSpeed * 0.6);
  const remaining = progress - 0.6;
  const spread = remaining * (0.5 + baseSpeed * 2.0);
  return phase1End + spread;
}

/* ── Commentary logic ── */
function getCommentary(
  horses: HorseData[],
  progress: number,
  milestone: number
): string {
  const sorted = [...horses].sort(
    (a, b) => racePosition(b.speed, progress) - racePosition(a.speed, progress)
  );
  const leader = DAY_SHORT[sorted[0].day];
  const second = DAY_SHORT[sorted[1].day];

  const gap =
    racePosition(sorted[0].speed, progress) -
    racePosition(sorted[1].speed, progress);

  if (milestone === 25) {
    return gap < 0.02
      ? `It's a tight pack early — ${leader} and ${second} lead!`
      : `${leader} pushes to the front of the pack!`;
  }
  if (milestone === 50) {
    return gap < 0.03
      ? `Neck and neck! ${leader} and ${second} battling for the lead!`
      : `${leader} is pulling ahead at the halfway mark!`;
  }
  // 75%
  return gap < 0.04
    ? `Down the final stretch — ${leader} and ${second} fight for glory!`
    : `${leader} making a decisive move in the final stretch!`;
}

/* ── Horse SVG Component ── */
function HorseSVG({
  color,
  isUnicorn,
  gallop,
}: {
  color: string;
  isUnicorn: boolean;
  gallop: number; // 0-1 animation phase
}) {
  const legAngle = Math.sin(gallop * Math.PI * 2) * 20;
  const backLegAngle = Math.sin(gallop * Math.PI * 2 + Math.PI) * 20;

  return (
    <svg
      width="48"
      height="40"
      viewBox="0 0 48 40"
      fill="none"
      className="drop-shadow-lg"
    >
      {/* Glow for unicorn */}
      {isUnicorn && (
        <circle cx="24" cy="20" r="22" fill="#D4A843" opacity="0.2" />
      )}

      {/* Body */}
      <ellipse
        cx="22"
        cy="20"
        rx="14"
        ry="8"
        fill={isUnicorn ? "#D4A843" : color}
      />

      {/* Neck */}
      <path
        d="M 33 16 Q 38 8, 40 6"
        stroke={isUnicorn ? "#D4A843" : color}
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Head */}
      <ellipse
        cx="42"
        cy="5"
        rx="5"
        ry="3.5"
        fill={isUnicorn ? "#D4A843" : color}
      />

      {/* Eye */}
      <circle cx="44" cy="4.5" r="1" fill="#0D1117" />

      {/* Ear */}
      <path
        d="M 40 2 L 39 -1 L 41 1"
        fill={isUnicorn ? "#D4A843" : color}
      />

      {/* Unicorn horn */}
      {isUnicorn && (
        <path
          d="M 42 1 L 44 -5 L 43 1"
          fill="#F7931A"
          stroke="#F7931A"
          strokeWidth="0.5"
        />
      )}

      {/* Wings for unicorn */}
      {isUnicorn && (
        <>
          <path
            d="M 20 14 Q 16 4, 22 2 Q 26 6, 24 14"
            fill="#F7931A"
            opacity="0.7"
          />
          <path
            d="M 18 14 Q 12 6, 18 3 Q 22 8, 20 14"
            fill="#D4A843"
            opacity="0.5"
          />
        </>
      )}

      {/* Front legs */}
      <g transform={`rotate(${legAngle}, 30, 26)`}>
        <line
          x1="30"
          y1="26"
          x2="30"
          y2="37"
          stroke={isUnicorn ? "#B8922A" : color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g transform={`rotate(${backLegAngle}, 28, 26)`}>
        <line
          x1="28"
          y1="26"
          x2="28"
          y2="37"
          stroke={isUnicorn ? "#B8922A" : color}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.7"
        />
      </g>

      {/* Back legs */}
      <g transform={`rotate(${backLegAngle}, 14, 26)`}>
        <line
          x1="14"
          y1="26"
          x2="14"
          y2="37"
          stroke={isUnicorn ? "#B8922A" : color}
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g transform={`rotate(${legAngle}, 16, 26)`}>
        <line
          x1="16"
          y1="26"
          x2="16"
          y2="37"
          stroke={isUnicorn ? "#B8922A" : color}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.7"
        />
      </g>

      {/* Tail */}
      <path
        d={`M 8 18 Q ${4 + Math.sin(gallop * Math.PI * 3) * 3} ${14 + Math.sin(gallop * Math.PI * 2) * 2}, 5 22`}
        stroke={isUnicorn ? "#F7931A" : color}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />

      {/* Mane */}
      <path
        d={`M 35 12 Q ${33 + Math.sin(gallop * Math.PI * 2) * 2} 8, 36 6`}
        stroke={isUnicorn ? "#F7931A" : color}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}

/* ── Particle Burst ── */
function ParticleBurst({
  x,
  y,
  color,
  count,
  active,
}: {
  x: number;
  y: number;
  color: string;
  count: number;
  active: boolean;
}) {
  const particles = useMemo(() => {
    if (!active) return [];
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const velocity = 60 + Math.random() * 120;
      return {
        id: i,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 40,
        size: 3 + Math.random() * 5,
        delay: Math.random() * 0.15,
      };
    });
  }, [active, count]);

  if (!active) return null;

  return (
    <div
      className="absolute pointer-events-none"
      style={{ left: x, top: y, zIndex: 50 }}
    >
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: p.vx,
            y: p.vy + 80,
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 1.2,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

/* ── Results Board ── */
function ResultsBoard({
  horses,
  blockFound,
}: {
  horses: HorseData[];
  blockFound: boolean;
}) {
  const sorted = [...horses].sort((a, b) => b.speed - a.speed);
  const winner = sorted[0];

  return (
    <motion.div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[340px] max-w-[90vw]"
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ ...springs.bouncy, delay: 0.8 }}
    >
      <div className="bg-surface/95 backdrop-blur-md rounded-radius-lg border border-white/8 overflow-hidden shadow-heavy">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/6 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...springs.bouncy, delay: 1.0 }}
          >
            <Trophy
              size={32}
              weight="duotone"
              className={blockFound ? "text-bitcoin mx-auto mb-2" : "text-gold mx-auto mb-2"}
            />
          </motion.div>
          <h3 className="text-headline font-bold text-primary">
            {blockFound ? "BLOCK FOUND!" : "Race Results"}
          </h3>
          <p className="text-caption text-secondary mt-1">
            Your best race was on{" "}
            <span
              className="font-semibold"
              style={{ color: winner.color }}
            >
              {DAY_LABELS[winner.day]}
            </span>
            !
          </p>
        </div>

        {/* Standings */}
        <div className="px-5 py-3 space-y-0">
          {sorted.map((horse, i) => (
            <motion.div
              key={horse.day}
              className={cn(
                "flex items-center gap-3 py-2.5",
                i < sorted.length - 1 && "border-b border-white/4"
              )}
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1.0 + i * 0.08 }}
            >
              {/* Place */}
              <span
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-caption font-bold",
                  i === 0 && "bg-gold/20 text-gold",
                  i === 1 && "bg-white/10 text-primary",
                  i === 2 && "bg-bitcoin/10 text-bitcoin",
                  i > 2 && "bg-white/5 text-secondary"
                )}
              >
                {i + 1}
              </span>

              {/* Horse color dot + name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: horse.color }}
                />
                <span className="text-body text-primary font-medium truncate">
                  {DAY_LABELS[horse.day]}
                </span>
              </div>

              {/* Difficulty */}
              <span className="text-caption font-mono text-secondary tabular-nums">
                {formatDifficulty(horse.difficulty)}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ── Main Component ── */
function HorseRaceGame({
  phase,
  setPhase,
  gameData,
  reducedMotion,
}: {
  phase: "loading" | "intro" | "playing" | "result";
  setPhase: (phase: "loading" | "intro" | "playing" | "result") => void;
  gameData: WeeklyGameData;
  reducedMotion: boolean;
  onReplay: () => void;
}) {
  const [raceProgress, setRaceProgress] = useState(0);
  const [gallopPhase, setGallopPhase] = useState(0);
  const [commentary, setCommentary] = useState<string | null>(null);
  const [shownMilestones, setShownMilestones] = useState<Set<number>>(
    new Set()
  );
  const [showParticles, setShowParticles] = useState(false);
  const [winnerCrossed, setWinnerCrossed] = useState(false);

  const raceStartTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const commentaryTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const trackContainerRef = useRef<HTMLDivElement>(null);

  /* ── Compute horse data from game data ── */
  const horses = useMemo<HorseData[]>(() => {
    const diffs = gameData.dailyBestDiffs;
    const maxDiff = Math.max(
      ...DAY_KEYS.map((k) => diffs[k] ?? 0)
    );
    if (maxDiff === 0) {
      return DAY_KEYS.map((day) => ({
        day,
        speed: 1 / 7,
        difficulty: 0,
        color: HORSE_COLORS[day],
      }));
    }
    return DAY_KEYS.map((day) => ({
      day,
      speed: (diffs[day] ?? 0) / maxDiff,
      difficulty: diffs[day] ?? 0,
      color: HORSE_COLORS[day],
    }));
  }, [gameData.dailyBestDiffs]);

  const winnerHorse = useMemo(
    () => [...horses].sort((a, b) => b.speed - a.speed)[0],
    [horses]
  );

  /* ── Phase transitions ── */
  useEffect(() => {
    if (phase === "loading") {
      const t = setTimeout(() => setPhase("intro"), 2000);
      return () => clearTimeout(t);
    }
  }, [phase, setPhase]);

  /* ── Race animation loop ── */
  const startRace = useCallback(() => {
    setPhase("playing");
    playSound("race-start");
    raceStartTimeRef.current = performance.now();
    setRaceProgress(0);
    setShownMilestones(new Set());
    setCommentary(null);
    setShowParticles(false);
    setWinnerCrossed(false);

    const animate = (now: number) => {
      const elapsed = now - raceStartTimeRef.current;
      const progress = Math.min(elapsed / RACE_DURATION_MS, 1);
      setRaceProgress(progress);

      // Gallop phase for leg animation — faster as race progresses
      const gallopSpeed = 4 + progress * 8;
      setGallopPhase((elapsed / 1000) * gallopSpeed);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Race finished
        setWinnerCrossed(true);
        setShowParticles(true);
        playSound("race-finish");
        setTimeout(() => {
          setPhase("result");
        }, 1500);
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, [setPhase]);

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (commentaryTimeoutRef.current)
        clearTimeout(commentaryTimeoutRef.current);
    };
  }, []);

  /* ── Commentary triggers ── */
  useEffect(() => {
    if (phase !== "playing") return;

    const progressPercent = Math.floor(raceProgress * 100);

    for (const milestone of [25, 50, 75]) {
      if (progressPercent >= milestone && !shownMilestones.has(milestone)) {
        setShownMilestones((prev) => new Set(prev).add(milestone));
        const text = getCommentary(horses, raceProgress, milestone);
        setCommentary(text);
        playSound("commentary");

        if (commentaryTimeoutRef.current)
          clearTimeout(commentaryTimeoutRef.current);
        commentaryTimeoutRef.current = setTimeout(
          () => setCommentary(null),
          2500
        );
      }
    }
  }, [raceProgress, phase, horses, shownMilestones]);

  /* ── Track viewport panning — follow the leader ── */
  const viewportOffset = useMemo(() => {
    if (phase !== "playing" && phase !== "result") return 0;
    // Find the furthest horse position
    const maxPos = Math.max(
      ...horses.map((h) => {
        const pos = racePosition(h.speed, raceProgress);
        return HORSE_START_X + pos * (FINISH_X - HORSE_START_X);
      })
    );
    // Viewport width assumed ~window width, track scrolls to keep leader visible
    const viewWidth =
      typeof window !== "undefined" ? window.innerWidth : 800;
    const targetOffset = Math.max(0, maxPos - viewWidth * 0.6);
    return targetOffset;
  }, [raceProgress, horses, phase]);

  /* ── Determine if this horse becomes a unicorn (block found + is winner) ── */
  const isUnicorn = useCallback(
    (day: DayKey) => {
      return (
        gameData.blockFound &&
        day === winnerHorse.day &&
        raceProgress > 0.65
      );
    },
    [gameData.blockFound, winnerHorse.day, raceProgress]
  );

  /* ── Unicorn float effect ── */
  const unicornFloat = useCallback(
    (day: DayKey) => {
      if (!isUnicorn(day)) return 0;
      const floatProgress = Math.min((raceProgress - 0.65) / 0.35, 1);
      return -20 * floatProgress;
    },
    [isUnicorn, raceProgress]
  );

  /* ── Render ── */
  if (reducedMotion) return null; // GameWrapper handles reduced motion

  return (
    <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden bg-canvas relative">
      {/* ── Sky / atmosphere gradient ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, #06080C 0%, #0A0F16 40%, #111820 70%, #161D28 100%)",
        }}
      />

      {/* ── Loading phase ── */}
      <AnimatePresence>
        {phase === "loading" && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={springs.bouncy}
            >
              <Horse size={64} weight="duotone" className="text-green" />
            </motion.div>

            <motion.div className="flex gap-1">
              {DAY_KEYS.map((day, i) => (
                <motion.div
                  key={day}
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: HORSE_COLORS[day] }}
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
                />
              ))}
            </motion.div>

            <motion.p
              className="text-headline font-bold text-primary"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 }}
            >
              Preparing the track...
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Intro phase — "And they're OFF!" ── */}
      <AnimatePresence>
        {phase === "intro" && (
          <motion.div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-8"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.h2
              className="text-display-lg sm:text-hero font-bold text-primary text-center px-4"
              initial={{ scale: 0.3, opacity: 0, rotate: -5 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ ...springs.bouncy, delay: 0.2 }}
            >
              And they&apos;re{" "}
              <span className="text-green">OFF!</span>
            </motion.h2>

            {/* Horse lineup preview */}
            <motion.div
              className="flex gap-4 flex-wrap justify-center px-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              {horses
                .slice()
                .sort((a, b) => b.speed - a.speed)
                .map((horse, i) => (
                  <motion.div
                    key={horse.day}
                    className="flex flex-col items-center gap-1"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{
                      x: [0, 3, -2, 1, 0],
                      opacity: 1,
                    }}
                    transition={{
                      x: {
                        repeat: Infinity,
                        duration: 0.5 + Math.random() * 0.3,
                        ease: "easeInOut",
                      },
                      opacity: { delay: 0.4 + i * 0.08 },
                    }}
                  >
                    <HorseSVG
                      color={horse.color}
                      isUnicorn={false}
                      gallop={0}
                    />
                    <span
                      className="text-micro font-bold uppercase tracking-wider"
                      style={{ color: horse.color }}
                    >
                      {DAY_SHORT[horse.day]}
                    </span>
                  </motion.div>
                ))}
            </motion.div>

            <motion.button
              className={cn(
                "px-8 py-3 rounded-radius-lg",
                "bg-green/20 border border-green/40 text-green",
                "text-headline font-bold uppercase tracking-wider",
                "hover:bg-green/30 hover:border-green/60",
                "active:scale-95 transition-all duration-150"
              )}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={startRace}
            >
              Start Race
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Race Track (visible during playing + result) ── */}
      {(phase === "playing" || phase === "result") && (
        <div className="absolute inset-0 flex flex-col justify-center overflow-hidden">
          {/* Commentary bubble */}
          <AnimatePresence>
            {commentary && (
              <motion.div
                className="absolute top-6 left-1/2 -translate-x-1/2 z-30 px-5 py-3 rounded-radius-lg bg-surface/90 backdrop-blur-sm border border-white/10 shadow-heavy max-w-[90vw]"
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.3 }}
              >
                <p className="text-body font-semibold text-primary text-center whitespace-nowrap">
                  {commentary}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Block Found banner */}
          <AnimatePresence>
            {gameData.blockFound && winnerCrossed && (
              <motion.div
                className="absolute top-16 left-1/2 -translate-x-1/2 z-30"
                initial={{ scale: 0, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={springs.bouncy}
              >
                <div className="px-6 py-3 rounded-radius-lg bg-bitcoin/20 border-2 border-bitcoin shadow-heavy">
                  <p className="text-display-md font-bold text-bitcoin text-center">
                    BLOCK FOUND!
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Progress bar */}
          {phase === "playing" && (
            <div className="absolute top-3 left-4 right-4 z-20">
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-green/60 rounded-full"
                  style={{ width: `${raceProgress * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Track container — pans horizontally */}
          <div
            ref={trackContainerRef}
            className="relative w-full"
            style={{ height: TRACK_TOTAL_HEIGHT + 60 }}
          >
            <div
              className="absolute top-0 left-0 transition-transform duration-100 ease-linear"
              style={{
                width: TRACK_WIDTH,
                height: TRACK_TOTAL_HEIGHT + 40,
                transform: `translateX(-${viewportOffset}px)`,
              }}
            >
              {/* Track surface — dirt texture */}
              <div
                className="absolute inset-0 rounded-radius-md overflow-hidden"
                style={{
                  background: `
                    repeating-linear-gradient(
                      90deg,
                      transparent,
                      transparent 99px,
                      rgba(255,255,255,0.02) 99px,
                      rgba(255,255,255,0.02) 100px
                    ),
                    repeating-linear-gradient(
                      0deg,
                      transparent,
                      transparent ${LANE_HEIGHT - 1}px,
                      rgba(255,255,255,0.04) ${LANE_HEIGHT - 1}px,
                      rgba(255,255,255,0.04) ${LANE_HEIGHT}px
                    ),
                    linear-gradient(180deg, #0D1117 0%, #111820 100%)
                  `,
                }}
              />

              {/* Starting gate */}
              <div
                className="absolute top-0 bottom-0"
                style={{
                  left: HORSE_START_X - 10,
                  width: 4,
                  background:
                    "repeating-linear-gradient(0deg, #3FB950, #3FB950 8px, transparent 8px, transparent 16px)",
                  opacity: 0.5,
                }}
              />

              {/* Finish line */}
              <div
                className="absolute top-0"
                style={{
                  left: FINISH_X,
                  width: 6,
                  height: TRACK_TOTAL_HEIGHT,
                }}
              >
                {/* Checkered pattern */}
                <div
                  className="w-full h-full"
                  style={{
                    background: `
                      repeating-linear-gradient(
                        0deg,
                        #E6EDF3 0px,
                        #E6EDF3 8px,
                        #0D1117 8px,
                        #0D1117 16px
                      )
                    `,
                    opacity: 0.6,
                  }}
                />
              </div>

              {/* Finish line second stripe (checkered offset) */}
              <div
                className="absolute top-0"
                style={{
                  left: FINISH_X + 6,
                  width: 6,
                  height: TRACK_TOTAL_HEIGHT,
                }}
              >
                <div
                  className="w-full h-full"
                  style={{
                    background: `
                      repeating-linear-gradient(
                        0deg,
                        #0D1117 0px,
                        #0D1117 8px,
                        #E6EDF3 8px,
                        #E6EDF3 16px
                      )
                    `,
                    opacity: 0.6,
                  }}
                />
              </div>

              {/* Distance markers */}
              {[0, 25, 50, 75, 100].map((pct) => {
                const x =
                  HORSE_START_X +
                  (pct / 100) * (FINISH_X - HORSE_START_X);
                return (
                  <div key={pct} className="absolute" style={{ left: x, top: TRACK_TOTAL_HEIGHT + 4 }}>
                    <div className="w-px h-3 bg-white/10 mx-auto" />
                    <span className="text-micro text-secondary/40 block text-center mt-0.5">
                      {pct}%
                    </span>
                  </div>
                );
              })}

              {/* ── Horses ── */}
              {horses.map((horse, laneIndex) => {
                const pos = racePosition(horse.speed, raceProgress);
                const xPos =
                  HORSE_START_X + pos * (FINISH_X - HORSE_START_X);
                const yPos = laneIndex * LANE_HEIGHT + LANE_HEIGHT / 2;
                const isThisUnicorn = isUnicorn(horse.day);
                const floatY = unicornFloat(horse.day);

                // Jitter in intro/loading (anticipation at gate)
                const jitterX =
                  phase === "playing" && raceProgress === 0
                    ? Math.sin(Date.now() * 0.01 + laneIndex) * 3
                    : 0;

                // Gallop bounce — faster horses bounce faster
                const bounceY =
                  phase === "playing" && raceProgress > 0 && raceProgress < 1
                    ? Math.sin(gallopPhase * (0.8 + horse.speed * 0.5)) *
                      (2 + horse.speed * 2)
                    : 0;

                return (
                  <div
                    key={horse.day}
                    className="absolute"
                    style={{
                      left: xPos - 24 + jitterX,
                      top: yPos - 20 + bounceY + floatY,
                      transition:
                        phase === "result"
                          ? "left 0.3s ease-out"
                          : undefined,
                      zIndex: isThisUnicorn ? 20 : 10,
                      filter: isThisUnicorn
                        ? "drop-shadow(0 0 12px #D4A843) drop-shadow(0 0 24px #F7931A)"
                        : undefined,
                    }}
                  >
                    {/* Day label */}
                    <span
                      className={cn(
                        "absolute -top-4 left-1/2 -translate-x-1/2 text-micro font-bold uppercase tracking-wider whitespace-nowrap",
                        isThisUnicorn && "text-gold animate-pulse"
                      )}
                      style={{
                        color: isThisUnicorn ? "#D4A843" : horse.color,
                        textShadow: isThisUnicorn
                          ? "0 0 10px #F7931A"
                          : undefined,
                      }}
                    >
                      {isThisUnicorn ? "UNICORN" : DAY_SHORT[horse.day]}
                    </span>

                    <HorseSVG
                      color={horse.color}
                      isUnicorn={isThisUnicorn}
                      gallop={
                        phase === "playing"
                          ? gallopPhase * (0.8 + horse.speed * 0.5)
                          : 0
                      }
                    />
                  </div>
                );
              })}

              {/* ── Winner particles ── */}
              {showParticles && (
                <ParticleBurst
                  x={FINISH_X}
                  y={
                    horses.findIndex((h) => h.day === winnerHorse.day) *
                      LANE_HEIGHT +
                    LANE_HEIGHT / 2
                  }
                  color={
                    gameData.blockFound ? "#D4A843" : winnerHorse.color
                  }
                  count={gameData.blockFound ? 40 : 25}
                  active
                />
              )}

              {/* Extra gold particles for block found */}
              {showParticles && gameData.blockFound && (
                <ParticleBurst
                  x={FINISH_X - 20}
                  y={
                    horses.findIndex((h) => h.day === winnerHorse.day) *
                      LANE_HEIGHT +
                    LANE_HEIGHT / 2
                  }
                  color="#F7931A"
                  count={30}
                  active
                />
              )}
            </div>
          </div>

          {/* ── Lane labels (fixed left side) ── */}
          <div
            className="absolute left-2 flex flex-col z-20"
            style={{
              top: "50%",
              transform: `translateY(-${TRACK_TOTAL_HEIGHT / 2}px)`,
            }}
          >
            {horses.map((horse) => (
              <div
                key={horse.day}
                className="flex items-center"
                style={{ height: LANE_HEIGHT }}
              >
                <div
                  className="w-2 h-2 rounded-full mr-1.5 flex-shrink-0"
                  style={{ backgroundColor: horse.color }}
                />
                <span
                  className="text-micro font-semibold uppercase tracking-wider hidden sm:inline"
                  style={{ color: horse.color, opacity: 0.7 }}
                >
                  {DAY_SHORT[horse.day]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Results board overlay ── */}
      <AnimatePresence>
        {phase === "result" && (
          <ResultsBoard horses={horses} blockFound={gameData.blockFound} />
        )}
      </AnimatePresence>

      {/* ── Inline keyframes ── */}
      <style>{`
        @keyframes gateJitter {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(2px); }
          50% { transform: translateX(-1px); }
          75% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}

/* ── Default Export with GameWrapper ── */
export default function HorseRace() {
  return (
    <GameWrapper gameName="Horse Race" gameSlug="horse-race">
      {({ phase, setPhase, gameData, reducedMotion, onReplay }) => (
        <HorseRaceGame
          phase={phase}
          setPhase={setPhase}
          gameData={gameData}
          reducedMotion={reducedMotion}
          onReplay={onReplay}
        />
      )}
    </GameWrapper>
  );
}
