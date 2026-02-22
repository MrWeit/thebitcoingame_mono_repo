import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift,
  Cpu,
  Lightning,
  WifiHigh,
  Usb,
  CircleNotch,
  Check,
  CurrencyBtc,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Card } from "@/components/ui/Card";
import { Display } from "@/components/shared/Display";
import { useUserStore } from "@/stores/userStore";
import { useToastStore } from "@/stores/toastStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { modalBackdrop, springs, durations } from "@/lib/animation";

/* ── Types ── */
interface NoCoinersWizardProps {
  open: boolean;
  onClose: () => void;
}

const TOTAL_STEPS = 4;

/* ── Setup steps data ── */
const SETUP_STEPS = [
  { num: 1, text: "Unbox your Bitaxe", icon: Gift },
  { num: 2, text: "Plug in USB-C power", icon: Usb },
  { num: 3, text: "Connect to WiFi", icon: WifiHigh },
  { num: 4, text: "Wait for the lights", icon: Lightning },
];

/* ── Slide animation ── */
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 300 : -300,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -300 : 300,
    opacity: 0,
  }),
};

/* ── NoCoinersWizard ── */
export function NoCoinersWizard({ open, onClose }: NoCoinersWizardProps) {
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const setDisplayName = useUserStore((s) => s.setDisplayName);
  const setMode = useUserStore((s) => s.setMode);
  const completeOnboarding = useUserStore((s) => s.completeOnboarding);
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Step 2: Miner detection
  const [minerConnected, setMinerConnected] = useState(false);
  const [waitingForMiner, setWaitingForMiner] = useState(false);
  const minerTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Step 3: Username
  const [username, setUsername] = useState("");

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (minerTimeoutRef.current) clearTimeout(minerTimeoutRef.current);
    };
  }, []);

  // Start miner detection on step 2
  useEffect(() => {
    if (step === 2 && !minerConnected && !waitingForMiner) {
      setWaitingForMiner(true);
      minerTimeoutRef.current = setTimeout(() => {
        setMinerConnected(true);
        setWaitingForMiner(false);
        addToast({ type: "mining", title: "Miner detected!" });
        // Auto-advance after connection
        setTimeout(() => {
          setDirection(1);
          setStep(3);
        }, 1000);
      }, 5000);
    }
  }, [step, minerConnected, waitingForMiner, addToast]);

  /* ── Navigation ── */
  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }, [step]);

  const handleFinish = useCallback(() => {
    if (username.trim()) {
      setDisplayName(username.trim());
    }
    setMode("simple");
    completeOnboarding();
    localStorage.setItem("onboarding_complete", "true");
    addToast({
      type: "success",
      title: "You're all set!",
      message: "Your miner is searching for Bitcoin blocks",
    });
    onClose();
    navigate("/dashboard");
  }, [
    username,
    setDisplayName,
    setMode,
    completeOnboarding,
    addToast,
    onClose,
    navigate,
  ]);

  /* ── Transition config ── */
  const slideTransition = reduced
    ? { duration: 0.01 }
    : { ...springs.gentle, duration: 0.4 };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <motion.div
            variants={modalBackdrop}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: durations.small }}
            className="absolute inset-0 bg-canvas/95 backdrop-blur-md"
          />

          {/* Wizard container */}
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={slideTransition}
            className="relative w-full max-w-[560px] max-h-[90vh] mx-4 flex flex-col"
          >
            {/* Step indicator dots */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <motion.div
                  key={i}
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-colors duration-300",
                    i + 1 === step
                      ? "bg-bitcoin"
                      : i + 1 < step
                        ? "bg-green"
                        : "bg-white/10"
                  )}
                  animate={
                    reduced
                      ? {}
                      : { scale: i + 1 === step ? 1.2 : 1 }
                  }
                  transition={{ duration: 0.2 }}
                />
              ))}
            </div>

            {/* Content card */}
            <div className="bg-surface rounded-radius-lg border border-white/6 shadow-heavy overflow-hidden flex-1 overflow-y-auto">
              <AnimatePresence mode="wait" custom={direction}>
                {/* ── Step 1: Welcome ── */}
                {step === 1 && (
                  <motion.div
                    key="nc-step1"
                    custom={direction}
                    variants={reduced ? undefined : slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={slideTransition}
                    className="p-6 sm:p-10 text-center"
                  >
                    {/* Bitaxe illustration placeholder */}
                    <div className="relative w-28 h-28 mx-auto mb-6">
                      <div className="w-28 h-28 bg-elevated rounded-2xl border border-white/6 flex items-center justify-center">
                        <Cpu
                          weight="duotone"
                          className="w-14 h-14 text-bitcoin"
                        />
                      </div>
                      {/* Decorative corner accents */}
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-bitcoin/40 rounded-tr-lg" />
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-bitcoin/40 rounded-bl-lg" />
                      {/* Gift badge */}
                      <div className="absolute -top-2 -left-2 w-8 h-8 bg-bitcoin rounded-full flex items-center justify-center shadow-glow-orange">
                        <Gift
                          weight="fill"
                          className="w-4 h-4 text-white"
                        />
                      </div>
                    </div>

                    <Display
                      as="h1"
                      className="text-title sm:text-display-md text-primary mb-3"
                    >
                      Someone gave you a Bitcoin miner!
                    </Display>

                    <p className="text-body-lg text-secondary mb-8 max-w-sm mx-auto">
                      Let's set it up and start playing.
                    </p>

                    <Button variant="primary" size="lg" onClick={goNext}>
                      Get Started
                    </Button>
                  </motion.div>
                )}

                {/* ── Step 2: Plug It In ── */}
                {step === 2 && (
                  <motion.div
                    key="nc-step2"
                    custom={direction}
                    variants={reduced ? undefined : slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={slideTransition}
                    className="p-6 sm:p-10"
                  >
                    <Display
                      as="h2"
                      className="text-title text-primary mb-2 text-center"
                    >
                      Plug It In
                    </Display>
                    <p className="text-body text-secondary mb-6 text-center">
                      Your Bitaxe should already be configured.
                    </p>

                    {/* Setup steps */}
                    <div className="space-y-3 mb-8">
                      {SETUP_STEPS.map((s, idx) => (
                        <motion.div
                          key={s.num}
                          initial={
                            reduced ? false : { opacity: 0, x: 20 }
                          }
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: reduced ? 0 : idx * 0.1,
                            duration: 0.3,
                          }}
                        >
                          <Card
                            variant="standard"
                            padding="sm"
                            className="flex items-center gap-4"
                          >
                            <div className="w-9 h-9 rounded-full bg-cyan/10 flex items-center justify-center flex-shrink-0">
                              <s.icon
                                weight="duotone"
                                className="w-5 h-5 text-cyan"
                              />
                            </div>
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-caption text-secondary font-mono">
                                {s.num}.
                              </span>
                              <span className="text-body text-primary">
                                {s.text}
                              </span>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </div>

                    {/* Radar animation / Connected state */}
                    <div className="flex flex-col items-center py-4">
                      {minerConnected ? (
                        <motion.div
                          initial={reduced ? false : { scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={
                            reduced
                              ? { duration: 0.01 }
                              : {
                                  type: "spring",
                                  stiffness: 400,
                                  damping: 20,
                                }
                          }
                          className="flex flex-col items-center gap-3"
                        >
                          <div className="w-14 h-14 rounded-full bg-green/20 flex items-center justify-center">
                            <Check
                              weight="bold"
                              className="w-7 h-7 text-green"
                            />
                          </div>
                          <p className="text-body font-medium text-green">
                            Miner detected!
                          </p>
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <div className="relative w-20 h-20 flex items-center justify-center">
                            <Cpu
                              weight="duotone"
                              className="w-8 h-8 text-cyan relative z-10"
                            />
                            {!reduced &&
                              [0, 1, 2].map((i) => (
                                <motion.div
                                  key={i}
                                  className="absolute inset-0 rounded-full border border-cyan/30"
                                  initial={{
                                    scale: 0.3,
                                    opacity: 0.8,
                                  }}
                                  animate={{
                                    scale: [0.3, 1.2],
                                    opacity: [0.6, 0],
                                  }}
                                  transition={{
                                    duration: 2,
                                    delay: i * 0.6,
                                    repeat: Infinity,
                                    ease: "easeOut",
                                  }}
                                />
                              ))}
                            {reduced && (
                              <CircleNotch
                                weight="bold"
                                className="absolute w-16 h-16 text-cyan/30 animate-spin"
                              />
                            )}
                          </div>
                          <p className="text-caption text-secondary">
                            Waiting for your miner...
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-6">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={goNext}
                        fullWidth
                      >
                        Skip
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Choose Username ── */}
                {step === 3 && (
                  <motion.div
                    key="nc-step3"
                    custom={direction}
                    variants={reduced ? undefined : slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={slideTransition}
                    className="p-6 sm:p-10"
                  >
                    <Display
                      as="h2"
                      className="text-title text-primary mb-2 text-center"
                    >
                      Choose a Username
                    </Display>
                    <p className="text-body text-secondary mb-8 text-center">
                      Pick a fun name for the leaderboard
                    </p>

                    <TextInput
                      label="Your Username"
                      placeholder="CryptoMiner42..."
                      value={username}
                      onChange={(v) => setUsername(v.slice(0, 64))}
                      helperText={`${username.length}/64 characters`}
                    />

                    <div className="mt-8 flex justify-center">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={goNext}
                        disabled={!username.trim()}
                      >
                        Continue
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 4: The Lottery Explained ── */}
                {step === 4 && (
                  <motion.div
                    key="nc-step4"
                    custom={direction}
                    variants={reduced ? undefined : slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={slideTransition}
                    className="p-6 sm:p-10 text-center"
                  >
                    <div className="w-16 h-16 bg-bitcoin/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <CurrencyBtc
                        weight="fill"
                        className="w-9 h-9 text-bitcoin"
                      />
                    </div>

                    <Display
                      as="h2"
                      className="text-title text-primary mb-6"
                    >
                      The Bitcoin Lottery
                    </Display>

                    <div className="space-y-4 text-left max-w-md mx-auto mb-8">
                      {[
                        "Your miner is now searching for a Bitcoin block.",
                        "It\u2019s like a lottery \u2014 running 24/7.",
                        "Every Sunday, we show you how close you got.",
                        "If you ever find a block, you win the Bitcoin reward!",
                      ].map((text, idx) => (
                        <motion.p
                          key={idx}
                          initial={
                            reduced
                              ? false
                              : { opacity: 0, y: 10 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: reduced ? 0 : idx * 0.15,
                            duration: 0.3,
                          }}
                          className="text-body text-secondary flex items-start gap-3"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan mt-2 flex-shrink-0" />
                          <span>{text}</span>
                        </motion.p>
                      ))}
                    </div>

                    {/* Prize highlight */}
                    <motion.div
                      initial={
                        reduced ? false : { opacity: 0, scale: 0.9 }
                      }
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: reduced ? 0 : 0.6,
                        duration: 0.4,
                      }}
                      className="mb-8"
                    >
                      <p className="text-caption text-secondary mb-1">
                        Current prize
                      </p>
                      <p className="text-display-lg font-bold text-gold">
                        ~$300,000
                      </p>
                    </motion.div>

                    <Button
                      variant="primary"
                      size="lg"
                      onClick={handleFinish}
                    >
                      Cool! Let's Go
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
