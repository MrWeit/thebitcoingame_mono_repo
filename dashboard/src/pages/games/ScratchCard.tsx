import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Diamond, Trophy, Hash, CurrencyBtc } from "@phosphor-icons/react";
import { GameWrapper } from "@/components/games/GameWrapper";
import { type WeeklyGameData } from "@/hooks/useGameData";
import { playSound } from "@/hooks/useGameData";
import { formatDifficulty } from "@/mocks/data";
import { cn } from "@/lib/utils";
import { springs, durations } from "@/lib/animation";

/* ── Types ── */

interface ZoneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  color: string;
  createdAt: number;
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  color: string;
  angle: number;
  distance: number;
}

type ZoneKey = "hash" | "difficulty" | "rank" | "prize";

/* ── Constants ── */

const ZONE_LABELS: Record<ZoneKey, string> = {
  hash: "YOUR BEST HASH",
  difficulty: "YOUR DIFFICULTY",
  rank: "YOUR RANK",
  prize: "PRIZE",
};

const ZONE_ORDER: ZoneKey[] = ["hash", "difficulty", "rank", "prize"];

const SCRATCH_RADIUS_DESKTOP = 22;
const SCRATCH_RADIUS_MOBILE = 30;
const REVEAL_THRESHOLD = 0.8;
const PIXEL_SAMPLE_STEP = 4;
const CALC_THROTTLE_MS = 200;
const PARTICLE_THROTTLE_MS = 50;
const MAX_PARTICLES_MOBILE = 100;
const MAX_PARTICLES_DESKTOP = 200;
const PARTICLE_LIFETIME_MS = 600;

const METALLIC_COLORS = [
  "#A8A8A8",
  "#B8B8B8",
  "#C0C0C0",
  "#D0D0D0",
  "#989898",
  "#888888",
];

const SPARKLE_COLORS = [
  "#FFD700",
  "#FFFFFF",
  "#FFC107",
  "#F7931A",
  "#D4A843",
  "#FFFACD",
];

/* ── Helpers ── */

