import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { GameWrapper } from "@/components/games/GameWrapper";
import {
  normalizeToTowerHeight,
  playSound,
  type WeeklyGameData,
} from "@/hooks/useGameData";
import { formatDifficulty, formatNumber } from "@/mocks/data";
import { cn } from "@/lib/utils";
import { springs } from "@/lib/animation";

/* ── Types ── */
type GamePhase = "loading" | "intro" | "playing" | "result";

interface Milestone {
  label: string;
  value: number;
}

interface ConfettiPiece {
  id: number;
  x: number;
  delay: number;
  duration: number;
  rotation: number;
  color: string;
  size: number;
  drift: number;
}

interface FireworkParticle {
  id: number;
  angle: number;
  distance: number;
  delay: number;
  color: string;
  size: number;
}

/* ── Constants ── */
const MILESTONES: Milestone[] = [
  { label: "1K", value: 1e3 },
  { label: "1M", value: 1e6 },
  { label: "1B", value: 1e9 },
  { label: "1T", value: 1e12 },
  { label: "10T", value: 1e13 },
  { label: "100T", value: 1e14 },
  { label: "BLOCK!", value: 1e15 },
];

const CONFETTI_COLORS = [
  "#F7931A", "#D4A843", "#58A6FF", "#3FB950",
  "#A371F7", "#F85149", "#E6EDF3", "#FF6B35",
];

const FIREWORK_COLORS = [
  "#F7931A", "#D4A843", "#FFD700", "#FF8C00",
  "#FFA500", "#FF6347", "#FFB347", "#E6EDF3",
];

/* ── Helper: Map difficulty value to Y position (0-1) using log10 ── */
function valueToY(value: number, maxValue: number): number {
  if (value <= 0) return 0;
  if (value >= maxValue) return 1;
  const logVal = Math.log10(Math.max(value, 1));
  const logMax = Math.log10(maxValue);
  return Math.min(logVal / logMax, 1);
}

/* ── Sub-components ── */

function Stars() {
  const stars = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        cx: Math.random() * 100,
        cy: Math.random() * 40,
        r: Math.random() * 1.2 + 0.3,
        opacity: Math.random() * 0.5 + 0.2,
        twinkleDelay: Math.random() * 5,
      })),
    []
  );

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {stars.map((star) => (
        <circle
          key={star.id}
          cx={star.cx}
          cy={star.cy}
          r={star.r}
          fill="#E6EDF3"
          opacity={star.opacity}
        >
          <animate
            attributeName="opacity"
            values={`${star.opacity};${star.opacity * 0.3};${star.opacity}`}
            dur={`${3 + star.twinkleDelay}s`}
            repeatCount="indefinite"
            begin={`${star.twinkleDelay}s`}
          />
        </circle>
      ))}
    </svg>
  );
}

