import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightning,
  Copy,
  Check,
  Cpu,
  CircleNotch,
  Gauge,
  GameController,
  Medal,
  Trophy,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { Display } from "@/components/shared/Display";
import { Mono } from "@/components/shared/Mono";
import { useUserStore } from "@/stores/userStore";
import { useAuthStore } from "@/stores/authStore";
import { useToastStore } from "@/stores/toastStore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";
import { modalBackdrop, springs, durations } from "@/lib/animation";

/* ── Types ── */
interface OnboardingWizardProps {
  open: boolean;
  onClose: () => void;
}

type DeviceTab = "bitaxe" | "antminer" | "nerdaxe" | "other";

/* ── Constants ── */
const COUNTRY_OPTIONS = [
  { value: "US", label: "\u{1F1FA}\u{1F1F8} United States" },
  { value: "GB", label: "\u{1F1EC}\u{1F1E7} United Kingdom" },
  { value: "DE", label: "\u{1F1E9}\u{1F1EA} Germany" },
  { value: "JP", label: "\u{1F1EF}\u{1F1F5} Japan" },
  { value: "BR", label: "\u{1F1E7}\u{1F1F7} Brazil" },
  { value: "PT", label: "\u{1F1F5}\u{1F1F9} Portugal" },
  { value: "NO", label: "\u{1F1F3}\u{1F1F4} Norway" },
  { value: "ES", label: "\u{1F1EA}\u{1F1F8} Spain" },
  { value: "CA", label: "\u{1F1E8}\u{1F1E6} Canada" },
  { value: "AU", label: "\u{1F1E6}\u{1F1FA} Australia" },
  { value: "NL", label: "\u{1F1F3}\u{1F1F1} Netherlands" },
  { value: "CH", label: "\u{1F1E8}\u{1F1ED} Switzerland" },
  { value: "FR", label: "\u{1F1EB}\u{1F1F7} France" },
  { value: "IT", label: "\u{1F1EE}\u{1F1F9} Italy" },
  { value: "SE", label: "\u{1F1F8}\u{1F1EA} Sweden" },
  { value: "KR", label: "\u{1F1F0}\u{1F1F7} South Korea" },
  { value: "PL", label: "\u{1F1F5}\u{1F1F1} Poland" },
  { value: "CZ", label: "\u{1F1E8}\u{1F1FF} Czech Republic" },
  { value: "AT", label: "\u{1F1E6}\u{1F1F9} Austria" },
  { value: "FI", label: "\u{1F1EB}\u{1F1EE} Finland" },
];

const DEVICE_INSTRUCTIONS: Record<DeviceTab, string> = {
  bitaxe:
    "Open your Bitaxe web interface (usually http://bitaxe.local), go to Settings, and enter the stratum URL, username, and password above.",
  antminer:
    "Access your Antminer web panel (check your router for the IP). Navigate to Miner Configuration > General Settings and enter the pool details above.",
  nerdaxe:
    "Connect to your NerdAxe via USB and use the configuration tool. Enter the stratum URL and credentials in the pool settings section.",
  other:
    "Check your miner's documentation for pool configuration. Enter the stratum URL as Pool 1, your Bitcoin address as the username, and 'x' as the password.",
};

const TOUR_ITEMS = [
  {
    icon: Gauge,
    title: "Difficulty Meter",
    desc: "Your best hash of the week",
  },
  {
    icon: GameController,
    title: "Games",
    desc: "Play the weekly lottery on Sunday",
  },
  {
    icon: Medal,
    title: "Badges",
    desc: "Earn badges as you mine",
  },
  {
    icon: Trophy,
    title: "Leaderboard",
    desc: "Rank against miners worldwide",
  },
];

const TOTAL_STEPS = 4;

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

