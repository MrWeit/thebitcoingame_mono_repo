import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Copy,
  Check,
  CheckCircle,
  WifiHigh,
  Gear,
  ListNumbers,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Mono } from "@/components/shared/Mono";
import { cn } from "@/lib/utils";
import { durations, easings, springs } from "@/lib/animation";
import { mockUser } from "@/mocks/data";

/* ── Stratum Configuration ── */
const STRATUM_CONFIG = {
  url: "stratum+tcp://mine.thebitcoingame.com:3333",
  username: mockUser.address,
  password: "x",
};

const FULL_CONFIG = `URL: ${STRATUM_CONFIG.url}\nUsername: ${STRATUM_CONFIG.username}\nPassword: ${STRATUM_CONFIG.password}`;

/* ── Device Guides ── */
type DeviceTab = "bitaxe" | "antminer" | "whatsminer" | "nerdaxe" | "other";

const DEVICE_GUIDES: Record<DeviceTab, { label: string; steps: string[] }> = {
  bitaxe: {
    label: "Bitaxe",
    steps: [
      "Open AxeOS web interface at your Bitaxe's IP address (e.g. http://192.168.1.42)",
      "Go to Settings and then Mining Configuration",
      "Paste the Stratum URL into the Pool URL field",
      "Set your Username to your Bitcoin address shown above",
      "Set Password to x and click Save — your Bitaxe will restart and begin mining",
    ],
  },
  antminer: {
    label: "Antminer",
    steps: [
      "Open your Antminer's web interface at its IP address",
      "Navigate to Miner Configuration in the left sidebar",
      "In Pool 1 URL, paste the Stratum URL shown above",
      "Set Worker to your Bitcoin address and Password to x",
      "Click Save & Apply — the miner will restart with the new configuration",
    ],
  },
  whatsminer: {
    label: "Whatsminer",
    steps: [
      "Access WhatsMiner's management page via its IP address",
      "Go to Configuration and then Mining Pools",
      "Enter the Stratum URL in the Pool 1 Address field",
      "Set your Bitcoin address as the Worker Name and Password as x",
      "Save settings — the miner will reconnect automatically",
    ],
  },
  nerdaxe: {
    label: "NerdAxe",
    steps: [
      "Connect to your NerdAxe's web interface (check the device display for IP)",
      "Navigate to the Mining tab in the top menu",
      "Replace the existing pool URL with the Stratum URL above",
      "Enter your Bitcoin address as the username",
      "Set password to x, click Apply, and watch the shares roll in",
    ],
  },
  other: {
    label: "Other",
    steps: [
      "Open your mining device's web configuration interface",
      "Find the pool or stratum configuration section",
      "Set the pool URL to: stratum+tcp://mine.thebitcoingame.com:3333",
      "Set the worker/username to your Bitcoin address shown above",
      "Set the password to x and save your configuration",
    ],
  },
};

/* ── Copy Button Hook ── */
function useCopyToClipboard() {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return { copiedField, copy };
}

/* ── Stratum Field Row ── */
function StratumField({
  label,
  value,
  fieldKey,
  copiedField,
  onCopy,
}: {
  label: string;
  value: string;
  fieldKey: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  const isCopied = copiedField === fieldKey;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <span className="text-caption text-secondary font-medium w-24 shrink-0">
        {label}
      </span>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <div
          className={cn(
            "flex-1 min-w-0 px-3 py-2 rounded-radius-sm",
            "bg-canvas border border-white/6",
            "overflow-x-auto"
          )}
        >
          <Mono className="text-body text-cyan whitespace-nowrap">
            {value}
          </Mono>
        </div>
        <motion.button
          onClick={() => onCopy(value, fieldKey)}
          className={cn(
            "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-radius-sm",
            "text-caption font-medium transition-colors",
            isCopied
              ? "bg-green/10 text-green border border-green/20"
              : "bg-elevated border border-white/6 text-secondary hover:text-primary hover:border-white/10"
          )}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: durations.micro }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isCopied ? (
              <motion.span
                key="check"
                className="flex items-center gap-1.5"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: durations.small }}
              >
                <Check size={14} weight="bold" />
                Copied!
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                className="flex items-center gap-1.5"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: durations.small }}
              >
                <Copy size={14} />
                Copy
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}

