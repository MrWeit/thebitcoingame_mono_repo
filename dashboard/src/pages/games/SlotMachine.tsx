import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import { GameWrapper } from "@/components/games/GameWrapper";
import { countMatchingHexChars, playSound } from "@/hooks/useGameData";
import { type WeeklyGameData } from "@/hooks/useGameData";
import { formatDifficulty } from "@/mocks/data";
import { cn } from "@/lib/utils";

/* ── Constants ── */
const HEX_CHARS = "0123456789abcdef".split("");
const REEL_COPIES = 6;
const CHAR_HEIGHT = 64; // px per character cell
const VISIBLE_CHARS = 3;
const REEL_STRIP = Array.from({ length: REEL_COPIES }, () => HEX_CHARS).flat();
const TOTAL_CHARS = REEL_STRIP.length;

const REEL_STOP_DELAYS = [1500, 2500, 3500]; // ms after spin start
const LED_COUNT = 12;

type ReelState = "idle" | "spinning" | "stopping" | "stopped";

/* ── Helpers ── */
function getTargetIndex(char: string): number {
  // Find a target in the middle portion of the strip for natural stopping
  const charIndex = HEX_CHARS.indexOf(char.toLowerCase());
  if (charIndex === -1) return REEL_COPIES * 3 * 16; // fallback
  // Place the target in the 4th copy of the strip (middle-ish)
  return 16 * 3 + charIndex;
}

function getTargetY(char: string): number {
  const idx = getTargetIndex(char);
  // Center the target in the visible window (middle of 3 visible chars)
  return -(idx - 1) * CHAR_HEIGHT;
}

/* ── Reel Component ── */
function Reel({
  targetChar,
  state,
  onStopped,
  reducedMotion,
}: {
  targetChar: string;
  state: ReelState;
  onStopped: () => void;
  reducedMotion: boolean;
}) {
  const controls = useAnimation();
  const [currentY, setCurrentY] = useState(0);
  const spinRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const startTimeRef = useRef(0);
  const yRef = useRef(0);

  // Start spinning
  useEffect(() => {
    if (state === "spinning") {
      const speed = -(CHAR_HEIGHT * 20); // px per second
      startTimeRef.current = performance.now();
      yRef.current = 0;

      const animate = (time: number) => {
        const elapsed = (time - startTimeRef.current) / 1000;
        const y = elapsed * speed;
        // Wrap around the strip
        const wrapped = y % (TOTAL_CHARS * CHAR_HEIGHT);
        yRef.current = wrapped;
        setCurrentY(wrapped);
        spinRef.current = requestAnimationFrame(animate);
      };
      spinRef.current = requestAnimationFrame(animate);

      return () => {
        if (spinRef.current) cancelAnimationFrame(spinRef.current);
      };
    }
  }, [state]);

  // Stop reel with spring snap
  useEffect(() => {
    if (state === "stopping") {
      if (spinRef.current) cancelAnimationFrame(spinRef.current);

      const targetY = getTargetY(targetChar);

      if (reducedMotion) {
        setCurrentY(targetY);
        onStopped();
        return;
      }

      controls
        .start({
          y: targetY,
          transition: {
            type: "spring",
            stiffness: 200,
            damping: 18,
            mass: 1.2,
          },
        })
        .then(() => {
          onStopped();
        });
    }
  }, [state, targetChar, controls, onStopped, reducedMotion]);

  // For idle / result, show target position directly
  useEffect(() => {
    if (state === "idle" || state === "stopped") {
      const targetY = getTargetY(targetChar);
      setCurrentY(targetY);
    }
  }, [state, targetChar]);

  const isSpinning = state === "spinning";
  const isStopping = state === "stopping";

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: VISIBLE_CHARS * CHAR_HEIGHT,
        width: 80,
      }}
    >
      {/* Reel strip */}
      <motion.div
        animate={isStopping ? controls : undefined}
        style={{
          y: isStopping ? undefined : currentY,
        }}
        className="will-change-transform"
      >
        {REEL_STRIP.map((char, i) => {
          const isTarget =
            (state === "stopped" || state === "stopping") &&
            i === getTargetIndex(targetChar);
          const isMatch = isTarget && targetChar === "0";

          return (
            <div
              key={`${i}-${char}`}
              className={cn(
                "flex items-center justify-center font-mono font-bold select-none transition-colors duration-300",
                isTarget && isMatch && "text-gold",
                isTarget && !isMatch && "text-primary",
                !isTarget && "text-secondary/50"
              )}
              style={{
                height: CHAR_HEIGHT,
                fontSize: 36,
                textShadow: isTarget && isMatch
                  ? "0 0 20px rgba(212, 168, 67, 0.8), 0 0 40px rgba(212, 168, 67, 0.4)"
                  : isTarget
                    ? "0 0 10px rgba(230, 237, 243, 0.3)"
                    : "none",
              }}
            >
              {char.toUpperCase()}
            </div>
          );
        })}
      </motion.div>

      {/* Spin blur overlay */}
      <AnimatePresence>
        {isSpinning && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            style={{
              backdropFilter: "blur(1.5px)",
              WebkitBackdropFilter: "blur(1.5px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Top/bottom fade gradients */}
      <div
        className="absolute top-0 left-0 right-0 h-6 pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(180deg, #0a0e15 0%, transparent 100%)",
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 h-6 pointer-events-none z-10"
        style={{
          background:
            "linear-gradient(0deg, #0a0e15 0%, transparent 100%)",
        }}
      />
    </div>
  );
}

/* ── LED Strip Component ── */
function LedStrip({
  side,
  active,
  jackpot,
}: {
  side: "left" | "right";
  active: boolean;
  jackpot: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between py-3",
        side === "left" ? "pr-1" : "pl-1"
      )}
      style={{ width: 12, height: VISIBLE_CHARS * CHAR_HEIGHT + 40 }}
    >
      {Array.from({ length: LED_COUNT }).map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all"
          style={{
            width: 6,
            height: 6,
            background: active
              ? jackpot
                ? `hsl(${(i * 30 + Date.now() / 20) % 360}, 100%, 60%)`
                : "#F7931A"
              : "#2a2a2a",
            boxShadow: active
              ? jackpot
                ? `0 0 8px 2px hsl(${(i * 30 + Date.now() / 20) % 360}, 100%, 60%)`
                : `0 0 6px 1px rgba(247, 147, 26, ${0.3 + 0.7 * Math.abs(Math.sin((Date.now() / 300 + i * 0.3)))})`
              : "none",
            animation: active
              ? `ledPulse ${jackpot ? 0.15 : 0.8}s ease-in-out ${i * (jackpot ? 0.02 : 0.08)}s infinite alternate`
              : "none",
          }}
        />
      ))}
    </div>
  );
}