function StringLights() {
  const lights = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: 6 + i * 6.8,
        sag: Math.sin((i / 13) * Math.PI) * 3,
      })),
    []
  );

  return (
    <svg
      className="absolute top-0 left-0 w-full pointer-events-none"
      style={{ height: "60px" }}
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
    >
      {/* Wire */}
      <path
        d={`M 2 2 ${lights.map((l) => `Q ${l.x - 1} ${2 + l.sag + 1} ${l.x} ${2 + l.sag}`).join(" ")} Q 99 2 100 2`}
        fill="none"
        stroke="#8B949E"
        strokeWidth="0.15"
        opacity="0.4"
      />
      {/* Bulbs */}
      {lights.map((light) => (
        <g key={light.id}>
          <circle
            cx={light.x}
            cy={2 + light.sag + 0.6}
            r="0.6"
            fill="#F7931A"
            opacity="0.9"
          >
            <animate
              attributeName="opacity"
              values="0.9;0.5;0.9"
              dur={`${2 + (light.id % 3) * 0.5}s`}
              repeatCount="indefinite"
              begin={`${light.id * 0.15}s`}
            />
          </circle>
          {/* Glow */}
          <circle
            cx={light.x}
            cy={2 + light.sag + 0.6}
            r="1.8"
            fill="#F7931A"
            opacity="0.08"
          >
            <animate
              attributeName="opacity"
              values="0.08;0.03;0.08"
              dur={`${2 + (light.id % 3) * 0.5}s`}
              repeatCount="indefinite"
              begin={`${light.id * 0.15}s`}
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}

function Bell({ isRinging }: { isRinging: boolean }) {
  return (
    <motion.g
      animate={
        isRinging
          ? { rotate: [0, -8, 8, -6, 6, -3, 3, 0] }
          : {}
      }
      transition={{ duration: 0.6, ease: "easeOut" }}
      style={{ originX: "50%", originY: "0%" }}
    >
      {/* Bell body */}
      <path
        d="M -12 -4 Q -12 -18 0 -22 Q 12 -18 12 -4 L 14 0 L -14 0 Z"
        fill="url(#bellGradient)"
        stroke="#D4A843"
        strokeWidth="0.8"
      />
      {/* Bell clapper */}
      <circle cx="0" cy="2" r="2.5" fill="#D4A843" />
      {/* Bell top */}
      <circle cx="0" cy="-22" r="3" fill="#D4A843" />
      {/* Glow */}
      <circle cx="0" cy="-10" r="20" fill="url(#bellGlow)" opacity="0.3">
        <animate
          attributeName="opacity"
          values="0.3;0.15;0.3"
          dur="3s"
          repeatCount="indefinite"
        />
      </circle>
    </motion.g>
  );
}

function Mallet({ isSwinging }: { isSwinging: boolean }) {
  const controls = useAnimation();

  useEffect(() => {
    if (isSwinging) {
      controls.start({
        rotate: [0, -60, 10, 0],
        transition: { duration: 0.4, ease: [0.7, 0, 0.3, 1] },
      });
    }
  }, [isSwinging, controls]);

  return (
    <motion.g
      animate={controls}
      style={{ originX: "50%", originY: "100%" }}
    >
      {/* Handle */}
      <rect
        x="-2.5"
        y="-55"
        width="5"
        height="42"
        rx="2"
        fill="url(#handleGradient)"
      />
      {/* Head */}
      <rect
        x="-14"
        y="-68"
        width="28"
        height="16"
        rx="3"
        fill="url(#malletGradient)"
        stroke="#8B949E"
        strokeWidth="0.5"
      />
      {/* Metal bands */}
      <rect x="-14" y="-66" width="28" height="2" fill="#58A6FF" opacity="0.2" rx="1" />
      <rect x="-14" y="-56" width="28" height="2" fill="#58A6FF" opacity="0.2" rx="1" />
    </motion.g>
  );
}

function ParticleTrail({
  puckY,
  towerHeight,
  isAnimating,
}: {
  puckY: number;
  towerHeight: number;
  isAnimating: boolean;
}) {
  const [particles, setParticles] = useState<
    Array<{ id: number; y: number; opacity: number; x: number }>
  >([]);
  const frameRef = useRef(0);

  useEffect(() => {
    if (!isAnimating) {
      setParticles([]);
      return;
    }

    const interval = setInterval(() => {
      frameRef.current += 1;
      setParticles((prev) => {
        const next = prev
          .map((p) => ({ ...p, opacity: p.opacity - 0.08, y: p.y + 3 }))
          .filter((p) => p.opacity > 0);

        if (next.length < 10) {
          next.push({
            id: frameRef.current,
            y: puckY,
            opacity: 0.8,
            x: (Math.random() - 0.5) * 12,
          });
        }
        return next.slice(-10);
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isAnimating, puckY]);

  if (!isAnimating) return null;

  return (
    <>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `calc(50% + ${p.x}px)`,
            bottom: `${((towerHeight - p.y) / towerHeight) * 100}%`,
            width: `${4 + Math.random() * 4}px`,
            height: `${4 + Math.random() * 4}px`,
            backgroundColor: "#F7931A",
            opacity: p.opacity,
            boxShadow: `0 0 ${6 + Math.random() * 6}px #F7931A`,
            transform: "translate(-50%, 50%)",
            transition: "opacity 50ms linear",
          }}
        />
      ))}
    </>
  );
}

function Confetti({
  count,
  intensity,
}: {
  count: number;
  intensity: number;
}) {
  const pieces = useMemo<ConfettiPiece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2 + Math.random() * 2,
        rotation: Math.random() * 720 - 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 4 + Math.random() * 6,
        drift: (Math.random() - 0.5) * 60,
      })),
    [count]
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30">
      {pieces.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute"
          style={{
            left: `${piece.x}%`,
            top: "-10px",
            width: `${piece.size}px`,
            height: `${piece.size * 0.6}px`,
            backgroundColor: piece.color,
            borderRadius: "1px",
          }}
          initial={{ y: 0, x: 0, rotate: 0, opacity: 1 }}
          animate={{
            y: window.innerHeight + 50,
            x: piece.drift * intensity,
            rotate: piece.rotation,
            opacity: [1, 1, 0.8, 0],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: [0.25, 0.1, 0.25, 1],
          }}
        />
      ))}
    </div>
  );
}