/* ── OnboardingWizard ── */
export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const reduced = useReducedMotion();
  const setDisplayName = useUserStore((s) => s.setDisplayName);
  const setCountryCode = useUserStore((s) => s.setCountryCode);
  const completeOnboarding = useUserStore((s) => s.completeOnboarding);
  const userAddress = useAuthStore((s) => s.user?.address ?? "");
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);

  // Step 2: Profile
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [countryInput, setCountryInput] = useState("");

  // Step 3: Stratum
  const [deviceTab, setDeviceTab] = useState<DeviceTab>("bitaxe");
  const [minerConnected, setMinerConnected] = useState(false);
  const [waitingForShare, setWaitingForShare] = useState(false);
  const minerTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clipboard
  const [copiedField, setCopiedField] = useState("");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (minerTimeoutRef.current) clearTimeout(minerTimeoutRef.current);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Start miner detection on step 3
  useEffect(() => {
    if (step === 3 && !minerConnected && !waitingForShare) {
      setWaitingForShare(true);
      minerTimeoutRef.current = setTimeout(() => {
        setMinerConnected(true);
        setWaitingForShare(false);
        addToast({ type: "mining", title: "Your miner is connected!" });
      }, 5000);
    }
  }, [step, minerConnected, waitingForShare, addToast]);

  /* ── Navigation ── */
  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }, [step]);

  const handleFinish = useCallback(() => {
    if (displayNameInput.trim()) {
      setDisplayName(displayNameInput.trim());
    }
    if (countryInput) {
      setCountryCode(countryInput);
    }
    completeOnboarding();
    localStorage.setItem("onboarding_complete", "true");
    addToast({ type: "success", title: "Setup complete! Welcome aboard." });
    onClose();
  }, [
    displayNameInput,
    countryInput,
    setDisplayName,
    setCountryCode,
    completeOnboarding,
    addToast,
    onClose,
  ]);

  /* ── Copy helpers ── */
  const copyToClipboard = useCallback(
    (text: string, fieldName: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedField(fieldName);
        addToast({ type: "success", title: `${fieldName} copied` });
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopiedField(""), 2000);
      });
    },
    [addToast]
  );

  const copyFullConfig = useCallback(() => {
    const config = `URL: stratum+tcp://mine.thebitcoingame.com:3333\nUsername: ${userAddress}\nPassword: x`;
    copyToClipboard(config, "Full config");
  }, [userAddress, copyToClipboard]);

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
                    key="step1"
                    custom={direction}
                    variants={reduced ? undefined : slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={slideTransition}
                    className="p-6 sm:p-10 text-center"
                  >
                    <div className="w-20 h-20 bg-bitcoin/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                      <Lightning
                        weight="fill"
                        className="w-10 h-10 text-bitcoin"
                      />
                    </div>

                    <Display
                      as="h1"
                      className="text-title sm:text-display-md text-primary mb-3"
                    >
                      Welcome to The Bitcoin Game!
                    </Display>

                    <p className="text-body-lg text-secondary mb-8 max-w-sm mx-auto">
                      Let's get you set up in 60 seconds.
                    </p>

                    <Button variant="primary" size="lg" onClick={goNext}>
                      Continue
                    </Button>
                  </motion.div>
                )}

                {/* ── Step 2: Profile Setup ── */}
                {step === 2 && (
                  <motion.div
                    key="step2"
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
                      Profile Setup
                    </Display>
                    <p className="text-body text-secondary mb-8 text-center">
                      Tell us a bit about yourself
                    </p>

                    <div className="space-y-5">
                      <TextInput
                        label="What should we call you?"
                        placeholder="Your mining alias..."
                        value={displayNameInput}
                        onChange={(v) =>
                          setDisplayNameInput(v.slice(0, 64))
                        }
                        helperText={`${displayNameInput.length}/64 characters`}
                      />

                      <Select
                        label="Where are you mining from?"
                        options={COUNTRY_OPTIONS}
                        value={countryInput}
                        onChange={setCountryInput}
                        placeholder="Select your country"
                      />
                    </div>

                    <div className="mt-8 flex justify-center">
                      <Button variant="primary" size="lg" onClick={goNext}>
                        Continue
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Connect Miner ── */}
                {step === 3 && (
                  <motion.div
                    key="step3"
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
                      Connect Your Miner
                    </Display>
                    <p className="text-body text-secondary mb-6 text-center">
                      Point your miner at our stratum server
                    </p>

                    {/* Stratum config */}
                    <div className="bg-elevated rounded-radius-md border border-white/6 p-4 space-y-3 mb-5">
                      <StratumField
                        label="URL"
                        value="stratum+tcp://mine.thebitcoingame.com:3333"
                        copied={copiedField === "URL"}
                        onCopy={() =>
                          copyToClipboard(
                            "stratum+tcp://mine.thebitcoingame.com:3333",
                            "URL"
                          )
                        }
                      />
                      <StratumField
                        label="Username"
                        value={userAddress || "your-btc-address"}
                        copied={copiedField === "Username"}
                        onCopy={() =>
                          copyToClipboard(
                            userAddress || "your-btc-address",
                            "Username"
                          )
                        }
                      />
                      <StratumField
                        label="Password"
                        value="x"
                        copied={copiedField === "Password"}
                        onCopy={() => copyToClipboard("x", "Password")}
                      />

                      <div className="pt-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          fullWidth
                          onClick={copyFullConfig}
                        >
                          {copiedField === "Full config"
                            ? "Copied!"
                            : "Copy Full Configuration"}
                        </Button>
                      </div>
                    </div>

                    {/* Device tabs */}
                    <div className="flex gap-1 mb-4 bg-elevated rounded-radius-md p-1">
                      {(
                        [
                          "bitaxe",
                          "antminer",
                          "nerdaxe",
                          "other",
                        ] as DeviceTab[]
                      ).map((tab) => (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setDeviceTab(tab)}
                          className={cn(
                            "flex-1 py-2 px-2 text-caption rounded-radius-sm transition-colors duration-150 capitalize",
                            deviceTab === tab
                              ? "bg-spotlight text-primary font-medium"
                              : "text-secondary hover:text-primary"
                          )}
                        >
                          {tab === "nerdaxe" ? "NerdAxe" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                      ))}
                    </div>

                    <p className="text-caption text-secondary mb-6">
                      {DEVICE_INSTRUCTIONS[deviceTab]}
                    </p>

                    {/* Radar animation / Connected state */}
                    <div className="flex flex-col items-center py-4">
                      {minerConnected ? (
                        <motion.div
                          initial={reduced ? false : { scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={
                            reduced
                              ? { duration: 0.01 }
                              : { type: "spring", stiffness: 400, damping: 20 }
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
                            Your miner is connected!
                          </p>
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          {/* Radar rings */}
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
                                  initial={{ scale: 0.3, opacity: 0.8 }}
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
                            Waiting for your first share...
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="mt-6 flex flex-col gap-3">
                      <Button variant="primary" size="lg" onClick={goNext} fullWidth>
                        Continue
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={goNext}
                        fullWidth
                      >
                        Skip for now
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 4: Quick Tour ── */}
                {step === 4 && (
                  <motion.div
                    key="step4"
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
                      Quick Tour
                    </Display>
                    <p className="text-body text-secondary mb-6 text-center">
                      Here's what you'll find inside
                    </p>

                    <div className="space-y-3">
                      {TOUR_ITEMS.map((item, idx) => (
                        <motion.div
                          key={item.title}
                          initial={
                            reduced
                              ? false
                              : { opacity: 0, x: 20 }
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
                            <div className="w-10 h-10 rounded-radius-md bg-cyan/10 flex items-center justify-center flex-shrink-0">
                              <item.icon
                                weight="duotone"
                                className="w-5 h-5 text-cyan"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-body font-medium text-primary">
                                {item.title}
                              </p>
                              <p className="text-caption text-secondary">
                                {item.desc}
                              </p>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </div>

                    <div className="mt-8 flex flex-col gap-3">
                      <Button
                        variant="primary"
                        size="lg"
                        onClick={handleFinish}
                        fullWidth
                      >
                        Start Mining!
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleFinish}
                        fullWidth
                      >
                        Skip
                      </Button>
                    </div>
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

/* ── Stratum field sub-component ── */
function StratumField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-caption text-secondary w-20 flex-shrink-0">
        {label}:
      </span>
      <Mono className="text-caption text-cyan truncate flex-1">{value}</Mono>
      <button
        type="button"
        onClick={onCopy}
        className={cn(
          "w-7 h-7 rounded-radius-sm flex items-center justify-center flex-shrink-0",
          "text-secondary hover:text-primary hover:bg-spotlight",
          "transition-colors duration-150"
        )}
        aria-label={`Copy ${label}`}
      >
        {copied ? (
          <Check weight="bold" className="w-3.5 h-3.5 text-green" />
        ) : (
          <Copy weight="bold" className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