function isMobile(): boolean {
  return window.innerWidth < 768;
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

let particleIdCounter = 0;
function nextParticleId(): number {
  return ++particleIdCounter;
}

/* ── Zone layout: 2x2 grid with padding/gaps ── */

function computeZones(canvasW: number, canvasH: number): Record<ZoneKey, ZoneRect> {
  const padX = canvasW * 0.06;
  const padTop = canvasH * 0.22;
  const padBottom = canvasH * 0.06;
  const gap = canvasW * 0.04;

  const areaW = canvasW - padX * 2 - gap;
  const areaH = canvasH - padTop - padBottom - gap;
  const zoneW = areaW / 2;
  const zoneH = areaH / 2;

  return {
    hash: { x: padX, y: padTop, w: zoneW, h: zoneH },
    difficulty: { x: padX + zoneW + gap, y: padTop, w: zoneW, h: zoneH },
    rank: { x: padX, y: padTop + zoneH + gap, w: zoneW, h: zoneH },
    prize: { x: padX + zoneW + gap, y: padTop + zoneH + gap, w: zoneW, h: zoneH },
  };
}

/* ── Draw the metallic scratch coating ── */

function drawMetallicOverlay(
  ctx: CanvasRenderingContext2D,
  zone: ZoneRect,
  _canvasW: number,
) {
  ctx.save();

  // Metallic gradient
  const grad = ctx.createLinearGradient(zone.x, zone.y, zone.x + zone.w, zone.y + zone.h);
  grad.addColorStop(0, "#9E9E9E");
  grad.addColorStop(0.3, "#BDBDBD");
  grad.addColorStop(0.5, "#CCCCCC");
  grad.addColorStop(0.7, "#B0B0B0");
  grad.addColorStop(1, "#9E9E9E");

  const r = Math.min(zone.w, zone.h) * 0.06;
  ctx.beginPath();
  ctx.roundRect(zone.x, zone.y, zone.w, zone.h, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // Subtle noise texture
  for (let i = 0; i < 800; i++) {
    const px = zone.x + Math.random() * zone.w;
    const py = zone.y + Math.random() * zone.h;
    const brightness = Math.random() * 40 + 140;
    ctx.fillStyle = `rgba(${brightness}, ${brightness}, ${brightness}, 0.15)`;
    ctx.fillRect(px, py, 1, 1);
  }

  // Horizontal shine line across each zone
  const shineGrad = ctx.createLinearGradient(zone.x, zone.y + zone.h * 0.3, zone.x + zone.w, zone.y + zone.h * 0.3);
  shineGrad.addColorStop(0, "rgba(255,255,255,0)");
  shineGrad.addColorStop(0.3, "rgba(255,255,255,0.12)");
  shineGrad.addColorStop(0.5, "rgba(255,255,255,0.2)");
  shineGrad.addColorStop(0.7, "rgba(255,255,255,0.12)");
  shineGrad.addColorStop(1, "rgba(255,255,255,0)");

  ctx.beginPath();
  ctx.roundRect(zone.x, zone.y, zone.w, zone.h, r);
  ctx.fillStyle = shineGrad;
  ctx.fill();

  ctx.restore();
}

function drawAllZones(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
  const zones = computeZones(canvasW, canvasH);
  for (const key of ZONE_ORDER) {
    drawMetallicOverlay(ctx, zones[key], canvasW);
  }
}

/* ── Calculate scratch percentage for a zone ── */

function getZoneScratchPercent(
  ctx: CanvasRenderingContext2D,
  zone: ZoneRect,
): number {
  const imgData = ctx.getImageData(zone.x, zone.y, zone.w, zone.h);
  const pixels = imgData.data;
  let total = 0;
  let transparent = 0;

  for (let i = 3; i < pixels.length; i += PIXEL_SAMPLE_STEP * 4) {
    total++;
    if (pixels[i] === 0) transparent++;
  }

  return total > 0 ? transparent / total : 0;
}

/* ── Badge text helper ── */

function getPrizeText(gameData: WeeklyGameData): { line1: string; line2: string } {
  if (gameData.blockFound) {
    return { line1: "3.125 BTC!", line2: "BLOCK FOUND" };
  }
  const pct = 100 - gameData.percentile;
  let tier = "Silver Miner";
  if (pct <= 1) tier = "Legendary Miner";
  else if (pct <= 5) tier = "Diamond Miner";
  else if (pct <= 10) tier = "Gold Miner";
  else if (pct <= 25) tier = "Bronze Miner";

  return {
    line1: `Top ${pct}%`,
    line2: tier,
  };
}

/* ══════════════════════════════════════════════════════════
   ScratchCard Component
   ══════════════════════════════════════════════════════════ */

export default function ScratchCard() {
  return (
    <GameWrapper gameName="Scratch Card" gameSlug="scratch-card">
      {(props) => <ScratchCardInner {...props} />}
    </GameWrapper>
  );
}

/* ── Inner Game Component ── */

interface InnerProps {
  phase: "loading" | "intro" | "playing" | "result";
  setPhase: (phase: "loading" | "intro" | "playing" | "result") => void;
  gameData: WeeklyGameData;
  reducedMotion: boolean;
  onReplay: () => void;
}

function ScratchCardInner({ phase, setPhase, gameData, reducedMotion }: InnerProps) {
  /* ── Refs ── */
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isPointerDown = useRef(false);
  const lastScratchCalc = useRef(0);
  const lastParticleSpawn = useRef(0);
  const lastScratchSound = useRef(0);
  const animFrameRef = useRef<number>(0);

  /* ── State ── */
  const [cardVisible, setCardVisible] = useState(false);
  const [scratchPercentages, setScratchPercentages] = useState<Record<ZoneKey, number>>({
    hash: 0,
    difficulty: 0,
    rank: 0,
    prize: 0,
  });
  const [revealedZones, setRevealedZones] = useState<Record<ZoneKey, boolean>>({
    hash: false,
    difficulty: false,
    rank: false,
    prize: false,
  });
  const [particles, setParticles] = useState<Particle[]>([]);
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [shineActive, setShineActive] = useState(false);
  const [blockFlash, setBlockFlash] = useState(false);
  const [blockShake, setBlockShake] = useState(false);

  const allRevealed = useMemo(
    () => ZONE_ORDER.every((k) => revealedZones[k]),
    [revealedZones],
  );

  const maxParticles = isMobile() ? MAX_PARTICLES_MOBILE : MAX_PARTICLES_DESKTOP;
  const scratchRadius = isMobile() ? SCRATCH_RADIUS_MOBILE : SCRATCH_RADIUS_DESKTOP;

  /* ── Card dimensions ── */
  const cardWidth = isMobile() ? 340 : 480;
  const cardHeight = Math.round(cardWidth * 1.35);

  /* ── Canvas DPR scaling ── */
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  /* ── Zone rects for content layout ── */
  const zones = useMemo(() => computeZones(cardWidth, cardHeight), [cardWidth, cardHeight]);

  /* ── Prize text ── */
  const prizeText = useMemo(() => getPrizeText(gameData), [gameData]);

  /* ── Init: loading -> intro ── */
  useEffect(() => {
    if (phase === "loading" && !reducedMotion) {
      const t = setTimeout(() => {
        setCardVisible(true);
        setPhase("intro");
        // Trigger shine after card slides in
        setTimeout(() => setShineActive(true), 800);
        setTimeout(() => setShineActive(false), 2200);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [phase, setPhase, reducedMotion]);

  /* ── Init canvas ── */
  useEffect(() => {
    if (phase !== "intro" && phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = cardWidth * dpr;
    canvas.height = cardHeight * dpr;
    canvas.style.width = `${cardWidth}px`;
    canvas.style.height = `${cardHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    drawAllZones(ctx, cardWidth, cardHeight);
  }, [phase, cardWidth, cardHeight, dpr]);

  /* ── Cleanup particles ── */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setParticles((prev) => prev.filter((p) => now - p.createdAt < PARTICLE_LIFETIME_MS));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  /* ── Cleanup sparkles ── */
  useEffect(() => {
    if (sparkles.length === 0) return;
    const t = setTimeout(() => setSparkles([]), 800);
    return () => clearTimeout(t);
  }, [sparkles.length]);

  /* ── Transition to result when all revealed ── */
  useEffect(() => {
    if (allRevealed && phase === "playing") {
      const t = setTimeout(() => {
        setIsFlipped(true);
        setTimeout(() => setPhase("result"), 800);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [allRevealed, phase, setPhase]);

  /* ── Spawn sparkle effect for a zone ── */
  const spawnSparkles = useCallback((zone: ZoneRect) => {
    const cx = zone.x + zone.w / 2;
    const cy = zone.y + zone.h / 2;
    const count = 10;
    const newSparkles: Sparkle[] = [];

    for (let i = 0; i < count; i++) {
      newSparkles.push({
        id: nextParticleId(),
        x: cx,
        y: cy,
        scale: randomBetween(0.5, 1.5),
        opacity: 1,
        color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
        angle: (i / count) * Math.PI * 2 + randomBetween(-0.3, 0.3),
        distance: randomBetween(20, 60),
      });
    }

    setSparkles((prev) => [...prev, ...newSparkles]);
    playSound("sparkle-reveal");
  }, []);

  /* ── Clear a zone on the canvas ── */
  const clearZone = useCallback(
    (key: ZoneKey) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const z = zones[key];
      ctx.clearRect(z.x - 1, z.y - 1, z.w + 2, z.h + 2);
      ctx.restore();
    },
    [zones, dpr],
  );

  /* ── Block found cascade ── */
  const triggerBlockFoundCascade = useCallback(() => {
    setBlockShake(true);
    setBlockFlash(true);
    setTimeout(() => setBlockFlash(false), 200);
    setTimeout(() => setBlockShake(false), 600);

    // Burst golden particles
    const burstCount = 40;
    const cx = cardWidth / 2;
    const cy = cardHeight / 2;
    const burst: Particle[] = [];
    for (let i = 0; i < burstCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = randomBetween(2, 8);
      burst.push({
        id: nextParticleId(),
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: randomBetween(3, 7),
        rotation: Math.random() * 360,
        color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
        createdAt: Date.now(),
      });
    }
    setParticles((prev) => [...prev.slice(-maxParticles + burstCount), ...burst]);

    // Auto-reveal remaining zones with staggered sparkles
    let delay = 0;
    for (const key of ZONE_ORDER) {
      if (!revealedZones[key]) {
        setTimeout(() => {
          clearZone(key);
          spawnSparkles(zones[key]);
          setRevealedZones((prev) => ({ ...prev, [key]: true }));
          setScratchPercentages((prev) => ({ ...prev, [key]: 1 }));
        }, delay);
        delay += 150;
      }
    }
  }, [cardWidth, cardHeight, maxParticles, revealedZones, clearZone, spawnSparkles, zones]);

  /* ── Reveal a zone ── */
  const revealZone = useCallback(
    (key: ZoneKey) => {
      if (revealedZones[key]) return;

      clearZone(key);
      spawnSparkles(zones[key]);
      setRevealedZones((prev) => ({ ...prev, [key]: true }));

      // If prize zone reveals block found, trigger cascade
      if (key === "prize" && gameData.blockFound) {
        setTimeout(() => triggerBlockFoundCascade(), 100);
      }
    },
    [revealedZones, clearZone, spawnSparkles, zones, gameData.blockFound, triggerBlockFoundCascade],
  );

  /* ── Check & update scratch percentages ── */
  const updateScratchPercentages = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Operate on the scaled canvas
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const newPercentages = { ...scratchPercentages };
    let changed = false;

    for (const key of ZONE_ORDER) {
      if (revealedZones[key]) continue;

      const z = zones[key];
      // Sample in device-pixel space
      const scaledZone: ZoneRect = {
        x: Math.floor(z.x * dpr),
        y: Math.floor(z.y * dpr),
        w: Math.floor(z.w * dpr),
        h: Math.floor(z.h * dpr),
      };

      const pct = getZoneScratchPercent(ctx, scaledZone);
      if (Math.abs(pct - newPercentages[key]) > 0.01) {
        newPercentages[key] = pct;
        changed = true;
      }

      if (pct >= REVEAL_THRESHOLD && !revealedZones[key]) {
        // Schedule auto-reveal
        requestAnimationFrame(() => revealZone(key));
      }
    }

    ctx.restore();

    if (changed) {
      setScratchPercentages(newPercentages);
    }
  }, [scratchPercentages, revealedZones, zones, dpr, revealZone]);

  /* ── Scratch at a point ── */
  const scratchAt = useCallback(
    (canvasX: number, canvasY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Transition to "playing" on first scratch
      if (phase === "intro") {
        setPhase("playing");
      }

      // Erase in CSS-pixel space (we applied dpr scale)
      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(canvasX, canvasY, scratchRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Sound (throttled)
      const now = Date.now();
      if (now - lastScratchSound.current > 120) {
        playSound("scratch");
        lastScratchSound.current = now;
      }

      // Spawn particles (throttled)
      if (now - lastParticleSpawn.current > PARTICLE_THROTTLE_MS) {
        lastParticleSpawn.current = now;
        const count = isMobile() ? 2 : 3;
        const newParticles: Particle[] = [];
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = randomBetween(1.5, 5);
          newParticles.push({
            id: nextParticleId(),
            x: canvasX,
            y: canvasY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 1,
            size: randomBetween(2, 5),
            rotation: Math.random() * 360,
            color: METALLIC_COLORS[Math.floor(Math.random() * METALLIC_COLORS.length)],
            createdAt: now,
          });
        }
        setParticles((prev) => {
          const combined = [...prev, ...newParticles];
          return combined.length > maxParticles
            ? combined.slice(combined.length - maxParticles)
            : combined;
        });
      }

      // Recalculate scratch percentage (throttled)
      if (now - lastScratchCalc.current > CALC_THROTTLE_MS) {
        lastScratchCalc.current = now;
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(updateScratchPercentages);
      }
    },
    [phase, setPhase, scratchRadius, dpr, maxParticles, updateScratchPercentages],
  );

  /* ── Pointer event helpers ── */
  const getCanvasCoords = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    [],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (phase !== "intro" && phase !== "playing") return;
      e.preventDefault();
      isPointerDown.current = true;
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
      const coords = getCanvasCoords(e);
      if (coords) scratchAt(coords.x, coords.y);
    },
    [phase, getCanvasCoords, scratchAt],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!isPointerDown.current) return;
      if (phase !== "intro" && phase !== "playing") return;
      e.preventDefault();
      const coords = getCanvasCoords(e);
      if (coords) scratchAt(coords.x, coords.y);
    },
    [phase, getCanvasCoords, scratchAt],
  );

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      isPointerDown.current = false;
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
      // Final percentage check
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(updateScratchPercentages);
    },
    [updateScratchPercentages],
  );

  /* ── Zone content renderer ── */
  const renderZoneContent = useCallback(
    (key: ZoneKey) => {
      const revealed = revealedZones[key];

      switch (key) {
        case "hash":
          return (
            <div className="flex flex-col items-center justify-center h-full gap-1 px-2">
              <p
                className={cn(
                  "font-mono text-[10px] sm:text-xs leading-tight text-center break-all transition-opacity duration-300",
                  revealed ? "opacity-100" : "opacity-40",
                  gameData.blockFound ? "text-bitcoin" : "text-[#1a1a2e]",
                )}
              >
                {gameData.bestHash.slice(0, 16)}
              </p>
            </div>
          );
        case "difficulty":
          return (
            <div className="flex flex-col items-center justify-center h-full gap-1">
              <p
                className={cn(
                  "font-mono text-lg sm:text-2xl font-bold tabular-nums transition-opacity duration-300",
                  revealed ? "opacity-100" : "opacity-40",
                  gameData.blockFound ? "text-bitcoin" : "text-[#1a1a2e]",
                )}
              >
                {formatDifficulty(gameData.bestDifficulty)}
              </p>
            </div>
          );
        case "rank":
          return (
            <div className="flex flex-col items-center justify-center h-full gap-0.5">
              <p
                className={cn(
                  "font-mono text-2xl sm:text-3xl font-bold tabular-nums transition-opacity duration-300",
                  revealed ? "opacity-100" : "opacity-40",
                  gameData.blockFound ? "text-bitcoin" : "text-[#1a1a2e]",
                )}
              >
                #{gameData.weeklyRank}
              </p>
              <p
                className={cn(
                  "text-[10px] sm:text-xs transition-opacity duration-300",
                  revealed ? "opacity-100" : "opacity-40",
                  "text-[#555]",
                )}
              >
                this week
              </p>
            </div>
          );
        case "prize":
          return (
            <div className="flex flex-col items-center justify-center h-full gap-1">
              {gameData.blockFound ? (
                <>
                  <CurrencyBtc
                    size={isMobile() ? 28 : 36}
                    weight="fill"
                    className={cn(
                      "transition-opacity duration-300",
                      revealed ? "opacity-100 text-bitcoin" : "opacity-40 text-[#1a1a2e]",
                    )}
                  />
                  <p
                    className={cn(
                      "font-mono text-xl sm:text-2xl font-black tabular-nums transition-opacity duration-300",
                      revealed ? "opacity-100 text-bitcoin" : "opacity-40 text-[#1a1a2e]",
                    )}
                  >
                    {prizeText.line1}
                  </p>
                </>
              ) : (
                <>
                  <Diamond
                    size={isMobile() ? 24 : 32}
                    weight="fill"
                    className={cn(
                      "transition-opacity duration-300",
                      revealed ? "opacity-100 text-[#6366f1]" : "opacity-40 text-[#1a1a2e]",
                    )}
                  />
                  <p
                    className={cn(
                      "text-xs sm:text-sm font-bold transition-opacity duration-300",
                      revealed ? "opacity-100" : "opacity-40",
                      "text-[#1a1a2e]",
                    )}
                  >
                    {prizeText.line1}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] sm:text-xs font-semibold transition-opacity duration-300",
                      revealed ? "opacity-100" : "opacity-40",
                      "text-[#555]",
                    )}
                  >
                    {prizeText.line2}
                  </p>
                </>
              )}
            </div>
          );
      }
    },
    [revealedZones, gameData, prizeText],
  );

  /* ── Reduced motion: skip straight to result ── */
  if (reducedMotion) return null;

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* Gold flash for block found */}
      <AnimatePresence>
        {blockFlash && (
          <motion.div
            className="absolute inset-0 z-50 bg-bitcoin/30 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      {/* Instruction text */}
      <AnimatePresence>
        {(phase === "intro" || phase === "loading") && cardVisible && (
          <motion.p
            className="absolute top-[8%] sm:top-[10%] text-secondary text-sm sm:text-base z-20 pointer-events-none"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 1.0, duration: 0.5 }}
          >
            Scratch to reveal your results!
          </motion.p>
        )}
      </AnimatePresence>

      {/* Card container with flip */}
      <motion.div
        className="relative"
        style={{
          perspective: 1200,
          width: cardWidth,
          height: cardHeight,
        }}
        initial={{ y: 300, opacity: 0, scale: 0.85 }}
        animate={
          cardVisible
            ? {
                y: blockShake ? [0, -4, 4, -3, 3, -1, 0] : 0,
                opacity: 1,
                scale: 1,
              }
            : { y: 300, opacity: 0, scale: 0.85 }
        }
        transition={
          blockShake
            ? { duration: 0.5 }
            : { type: "spring", stiffness: 180, damping: 22, mass: 1 }
        }
      >
        <motion.div
          className="relative w-full h-full"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          transition={{ duration: durations.large, ...springs.stiff }}
        >
          {/* ── FRONT of card ── */}
          <div
            ref={cardRef}
            className="absolute inset-0 rounded-2xl overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              boxShadow: `
                0 0 0 2px #D4A843,
                0 0 20px rgba(212, 168, 67, 0.15),
                0 8px 32px rgba(0, 0, 0, 0.5)
              `,
            }}
          >
            {/* Card background: cream with subtle pattern */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(145deg, #FFF8E7 0%, #FFF5DC 40%, #FFFBF0 100%)",
              }}
            />

            {/* Subtle cross-hatch pattern */}
            <div
              className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: `
                  repeating-linear-gradient(45deg, #000 0px, #000 1px, transparent 1px, transparent 8px),
                  repeating-linear-gradient(-45deg, #000 0px, #000 1px, transparent 1px, transparent 8px)
                `,
              }}
            />

            {/* Header: Branding + Title */}
            <div className="relative z-10 pt-3 sm:pt-4 px-4 sm:px-6 text-center">
              <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-[#8B7355]">
                TheBitcoinGame
              </p>
              <p
                className="text-base sm:text-xl font-black uppercase tracking-wide mt-0.5"
                style={{ color: "#F7931A" }}
              >
                WEEKLY LOTTERY
              </p>
            </div>

            {/* Zone labels (positioned above scratch areas) */}
            {ZONE_ORDER.map((key) => {
              const z = zones[key];
              return (
                <div
                  key={`label-${key}`}
                  className="absolute z-10 text-center pointer-events-none overflow-hidden"
                  style={{
                    left: z.x,
                    top: z.y - 14,
                    width: z.w,
                    height: 14,
                    lineHeight: "14px",
                  }}
                >
                  <span className="text-[7px] sm:text-[9px] font-bold uppercase tracking-wider text-[#8B7355]/70 truncate block">
                    {ZONE_LABELS[key]}
                  </span>
                </div>
              );
            })}

            {/* Zone content (under scratch layer) */}
            {ZONE_ORDER.map((key) => {
              const z = zones[key];
              return (
                <div
                  key={`content-${key}`}
                  className="absolute z-0"
                  style={{
                    left: z.x,
                    top: z.y,
                    width: z.w,
                    height: z.h,
                    borderRadius: Math.min(z.w, z.h) * 0.06,
                    border: "1px dashed rgba(139, 115, 85, 0.2)",
                    overflow: "hidden",
                    contain: "strict",
                  }}
                >
                  {renderZoneContent(key)}
                </div>
              );
            })}

            {/* Scratch canvas overlay */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 z-20 touch-none"
              style={{ cursor: phase === "intro" || phase === "playing" ? "crosshair" : "default" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />

            {/* Metallic particles layer */}
            <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
              {particles.map((p) => {
                const age = (Date.now() - p.createdAt) / PARTICLE_LIFETIME_MS;
                const opacity = Math.max(0, 1 - age);
                const translateX = p.vx * age * 60;
                const translateY = p.vy * age * 60 + age * age * 40; // gravity
                const rot = p.rotation + age * 360;

                return (
                  <div
                    key={p.id}
                    className="absolute rounded-sm"
                    style={{
                      left: p.x,
                      top: p.y,
                      width: p.size,
                      height: p.size * 0.7,
                      backgroundColor: p.color,
                      opacity,
                      transform: `translate(${translateX}px, ${translateY}px) rotate(${rot}deg)`,
                      willChange: "transform, opacity",
                    }}
                  />
                );
              })}
            </div>

            {/* Sparkle effects layer */}
            <div className="absolute inset-0 z-30 pointer-events-none overflow-hidden">
              <AnimatePresence>
                {sparkles.map((s) => (
                  <motion.div
                    key={s.id}
                    className="absolute rounded-full"
                    style={{
                      left: s.x,
                      top: s.y,
                      width: 6 * s.scale,
                      height: 6 * s.scale,
                      backgroundColor: s.color,
                      boxShadow: `0 0 ${4 * s.scale}px ${s.color}`,
                    }}
                    initial={{
                      x: 0,
                      y: 0,
                      scale: 0,
                      opacity: 1,
                    }}
                    animate={{
                      x: Math.cos(s.angle) * s.distance,
                      y: Math.sin(s.angle) * s.distance,
                      scale: [0, 1.2, 0.5],
                      opacity: [1, 1, 0],
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Shine sweep animation */}
            {shineActive && (
              <div
                className="absolute inset-0 z-40 pointer-events-none overflow-hidden"
                style={{ borderRadius: "inherit" }}
              >
                <div
                  className="absolute top-0 h-full"
                  style={{
                    width: "30%",
                    background:
                      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 40%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.15) 60%, transparent 100%)",
                    animation: "shinePass 1.4s ease-in-out forwards",
                  }}
                />
              </div>
            )}
          </div>

          {/* ── BACK of card (result summary) ── */}
          <div
            className="absolute inset-0 rounded-2xl overflow-hidden"
            style={{
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              boxShadow: `
                0 0 0 2px #D4A843,
                0 0 20px rgba(212, 168, 67, 0.15),
                0 8px 32px rgba(0, 0, 0, 0.5)
              `,
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                background: gameData.blockFound
                  ? "linear-gradient(145deg, #1a1200 0%, #2d1f00 40%, #1a1200 100%)"
                  : "linear-gradient(145deg, #0D1117 0%, #161B22 40%, #0D1117 100%)",
              }}
            />

            {/* Decorative grid on back */}
            <div
              className="absolute inset-0 opacity-5"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(212,168,67,0.3) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(212,168,67,0.3) 1px, transparent 1px)
                `,
                backgroundSize: "20px 20px",
              }}
            />

            <div className="relative z-10 flex flex-col items-center justify-center h-full p-6 sm:p-8 gap-5">
              {/* Title */}
              <div className="text-center">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-gold/60">
                  TheBitcoinGame
                </p>
                <h2
                  className={cn(
                    "text-lg sm:text-xl font-black uppercase tracking-wide mt-1",
                    gameData.blockFound ? "text-bitcoin" : "text-primary",
                  )}
                >
                  {gameData.blockFound ? "BLOCK FOUND!" : "Your Weekly Mining Results"}
                </h2>
              </div>

              {/* Results grid */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-xs">
                {/* Hash */}
                <ResultCard
                  icon={<Hash size={16} weight="bold" className="text-gold/70" />}
                  label="Best Hash"
                  value={gameData.bestHash.slice(0, 12) + "..."}
                  mono
                />
                {/* Difficulty */}
                <ResultCard
                  icon={<Trophy size={16} weight="fill" className="text-gold/70" />}
                  label="Difficulty"
                  value={formatDifficulty(gameData.bestDifficulty)}
                  highlight={gameData.blockFound}
                />
                {/* Rank */}
                <ResultCard
                  icon={<Trophy size={16} weight="fill" className="text-gold/70" />}
                  label="Weekly Rank"
                  value={`#${gameData.weeklyRank}`}
                />
                {/* Prize */}
                <ResultCard
                  icon={
                    gameData.blockFound ? (
                      <CurrencyBtc size={16} weight="fill" className="text-bitcoin" />
                    ) : (
                      <Diamond size={16} weight="fill" className="text-[#6366f1]" />
                    )
                  }
                  label="Prize"
                  value={gameData.blockFound ? "3.125 BTC" : prizeText.line2}
                  highlight={gameData.blockFound}
                />
              </div>

              {/* Percentile */}
              <p className="text-xs sm:text-sm text-secondary text-center">
                Higher than{" "}
                <span className="text-bitcoin font-semibold">{gameData.percentile}%</span>{" "}
                of all miners
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Global CSS keyframes for shine animation */}
      <style>{`
        @keyframes shinePass {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(450%); }
        }
      `}</style>
    </div>
  );
}

/* ── Small result card for the back of the scratch card ── */

function ResultCard({
  icon,
  label,
  value,
  mono,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg p-3 border text-center space-y-1",
        highlight
          ? "bg-bitcoin/10 border-bitcoin/30"
          : "bg-white/[0.03] border-white/6",
      )}
    >
      <div className="flex items-center justify-center gap-1.5 mb-1">
        {icon}
        <span className="text-[9px] sm:text-[10px] uppercase tracking-wider text-secondary font-semibold">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-sm sm:text-base font-bold truncate",
          mono && "font-mono text-xs sm:text-sm",
          highlight ? "text-bitcoin" : "text-primary",
        )}
      >
        {value}
      </p>
    </div>
  );
}