function Fireworks({ particleCount }: { particleCount: number }) {
  const particles = useMemo<FireworkParticle[]>(
    () =>
      Array.from({ length: particleCount }, (_, i) => ({
        id: i,
        angle: (i / particleCount) * 360 + Math.random() * 15,
        distance: 80 + Math.random() * 180,
        delay: Math.random() * 0.3,
        color: FIREWORK_COLORS[i % FIREWORK_COLORS.length],
        size: 3 + Math.random() * 5,
      })),
    [particleCount]
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-30 flex items-center justify-center">
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const targetX = Math.cos(rad) * p.distance;
        const targetY = Math.sin(rad) * p.distance;

        return (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
            animate={{
              x: targetX,
              y: targetY,
              opacity: [0, 1, 1, 0],
              scale: [0, 1.2, 1, 0.3],
            }}
            transition={{
              duration: 1.2,
              delay: p.delay,
              ease: [0.25, 0.1, 0.25, 1],
            }}
          />
        );
      })}
    </div>
  );
}

function CountUpDisplay({
  target,
  duration,
  onComplete,
}: {
  target: number;
  duration: number;
  onComplete?: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    const startTime = performance.now();
    let rafId: number;

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / (duration * 1000), 1);
      // Ease out cubic for satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(Math.floor(eased * target));

      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setCurrent(target);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration, onComplete]);

  return (
    <span className="font-mono tabular-nums">{formatNumber(current)}</span>
  );
}