/* ── Radar / Scanning Animation ── */
function RadarAnimation() {
  return (
    <div className="relative w-28 h-28 flex items-center justify-center">
      {/* Concentric rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border border-cyan/20"
          initial={{ width: 20, height: 20, opacity: 0.8 }}
          animate={{
            width: [20, 112],
            height: [20, 112],
            opacity: [0.6, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: i * 0.8,
            ease: "easeOut",
          }}
        />
      ))}
      {/* Center dot */}
      <motion.div
        className="w-4 h-4 rounded-full bg-cyan/60"
        animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

/* ── Confetti Particle ── */
function ConfettiParticle({ delay, color }: { delay: number; color: string }) {
  const angle = Math.random() * Math.PI * 2;
  const distance = 40 + Math.random() * 60;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;

  return (
    <motion.div
      className="absolute w-2 h-2 rounded-full"
      style={{ backgroundColor: color }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{ x, y, scale: 0, opacity: 0 }}
      transition={{
        duration: 0.8 + Math.random() * 0.4,
        delay,
        ease: "easeOut",
      }}
    />
  );
}

/* ── Connection Status Section ── */
function ConnectionStatus() {
  const [connected, setConnected] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const confettiColors = [
    "#3FB950",
    "#58A6FF",
    "#F7931A",
    "#A371F7",
    "#D4A843",
  ];

  function handleSimulate() {
    setConnected(true);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 1500);
  }

  return (
    <Card variant="standard" padding="lg">
      <h3 className="text-headline font-semibold text-primary mb-6">
        Connection Status
      </h3>

      <div className="flex flex-col items-center text-center py-6">
        <AnimatePresence mode="wait">
          {!connected ? (
            <motion.div
              key="waiting"
              className="flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: durations.medium }}
            >
              <RadarAnimation />
              <p className="text-body-lg text-primary mt-6 mb-1">
                Waiting for your first share...
              </p>
              <p className="text-caption text-secondary mb-8">
                Make sure your miner is connected and running
              </p>
              <Button
                variant="secondary"
                size="md"
                leftIcon={<WifiHigh size={18} />}
                onClick={handleSimulate}
              >
                Simulate Connection
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="connected"
              className="flex flex-col items-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.medium }}
            >
              {/* Success icon with confetti */}
              <div className="relative flex items-center justify-center mb-6">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={springs.bouncy}
                >
                  <CheckCircle
                    size={72}
                    weight="fill"
                    className="text-green"
                  />
                </motion.div>
                {/* Confetti burst */}
                {showConfetti && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {Array.from({ length: 16 }).map((_, i) => (
                      <ConfettiParticle
                        key={i}
                        delay={i * 0.03}
                        color={confettiColors[i % confettiColors.length]}
                      />
                    ))}
                  </div>
                )}
              </div>
              <motion.p
                className="text-body-lg font-semibold text-green mb-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: durations.medium }}
              >
                Connected! Your miner is now hashing.
              </motion.p>
              <motion.p
                className="text-caption text-secondary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: durations.medium }}
              >
                First share received. Welcome to the game.
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ── Main Page ── */
export default function SetupPage() {
  const { copiedField, copy } = useCopyToClipboard();
  const [activeTab, setActiveTab] = useState<DeviceTab>("bitaxe");

  const deviceTabs = Object.keys(DEVICE_GUIDES) as DeviceTab[];
  const activeGuide = DEVICE_GUIDES[activeTab];

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: durations.medium, ease: easings.gentle }}
      >
        <h1 className="text-display-md font-bold text-primary">
          Mining Setup
        </h1>
        <p className="text-body-lg text-secondary mt-1">
          Connect your miner in minutes
        </p>
      </motion.div>

      {/* Stratum Configuration */}
      <Card variant="standard" padding="lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-radius-sm bg-cyan/10 flex items-center justify-center">
            <Gear size={20} className="text-cyan" />
          </div>
          <h3 className="text-headline font-semibold text-primary">
            Stratum Configuration
          </h3>
        </div>

        <div className="space-y-4">
          <StratumField
            label="Stratum URL"
            value={STRATUM_CONFIG.url}
            fieldKey="url"
            copiedField={copiedField}
            onCopy={copy}
          />
          <StratumField
            label="Username"
            value={STRATUM_CONFIG.username}
            fieldKey="username"
            copiedField={copiedField}
            onCopy={copy}
          />
          <StratumField
            label="Password"
            value={STRATUM_CONFIG.password}
            fieldKey="password"
            copiedField={copiedField}
            onCopy={copy}
          />
        </div>

        <div className="mt-6 pt-4 border-t border-white/4">
          <Button
            variant="secondary"
            size="md"
            leftIcon={
              copiedField === "full" ? (
                <Check size={18} weight="bold" />
              ) : (
                <Copy size={18} />
              )
            }
            onClick={() => copy(FULL_CONFIG, "full")}
          >
            {copiedField === "full"
              ? "Configuration Copied!"
              : "Copy Full Configuration"}
          </Button>
        </div>
      </Card>

      {/* Device-Specific Guide */}
      <Card variant="standard" padding="lg">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-radius-sm bg-purple/10 flex items-center justify-center">
            <ListNumbers size={20} className="text-purple" />
          </div>
          <h3 className="text-headline font-semibold text-primary">
            Setup Guide
          </h3>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 p-1 bg-canvas rounded-radius-md mb-6 overflow-x-auto">
          {deviceTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative px-4 py-2 text-caption font-medium rounded-radius-sm transition-colors whitespace-nowrap",
                "focus-visible:outline-cyan focus-visible:outline-2 focus-visible:outline-offset-2",
                activeTab === tab
                  ? "text-primary"
                  : "text-secondary hover:text-primary"
              )}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="setup-tab-bg"
                  className="absolute inset-0 bg-elevated border border-white/6 rounded-radius-sm"
                  transition={{
                    type: "spring",
                    stiffness: 350,
                    damping: 30,
                  }}
                />
              )}
              <span className="relative z-10">
                {DEVICE_GUIDES[tab].label}
              </span>
            </button>
          ))}
        </div>

        {/* Steps */}
        <AnimatePresence mode="wait">
          <motion.ol
            key={activeTab}
            className="space-y-4"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: durations.small, ease: easings.gentle }}
          >
            {activeGuide.steps.map((step, i) => (
              <motion.li
                key={i}
                className="flex gap-3"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.06,
                  duration: durations.small,
                  ease: easings.gentle,
                }}
              >
                <span
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
                    "bg-elevated border border-white/6 text-caption font-semibold text-cyan"
                  )}
                >
                  <Mono>{i + 1}</Mono>
                </span>
                <p className="text-body text-secondary pt-0.5">{step}</p>
              </motion.li>
            ))}
          </motion.ol>
        </AnimatePresence>
      </Card>

      {/* Connection Status */}
      <ConnectionStatus />
    </div>
  );
}