/* ── Lever Component ── */
function Lever({
  pulled,
  onClick,
  disabled,
}: {
  pulled: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex flex-col items-center cursor-pointer transition-transform active:scale-95",
        disabled && "cursor-not-allowed opacity-60"
      )}
      aria-label="Pull lever to spin"
    >
      {/* Lever base */}
      <div
        className="w-4 rounded-full"
        style={{
          height: 100,
          background: "linear-gradient(90deg, #555, #888, #555)",
          boxShadow: "inset -1px 0 2px rgba(0,0,0,0.5), 1px 0 2px rgba(255,255,255,0.1)",
        }}
      />
      {/* Knob */}
      <motion.div
        animate={{
          y: pulled ? 30 : 0,
          rotate: pulled ? 5 : 0,
        }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 15,
        }}
        className="absolute -top-4"
      >
        <div
          className="w-8 h-8 rounded-full border-2 border-white/20"
          style={{
            background: "radial-gradient(circle at 35% 35%, #ff4444, #cc0000, #880000)",
            boxShadow: pulled
              ? "0 2px 8px rgba(200, 0, 0, 0.4)"
              : "0 4px 12px rgba(200, 0, 0, 0.6), 0 0 20px rgba(200, 0, 0, 0.2)",
          }}
        />
      </motion.div>
    </button>
  );
}

/* ── Falling Coin ── */
function FallingCoin({ delay, x }: { delay: number; x: number }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: 12 + Math.random() * 8,
        height: 12 + Math.random() * 8,
        left: x,
        top: -20,
        background: "radial-gradient(circle at 35% 35%, #ffd700, #daa520, #b8860b)",
        boxShadow: "0 0 6px rgba(255, 215, 0, 0.6)",
        border: "1px solid rgba(255, 215, 0, 0.4)",
      }}
      initial={{ y: -20, opacity: 1, rotate: 0 }}
      animate={{
        y: 500,
        opacity: [1, 1, 0],
        rotate: Math.random() * 720 - 360,
        x: (Math.random() - 0.5) * 60,
      }}
      transition={{
        duration: 2 + Math.random() * 1.5,
        delay,
        ease: [0.25, 0, 0.5, 1],
      }}
    />
  );
}