/* ── Main Component ── */
function HammerGameInner({
  phase,
  setPhase,
  gameData,
  reducedMotion,
}: {
  phase: GamePhase;
  setPhase: (phase: GamePhase) => void;
  gameData: WeeklyGameData;
  reducedMotion: boolean;
  onReplay: () => void;
}) {
  /* ── State ── */
  const [isSwinging, setIsSwinging] = useState(false);
  const [isAnimatingPuck, setIsAnimatingPuck] = useState(false);
  const [puckPositionY, setPuckPositionY] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const [showBlockFlash, setShowBlockFlash] = useState(false);
  const [showBlockText, setShowBlockText] = useState(false);
  const [showBtcReward, setShowBtcReward] = useState(false);
  const [passedMilestones, setPassedMilestones] = useState<Set<number>>(
    new Set()
  );
  const [countUpDone, setCountUpDone] = useState(false);
  const [shakeScreen, setShakeScreen] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const towerRef = useRef<HTMLDivElement>(null);

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const maxConfetti = isMobile ? 60 : 120;

  /* ── Derived values ── */
  const normalizedHeight = normalizeToTowerHeight(
    gameData.bestDifficulty,
    gameData.networkDifficulty
  );
  const blockFound = gameData.blockFound;
  const targetHeight = blockFound ? 1 : normalizedHeight;

  const towerViewportPercent = 70;

  /* ── Phase: loading -> intro ── */
  useEffect(() => {
    if (phase !== "loading") return;
    const timer = setTimeout(() => setPhase("intro"), 2000);
    return () => clearTimeout(timer);
  }, [phase, setPhase]);

  /* ── Milestone animation tracker ── */
  const checkMilestonesPassed = useCallback(
    (currentY: number) => {
      const towerEl = towerRef.current;
      if (!towerEl) return;
      const towerH = towerEl.clientHeight;

      MILESTONES.forEach((m, i) => {
        const milestoneY = valueToY(m.value, MILESTONES[MILESTONES.length - 1].value) * towerH;
        if (currentY >= milestoneY) {
          setPassedMilestones((prev) => {
            if (prev.has(i)) return prev;
            const next = new Set(prev);
            next.add(i);
            return next;
          });
        }
      });
    },
    []
  );

  /* ── Handle swing ── */
  const handleSwing = useCallback((forcePlay = false) => {
    if (isSwinging) return;
    if (!forcePlay && phase !== "playing") return;

    playSound("hammer-whack");
    setIsSwinging(true);
    setShakeScreen(true);

    // Screen shake duration
    const shakeTimer = setTimeout(() => setShakeScreen(false), 150);

    // Start puck animation after mallet swing
    const puckTimer = setTimeout(() => {
      setIsAnimatingPuck(true);

      // Puck rise duration scales with height
      const riseDuration = 1500 + targetHeight * 2000;

      // Animate puck position
      const startTime = performance.now();

      function animatePuck(now: number) {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / riseDuration, 1);
        // Ease out: fast start, slow end
        const eased = 1 - Math.pow(1 - progress, 2.5);
        const currentPos = eased * targetHeight;
        setPuckPositionY(currentPos);
        checkMilestonesPassed(
          currentPos *
            (towerRef.current?.clientHeight ?? window.innerHeight * 0.7)
        );

        if (progress < 1) {
          requestAnimationFrame(animatePuck);
        } else {
          setIsAnimatingPuck(false);
          finishAnimation();
        }
      }

      requestAnimationFrame(animatePuck);
    }, 350);

    function finishAnimation() {
      playSound("crowd-cheer");

      if (blockFound) {
        // Block found sequence
        setShowBlockFlash(true);
        setTimeout(() => setShowBlockFlash(false), 200);
        setTimeout(() => {
          setShowFireworks(true);
          setShowBlockText(true);
        }, 250);
        setTimeout(() => setShowBtcReward(true), 800);
        setTimeout(() => {
          setShowResult(true);
          setPhase("result");
        }, 2500);
      } else {
        // Normal result
        setShowResult(true);
        const confettiCount = Math.floor(
          30 + normalizedHeight * (maxConfetti - 30)
        );
        if (confettiCount > 10) {
          setShowConfetti(true);
        }
        setTimeout(() => setPhase("result"), 1200);
      }
    }

    return () => {
      clearTimeout(shakeTimer);
      clearTimeout(puckTimer);
    };
  }, [
    isSwinging,
    phase,
    targetHeight,
    blockFound,
    normalizedHeight,
    maxConfetti,
    setPhase,
    checkMilestonesPassed,
  ]);

  /* ── Tower SVG height ── */
  const TOWER_SVG_WIDTH = 60;
  const TOWER_SVG_HEIGHT = 400;

  /* ── Milestone Y positions ── */
  const milestonePositions = useMemo(
    () =>
      MILESTONES.map((m) => ({
        ...m,
        yPercent: valueToY(m.value, MILESTONES[MILESTONES.length - 1].value) * 100,
      })),
    []
  );

  /* ── Confetti piece count ── */
  const confettiCount = useMemo(
    () => Math.floor(30 + normalizedHeight * (maxConfetti - 30)),
    [normalizedHeight, maxConfetti]
  );

  /* ── Fireworks particle count ── */
  const fireworkCount = isMobile ? 60 : 120;

  return (
    <motion.div
      ref={wrapperRef}
      className="relative w-full h-full overflow-hidden"
      animate={
        shakeScreen
          ? { x: [0, -6, 6, -4, 4, -2, 2, 0] }
          : { x: 0 }
      }
      transition={
        shakeScreen
          ? { duration: 0.15, ease: "linear" }
          : { duration: 0 }
      }
    >
      {/* ── Background gradient ── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #020510 0%, #060A14 30%, #06080C 100%)",
        }}
      />

      {/* ── Stars ── */}
      <Stars />

      {/* ── String lights ── */}
      <StringLights />

      {/* ── Carnival ambient glow ── */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(247,147,26,0.04) 0%, transparent 70%)",
        }}
      />

      {/* ── Main tower area ── */}
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-end"
        initial={reducedMotion ? {} : { y: 100, opacity: 0 }}
        animate={
          phase !== "loading"
            ? { y: 0, opacity: 1 }
            : { y: 100, opacity: 0 }
        }
        transition={{ duration: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* Tower container */}
        <div
          ref={towerRef}
          className="relative flex items-end justify-center"
          style={{
            height: `${towerViewportPercent}vh`,
            width: "120px",
            marginBottom: "12vh",
          }}
        >
          {/* Tower SVG */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${TOWER_SVG_WIDTH} ${TOWER_SVG_HEIGHT}`}
            preserveAspectRatio="none"
          >
            <defs>
              {/* Tower gradient */}
              <linearGradient
                id="towerGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#1C2333" />
                <stop offset="30%" stopColor="#2A3344" />
                <stop offset="50%" stopColor="#30394A" />
                <stop offset="70%" stopColor="#2A3344" />
                <stop offset="100%" stopColor="#1C2333" />
              </linearGradient>

              {/* Tower edge highlight */}
              <linearGradient
                id="towerEdge"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#58A6FF" stopOpacity="0.15" />
                <stop offset="50%" stopColor="#58A6FF" stopOpacity="0.0" />
                <stop offset="100%" stopColor="#58A6FF" stopOpacity="0.15" />
              </linearGradient>

              {/* Bell gradient */}
              <linearGradient
                id="bellGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#D4A843" />
                <stop offset="50%" stopColor="#B8922E" />
                <stop offset="100%" stopColor="#8B6914" />
              </linearGradient>

              {/* Bell glow */}
              <radialGradient id="bellGlow" cx="0.5" cy="0.5" r="0.5">
                <stop offset="0%" stopColor="#D4A843" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#D4A843" stopOpacity="0" />
              </radialGradient>

              {/* Mallet handle gradient */}
              <linearGradient
                id="handleGradient"
                x1="0"
                y1="0"
                x2="1"
                y2="0"
              >
                <stop offset="0%" stopColor="#5C3A1E" />
                <stop offset="50%" stopColor="#7A4E2A" />
                <stop offset="100%" stopColor="#5C3A1E" />
              </linearGradient>

              {/* Mallet head gradient */}
              <linearGradient
                id="malletGradient"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#4A5568" />
                <stop offset="40%" stopColor="#5A6A7E" />
                <stop offset="100%" stopColor="#3A4558" />
              </linearGradient>

              {/* Puck glow filter */}
              <filter id="puckGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Tower body */}
            <rect
              x="8"
              y="5"
              width={TOWER_SVG_WIDTH - 16}
              height={TOWER_SVG_HEIGHT - 10}
              rx="4"
              fill="url(#towerGradient)"
              stroke="url(#towerEdge)"
              strokeWidth="0.8"
            />

            {/* Inner track */}
            <rect
              x="18"
              y="10"
              width={TOWER_SVG_WIDTH - 36}
              height={TOWER_SVG_HEIGHT - 18}
              rx="3"
              fill="#0D1117"
              stroke="#30363D"
              strokeWidth="0.4"
            />

            {/* Milestone markers */}
            {milestonePositions.map((m, i) => {
              const svgY =
                TOWER_SVG_HEIGHT - 8 - (m.yPercent / 100) * (TOWER_SVG_HEIGHT - 20);
              return (
                <g key={m.label}>
                  <line
                    x1="10"
                    y1={svgY}
                    x2={TOWER_SVG_WIDTH - 10}
                    y2={svgY}
                    stroke={passedMilestones.has(i) ? "#F7931A" : "#30363D"}
                    strokeWidth="0.5"
                    strokeDasharray={passedMilestones.has(i) ? "none" : "2,2"}
                    opacity={passedMilestones.has(i) ? 0.8 : 0.4}
                  />
                </g>
              );
            })}

            {/* Bell at top */}
            <g transform={`translate(${TOWER_SVG_WIDTH / 2}, 14)`}>
              <Bell
                isRinging={blockFound && showBlockText}
              />
            </g>
          </svg>

          {/* Milestone labels (HTML overlays for crisp text) */}
          {milestonePositions.map((m, i) => (
            <motion.div
              key={m.label}
              className={cn(
                "absolute text-micro font-mono pointer-events-none whitespace-nowrap",
                "transition-all duration-300",
                passedMilestones.has(i)
                  ? "text-bitcoin"
                  : "text-secondary"
              )}
              style={{
                bottom: `${m.yPercent}%`,
                right: "calc(100% + 10px)",
                transform: "translateY(50%)",
              }}
              animate={
                passedMilestones.has(i)
                  ? {
                      scale: [1, 1.4, 1.1],
                      textShadow: [
                        "0 0 0px transparent",
                        "0 0 12px #F7931A",
                        "0 0 4px #F7931A",
                      ],
                    }
                  : {}
              }
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              {m.label}
            </motion.div>
          ))}

          {/* ── Puck ── */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 z-10"
            style={{
              bottom: `${puckPositionY * 100}%`,
              width: "20px",
              height: "20px",
            }}
          >
            <div
              className="w-full h-full rounded-full"
              style={{
                background:
                  "radial-gradient(circle at 40% 35%, #FFB347 0%, #F7931A 50%, #CC7000 100%)",
                boxShadow: `0 0 16px 4px rgba(247,147,26,0.6), 0 0 32px 8px rgba(247,147,26,0.3)`,
              }}
            />
            {/* Puck inner shine */}
            <div
              className="absolute top-[3px] left-[4px] w-[8px] h-[6px] rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, transparent 100%)",
              }}
            />
          </motion.div>

          {/* ── Particle trail ── */}
          <ParticleTrail
            puckY={
              puckPositionY *
              (towerRef.current?.clientHeight ?? window.innerHeight * 0.7)
            }
            towerHeight={
              towerRef.current?.clientHeight ?? window.innerHeight * 0.7
            }
            isAnimating={isAnimatingPuck}
          />
        </div>

        {/* ── Platform / Mallet area ── */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center">
          {/* Platform */}
          <svg
            width="200"
            height="40"
            viewBox="0 0 200 40"
            className="mb-0"
          >
            {/* Platform base */}
            <ellipse
              cx="100"
              cy="30"
              rx="80"
              ry="10"
              fill="#161B22"
              stroke="#30363D"
              strokeWidth="0.5"
            />
            <ellipse
              cx="100"
              cy="26"
              rx="80"
              ry="10"
              fill="#1C2333"
              stroke="#30363D"
              strokeWidth="0.5"
            />

            {/* Mallet group */}
            <g transform="translate(100, 28)">
              <Mallet isSwinging={isSwinging} />
            </g>
          </svg>
        </div>
      </motion.div>

      {/* ── Intro text ── */}
      <AnimatePresence>
        {phase === "intro" && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.p
              className="text-headline sm:text-title font-semibold text-primary text-center px-6 mb-8 pointer-events-none"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              Let&apos;s see how close you got this week!
            </motion.p>

            {/* Swing button */}
            <motion.button
              className="pointer-events-auto relative px-8 py-4 rounded-radius-lg bg-bitcoin text-white font-bold text-headline tracking-wide uppercase overflow-hidden"
              style={{
                boxShadow:
                  "0 0 30px rgba(247,147,26,0.4), 0 0 60px rgba(247,147,26,0.15)",
              }}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ delay: 0.6, ...springs.bouncy }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setPhase("playing");
                // Small delay then auto-swing (forcePlay=true to bypass stale phase check)
                setTimeout(() => handleSwing(true), 100);
              }}
            >
              {/* Animated glow ring */}
              <motion.div
                className="absolute inset-0 rounded-radius-lg"
                style={{
                  border: "2px solid rgba(247,147,26,0.6)",
                }}
                animate={{
                  boxShadow: [
                    "0 0 0px rgba(247,147,26,0.4)",
                    "0 0 20px rgba(247,147,26,0.6)",
                    "0 0 0px rgba(247,147,26,0.4)",
                  ],
                  scale: [1, 1.04, 1],
                }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              SWING THE HAMMER
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading phase animation ── */}
      <AnimatePresence>
        {phase === "loading" && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center z-20"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="flex flex-col items-center gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {/* Animated hammer icon */}
              <motion.div
                animate={{ rotate: [0, -15, 0] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="text-bitcoin"
              >
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 48 48"
                  fill="none"
                >
                  <rect
                    x="20"
                    y="22"
                    width="8"
                    height="22"
                    rx="2"
                    fill="#7A4E2A"
                  />
                  <rect
                    x="10"
                    y="10"
                    width="28"
                    height="14"
                    rx="3"
                    fill="#F7931A"
                  />
                </svg>
              </motion.div>
              <p className="text-caption text-secondary animate-pulse">
                Preparing the tower...
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result display (over the tower) ── */}
      <AnimatePresence>
        {showResult && !blockFound && (
          <motion.div
            className="absolute top-[12%] left-0 right-0 flex flex-col items-center z-20 pointer-events-none"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            {/* Difficulty display */}
            <div className="bg-surface/90 backdrop-blur-md border border-white/10 rounded-radius-lg px-6 py-5 sm:px-8 sm:py-6 text-center">
              <p className="text-caption text-secondary mb-2 uppercase tracking-wider">
                Your Best Difficulty
              </p>
              <p className="text-display-md sm:text-display-lg font-bold text-primary">
                {countUpDone ? (
                  formatNumber(gameData.bestDifficulty)
                ) : (
                  <CountUpDisplay
                    target={gameData.bestDifficulty}
                    duration={1.2}
                    onComplete={() => setCountUpDone(true)}
                  />
                )}
              </p>
              <motion.p
                className="text-body text-secondary mt-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                {formatDifficulty(gameData.bestDifficulty)} — That&apos;s higher than{" "}
                <span className="text-bitcoin font-semibold">
                  {gameData.percentile}%
                </span>{" "}
                of miners!
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Block found flash ── */}
      <AnimatePresence>
        {showBlockFlash && (
          <motion.div
            className="absolute inset-0 z-40 bg-white pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "linear" }}
          />
        )}
      </AnimatePresence>

      {/* ── Block found text + reward ── */}
      <AnimatePresence>
        {showBlockText && (
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.h1
              className="text-display-lg sm:text-hero font-bold text-gold uppercase tracking-wider text-center"
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...springs.bouncy, delay: 0.1 }}
              style={{
                textShadow:
                  "0 0 40px rgba(212,168,67,0.6), 0 0 80px rgba(212,168,67,0.3)",
              }}
            >
              YOU FOUND A BLOCK!
            </motion.h1>

            <AnimatePresence>
              {showBtcReward && (
                <motion.div
                  className="mt-6"
                  initial={{ y: -100, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 15,
                    mass: 1.2,
                  }}
                >
                  <p
                    className="text-display-lg sm:text-hero font-bold font-mono text-bitcoin tabular-nums text-center"
                    style={{
                      textShadow:
                        "0 0 30px rgba(247,147,26,0.5), 0 0 60px rgba(247,147,26,0.2)",
                    }}
                  >
                    {gameData.blockData?.reward ?? 3.125} BTC
                  </p>
                  <motion.p
                    className="text-body text-secondary text-center mt-2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    Block #{formatNumber(gameData.blockData?.height ?? 0)}
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confetti ── */}
      <AnimatePresence>
        {showConfetti && !blockFound && (
          <Confetti count={confettiCount} intensity={normalizedHeight} />
        )}
      </AnimatePresence>

      {/* ── Fireworks (block found) ── */}
      <AnimatePresence>
        {showFireworks && blockFound && (
          <Fireworks particleCount={fireworkCount} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Default Export ── */
export default function HammerGame() {
  return (
    <GameWrapper gameName="Hammer Game" gameSlug="hammer">
      {({ phase, setPhase, gameData, reducedMotion, onReplay }) => (
        <HammerGameInner
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