/* ── Confetti Particle ── */
function ConfettiParticle({
  delay,
  color,
}: {
  delay: number;
  color: string;
}) {
  const startX = Math.random() * 100;
  const drift = (Math.random() - 0.5) * 200;

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        width: 6 + Math.random() * 4,
        height: 6 + Math.random() * 4,
        left: `${startX}%`,
        top: "30%",
        background: color,
        borderRadius: Math.random() > 0.5 ? "50%" : "2px",
      }}
      initial={{ y: 0, x: 0, opacity: 1, rotate: 0, scale: 1 }}
      animate={{
        y: [0, -100 - Math.random() * 100, 400],
        x: [0, drift * 0.5, drift],
        opacity: [1, 1, 0],
        rotate: Math.random() * 720,
        scale: [1, 1.2, 0.5],
      }}
      transition={{
        duration: 2.5 + Math.random() * 1.5,
        delay,
        ease: "easeOut",
      }}
    />
  );
}

/* ── Main SlotMachine Component ── */
function SlotMachineGame({
  phase,
  setPhase,
  gameData,
  reducedMotion,
}: {
  phase: "loading" | "intro" | "playing" | "result";
  setPhase: (p: "loading" | "intro" | "playing" | "result") => void;
  gameData: WeeklyGameData;
  reducedMotion: boolean;
}) {
  const [reelStates, setReelStates] = useState<[ReelState, ReelState, ReelState]>([
    "idle",
    "idle",
    "idle",
  ]);
  const [ledsActive, setLedsActive] = useState(false);
  const [leverPulled, setLeverPulled] = useState(false);
  const [showJackpot, setShowJackpot] = useState(false);
  const [, setJackpotStep] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [machineShake, setMachineShake] = useState(false);
  const [ledTick, setLedTick] = useState(0);

  const stopTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const machineControls = useAnimation();

  const matchCount = useMemo(
    () => countMatchingHexChars(gameData.bestHash),
    [gameData.bestHash]
  );

  // First 3 characters of the hash for the reels
  const reelTargets = useMemo(
    () => [
      gameData.bestHash[0],
      gameData.bestHash[1],
      gameData.bestHash[2],
    ],
    [gameData.bestHash]
  );

  // LED tick for animation refresh
  useEffect(() => {
    if (!ledsActive) return;
    const interval = setInterval(() => setLedTick((t) => t + 1), 80);
    return () => clearInterval(interval);
  }, [ledsActive]);

  // Suppress unused-var lint — ledTick drives re-renders for LED animation
  void ledTick;

  // Phase: loading -> intro
  useEffect(() => {
    if (phase === "loading") {
      const timer = setTimeout(() => {
        setPhase("intro");
        setLedsActive(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, setPhase]);

  // Handle reduced motion — jump straight to result display
  useEffect(() => {
    if (reducedMotion && phase !== "result") {
      setReelStates(["stopped", "stopped", "stopped"]);
      setPhase("result");
    }
  }, [reducedMotion, phase, setPhase]);

  const handleReelStopped = useCallback(
    (index: number) => {
      const isMatch = reelTargets[index] === "0";
      if (isMatch) {
        playSound("cha-ching");
      }

      setReelStates((prev) => {
        const next = [...prev] as [ReelState, ReelState, ReelState];
        next[index] = "stopped";
        return next;
      });
    },
    [reelTargets]
  );

  // Check if all reels stopped -> transition to result
  useEffect(() => {
    if (
      phase === "playing" &&
      reelStates[0] === "stopped" &&
      reelStates[1] === "stopped" &&
      reelStates[2] === "stopped"
    ) {
      // All stopped
      const matchingReels = reelTargets.filter((c) => c === "0").length;
      setDisplayText(
        `${matchCount} MATCH${matchCount !== 1 ? "ES" : ""}! DIFF: ${formatDifficulty(gameData.bestDifficulty)}`
      );

      if (gameData.blockFound) {
        // JACKPOT sequence
        setTimeout(() => {
          setShowJackpot(true);
          setMachineShake(true);
          playSound("jackpot");
          setJackpotStep(1);

          // Gold cascade on characters
          setTimeout(() => setJackpotStep(2), 600);
          // Stop shaking, show result
          setTimeout(() => {
            setMachineShake(false);
            setPhase("result");
          }, 3000);
        }, 500);
      } else {
        // Normal result
        setTimeout(() => {
          setPhase("result");
        }, matchingReels > 0 ? 1200 : 600);
      }
    }
  }, [
    phase,
    reelStates,
    reelTargets,
    matchCount,
    gameData.bestDifficulty,
    gameData.blockFound,
    setPhase,
  ]);

  // Machine shake animation
  useEffect(() => {
    if (machineShake) {
      const interval = setInterval(() => {
        machineControls.set({
          x: (Math.random() - 0.5) * 8,
          y: (Math.random() - 0.5) * 4,
          rotate: (Math.random() - 0.5) * 2,
        });
      }, 50);
      return () => {
        clearInterval(interval);
        machineControls.set({ x: 0, y: 0, rotate: 0 });
      };
    }
  }, [machineShake, machineControls]);

  const handlePull = useCallback(() => {
    if (phase !== "intro") return;

    setPhase("playing");
    setLeverPulled(true);
    playSound("slot-pull");

    // Start all reels spinning
    setReelStates(["spinning", "spinning", "spinning"]);

    // Reset lever after a beat
    setTimeout(() => setLeverPulled(false), 400);

    // Staggered stops
    REEL_STOP_DELAYS.forEach((delay, i) => {
      const timer = setTimeout(() => {
        setReelStates((prev) => {
          const next = [...prev] as [ReelState, ReelState, ReelState];
          next[i] = "stopping";
          return next;
        });
      }, delay);
      stopTimers.current.push(timer);
    });
  }, [phase, setPhase]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      stopTimers.current.forEach(clearTimeout);
    };
  }, []);

  // Confetti particles
  const confettiParticles = useMemo(() => {
    if (phase !== "result" || reducedMotion) return [];
    const count = gameData.blockFound ? 0 : Math.min(matchCount * 6, 40);
    const colors = ["#F7931A", "#D4A843", "#ffd700", "#ff8c00", "#E6EDF3"];
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      delay: Math.random() * 0.5,
      color: colors[i % colors.length],
    }));
  }, [phase, matchCount, gameData.blockFound, reducedMotion]);

  // Jackpot coins
  const jackpotCoins = useMemo(() => {
    if (!showJackpot || reducedMotion) return [];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      delay: Math.random() * 2,
      x: Math.random() * 300 - 20,
    }));
  }, [showJackpot, reducedMotion]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* CSS keyframes injected */}
      <style>{`
        @keyframes ledPulse {
          0% { opacity: 0.5; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes coinGlow {
          0%, 100% { box-shadow: 0 0 10px rgba(247, 147, 26, 0.3); }
          50% { box-shadow: 0 0 25px rgba(247, 147, 26, 0.7); }
        }
        @keyframes jackpotFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes textShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* Machine wrapper */}
      <motion.div
        initial={reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: reducedMotion ? 0 : 0.8,
          ease: [0.25, 0.1, 0.25, 1],
        }}
        className="relative"
      >
        <motion.div animate={machineControls} className="relative">
          {/* Machine body */}
          <div
            className="relative rounded-2xl overflow-hidden"
            style={{
              width: "min(440px, 90vw)",
              background:
                "linear-gradient(180deg, #1C2333 0%, #0D1117 40%, #0a0e15 70%, #1C2333 100%)",
              boxShadow:
                "0 0 60px rgba(0, 0, 0, 0.8), 0 20px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
              border: "2px solid #2a3040",
            }}
          >
            {/* Chrome top trim */}
            <div
              className="h-1.5 w-full"
              style={{
                background:
                  "linear-gradient(90deg, #333, #666, #999, #666, #333)",
              }}
            />

            {/* Machine title */}
            <div className="text-center pt-5 pb-3 px-4">
              <h2
                className="text-headline sm:text-title font-bold tracking-wider uppercase font-mono"
                style={{
                  background:
                    "linear-gradient(180deg, #e0e0e0 0%, #888 40%, #aaa 60%, #e0e0e0 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textShadow: "none",
                  filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
                }}
              >
                Bitcoin Slots
              </h2>
              {/* Decorative line under title */}
              <div
                className="mx-auto mt-2 rounded-full"
                style={{
                  width: 120,
                  height: 2,
                  background:
                    "linear-gradient(90deg, transparent, #F7931A, transparent)",
                }}
              />
            </div>

            {/* Reels section */}
            <div className="flex items-center justify-center px-4 sm:px-6 py-2">
              {/* Left LED strip */}
              <LedStrip
                side="left"
                active={ledsActive}
                jackpot={showJackpot}
              />

              {/* Reels container */}
              <div
                className="flex items-center gap-1 rounded-xl px-3 py-3 mx-2 relative"
                style={{
                  background:
                    "linear-gradient(180deg, #060810 0%, #0a0e18 50%, #060810 100%)",
                  border: "1px solid #1a2030",
                  boxShadow:
                    "inset 0 2px 10px rgba(0, 0, 0, 0.8), inset 0 -2px 10px rgba(0, 0, 0, 0.5)",
                }}
              >
                {/* Payline indicator left */}
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-8 rounded-r z-20"
                  style={{
                    background: "#F7931A",
                    boxShadow: "0 0 12px rgba(247, 147, 26, 0.6)",
                  }}
                />

                {/* Reel 0 */}
                <div className="relative">
                  <Reel
                    targetChar={reelTargets[0]}
                    state={reelStates[0]}
                    onStopped={() => handleReelStopped(0)}
                    reducedMotion={reducedMotion}
                  />
                </div>

                {/* Divider */}
                <div
                  className="w-px self-stretch opacity-30"
                  style={{ background: "linear-gradient(180deg, transparent, #3a4050, transparent)" }}
                />

                {/* Reel 1 */}
                <div className="relative">
                  <Reel
                    targetChar={reelTargets[1]}
                    state={reelStates[1]}
                    onStopped={() => handleReelStopped(1)}
                    reducedMotion={reducedMotion}
                  />
                </div>

                {/* Divider */}
                <div
                  className="w-px self-stretch opacity-30"
                  style={{ background: "linear-gradient(180deg, transparent, #3a4050, transparent)" }}
                />

                {/* Reel 2 */}
                <div className="relative">
                  <Reel
                    targetChar={reelTargets[2]}
                    state={reelStates[2]}
                    onStopped={() => handleReelStopped(2)}
                    reducedMotion={reducedMotion}
                  />
                </div>

                {/* Payline indicator right */}
                <div
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-8 rounded-l z-20"
                  style={{
                    background: "#F7931A",
                    boxShadow: "0 0 12px rgba(247, 147, 26, 0.6)",
                  }}
                />

                {/* Payline glow across */}
                <div
                  className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-[64px] pointer-events-none z-10 rounded"
                  style={{
                    border: "1px solid rgba(247, 147, 26, 0.15)",
                    boxShadow:
                      "inset 0 0 20px rgba(247, 147, 26, 0.05), 0 0 15px rgba(247, 147, 26, 0.05)",
                  }}
                />
              </div>

              {/* Right LED strip */}
              <LedStrip
                side="right"
                active={ledsActive}
                jackpot={showJackpot}
              />
            </div>

            {/* LED display panel */}
            <div className="px-6 py-3">
              <div
                className="rounded-lg px-4 py-3 text-center font-mono text-caption sm:text-body"
                style={{
                  background:
                    "linear-gradient(180deg, #05080a 0%, #0a0f16 100%)",
                  border: "1px solid #1a2030",
                  boxShadow: "inset 0 1px 4px rgba(0, 0, 0, 0.6)",
                  minHeight: 44,
                }}
              >
                <AnimatePresence mode="wait">
                  {phase === "loading" && (
                    <motion.span
                      key="loading"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                      className="text-bitcoin"
                    >
                      INITIALIZING...
                    </motion.span>
                  )}
                  {phase === "intro" && (
                    <motion.span
                      key="intro"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ repeat: Infinity, duration: 1.2 }}
                      className="text-bitcoin"
                    >
                      PULL THE LEVER
                    </motion.span>
                  )}
                  {phase === "playing" &&
                    reelStates.some((s) => s === "spinning" || s === "stopping") && (
                      <motion.span
                        key="playing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-green"
                      >
                        SPINNING...
                      </motion.span>
                    )}
                  {(phase === "playing" || phase === "result") &&
                    displayText && (
                      <motion.span
                        key="result-text"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 300,
                          damping: 20,
                        }}
                        className={cn(
                          matchCount > 5 ? "text-gold" : "text-primary"
                        )}
                      >
                        {displayText}
                      </motion.span>
                    )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom control area with lever */}
            <div className="flex items-center justify-center gap-6 px-6 pb-5 pt-2">
              {/* Coin slot decoration */}
              <div
                className="rounded-md"
                style={{
                  width: 48,
                  height: 8,
                  background:
                    "linear-gradient(180deg, #1a1a1a, #333, #1a1a1a)",
                  boxShadow: "inset 0 1px 3px rgba(0,0,0,0.8)",
                  animation:
                    phase === "intro" ? "coinGlow 2s ease-in-out infinite" : "none",
                }}
              />

              {/* Pull button (mobile-friendly, used alongside lever) */}
              <motion.button
                onClick={handlePull}
                disabled={phase !== "intro"}
                className={cn(
                  "px-6 py-2.5 rounded-lg font-mono font-bold text-caption uppercase tracking-wider transition-all",
                  phase === "intro"
                    ? "text-canvas cursor-pointer"
                    : "bg-elevated text-secondary/40 cursor-not-allowed"
                )}
                style={
                  phase === "intro"
                    ? {
                        background:
                          "linear-gradient(180deg, #F7931A, #d47a10)",
                        boxShadow:
                          "0 4px 15px rgba(247, 147, 26, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
                      }
                    : undefined
                }
                whileHover={phase === "intro" ? { scale: 1.05 } : undefined}
                whileTap={phase === "intro" ? { scale: 0.95 } : undefined}
              >
                {phase === "intro" ? "SPIN" : phase === "playing" ? "..." : "SPIN"}
              </motion.button>

              {/* Lever */}
              <Lever
                pulled={leverPulled}
                onClick={handlePull}
                disabled={phase !== "intro"}
              />
            </div>

            {/* Chrome bottom trim */}
            <div
              className="h-1.5 w-full"
              style={{
                background:
                  "linear-gradient(90deg, #333, #666, #999, #666, #333)",
              }}
            />
          </div>

          {/* Machine shadow/glow underneath */}
          <div
            className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-8 rounded-full blur-xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse, rgba(247, 147, 26, 0.15) 0%, transparent 70%)",
            }}
          />
        </motion.div>
      </motion.div>

      {/* "PULL THE LEVER" floating prompt */}
      <AnimatePresence>
        {phase === "intro" && !reducedMotion && (
          <motion.p
            className="absolute bottom-[18%] sm:bottom-[15%] text-body sm:text-body-lg font-mono text-bitcoin tracking-wider"
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: [0.4, 1, 0.4],
              y: [0, -4, 0],
            }}
            exit={{ opacity: 0, y: 10 }}
            transition={{
              opacity: { repeat: Infinity, duration: 2 },
              y: { repeat: Infinity, duration: 2 },
            }}
          >
            TAP TO PLAY
          </motion.p>
        )}
      </AnimatePresence>

      {/* Result info text */}
      <AnimatePresence>
        {phase === "result" && !gameData.blockFound && !reducedMotion && (
          <motion.div
            className="absolute bottom-[28%] sm:bottom-[24%] text-center px-6 max-w-md"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <p className="text-body text-secondary">
              <span className="text-primary font-mono font-bold">
                {matchCount}
              </span>{" "}
              matching hex character{matchCount !== 1 ? "s" : ""}! Difficulty:{" "}
              <span className="text-primary font-mono">
                {formatDifficulty(gameData.bestDifficulty)}
              </span>
            </p>
            <p className="text-caption text-secondary/60 mt-1.5">
              If you matched all 64... that&apos;s a BLOCK!
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confetti */}
      {confettiParticles.map((p) => (
        <ConfettiParticle key={p.id} delay={p.delay} color={p.color} />
      ))}

      {/* Jackpot overlay */}
      <AnimatePresence>
        {showJackpot && !reducedMotion && (
          <>
            {/* Jackpot text */}
            <motion.div
              className="absolute top-[8%] sm:top-[12%] z-30 text-center"
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 12,
              }}
            >
              <h1
                className="text-display-lg sm:text-hero font-bold font-mono tracking-wider"
                style={{
                  background:
                    "linear-gradient(90deg, #ffd700, #ffaa00, #ffd700, #ffdd44, #ffd700)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "textShimmer 2s linear infinite",
                  filter: "drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))",
                }}
              >
                JACKPOT!!!
              </h1>
            </motion.div>

            {/* Falling coins */}
            <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
              {jackpotCoins.map((coin) => (
                <FallingCoin key={coin.id} delay={coin.delay} x={coin.x} />
              ))}
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Default Export ── */
export default function SlotMachine() {
  return (
    <GameWrapper gameName="Bitcoin Slots" gameSlug="slot-machine">
      {({ phase, setPhase, gameData, reducedMotion }) => (
        <SlotMachineGame
          phase={phase}
          setPhase={setPhase}
          gameData={gameData}
          reducedMotion={reducedMotion}
        />
      )}
    </GameWrapper>
  );
}
