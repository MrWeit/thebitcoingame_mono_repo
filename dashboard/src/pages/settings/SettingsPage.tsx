import { useState } from "react";
import { motion } from "framer-motion";
import {
  SpeakerHigh,
  SpeakerSlash,
  SpeakerLow,
  Gear,
  Bell,
  Eye,
  Cube,
  GameController,
  Lightning,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Toggle } from "@/components/ui/Toggle";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/animation";
import { useSound } from "@/hooks/useSound";
import { type SoundMode } from "@/lib/sound-engine";

const soundModes: { mode: SoundMode; label: string; icon: typeof SpeakerHigh }[] = [
  { mode: "off", label: "Off", icon: SpeakerSlash },
  { mode: "subtle", label: "Subtle", icon: SpeakerLow },
  { mode: "full", label: "Full", icon: SpeakerHigh },
];

export default function SettingsPage() {
  const sound = useSound();

  // Sound state (persisted through useSound hook)
  const [soundMode, setSoundMode] = useState<SoundMode>(sound.getMode());
  const [gameSounds, setGameSounds] = useState(sound.getGameSounds());
  const [volume, setVolume] = useState(Math.round(sound.getVolume() * 100));

  // Notification toggles (local state only)
  const [pushNotifications, setPushNotifications] = useState(true);
  const [miningAlerts, setMiningAlerts] = useState(true);
  const [socialActivity, setSocialActivity] = useState(false);

  // Display toggles (local state only)
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactMode, setCompactMode] = useState(false);

  const handleSoundModeChange = (mode: SoundMode) => {
    setSoundMode(mode);
    sound.setMode(mode);
  };

  const handleGameSoundsChange = (enabled: boolean) => {
    setGameSounds(enabled);
    sound.setGameSounds(enabled);
  };

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    sound.setVolume(value / 100);
  };

  const handleTriggerBlockCelebration = () => {
    window.dispatchEvent(new CustomEvent("trigger-block-celebration"));
  };

  return (
    <motion.div
      className="space-y-6 pb-8"
      variants={staggerContainer}
      initial="initial"
      animate="animate"
    >
      {/* ── Page Header ── */}
      <motion.div variants={staggerItem} className="flex items-center gap-3">
        <Gear size={28} weight="duotone" className="text-secondary" />
        <h1 className="text-display-sm text-primary font-bold">Settings</h1>
      </motion.div>

      {/* ── Sound & Audio ── */}
      <motion.div variants={staggerItem}>
        <Card>
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <SpeakerHigh size={20} weight="duotone" className="text-cyan" />
              <h2 className="text-body-lg font-semibold text-primary">
                Sound & Audio
              </h2>
            </div>

            {/* Sound Mode Segmented Control */}
            <div className="space-y-2">
              <label className="text-caption text-secondary">
                Sound Effects
              </label>
              <div className="flex rounded-radius-md border border-white/6 overflow-hidden">
                {soundModes.map(({ mode, label, icon: Icon }) => {
                  const isActive = soundMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleSoundModeChange(mode)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 text-body transition-all",
                        isActive
                          ? "bg-elevated border-bitcoin/30 text-bitcoin"
                          : "text-secondary hover:text-primary"
                      )}
                    >
                      <Icon size={18} weight={isActive ? "fill" : "regular"} />
                      <span className="font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Game Sounds Toggle (only when sound != off) */}
            {soundMode !== "off" && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GameController
                    size={18}
                    weight="duotone"
                    className="text-secondary"
                  />
                  <span className="text-body text-primary">Game Sounds</span>
                </div>
                <Toggle
                  checked={gameSounds}
                  onChange={handleGameSoundsChange}
                />
              </div>
            )}

            {/* Master Volume Slider (only when sound != off) */}
            {soundMode !== "off" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-caption text-secondary">
                    Master Volume
                  </label>
                  <span className="text-caption text-primary font-mono">
                    {volume}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(e) =>
                    handleVolumeChange(Number(e.target.value))
                  }
                  className="w-full h-2 rounded-full appearance-none cursor-pointer bg-subtle"
                  style={{ accentColor: "#F7931A" }}
                />
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* ── Notifications ── */}
      <motion.div variants={staggerItem}>
        <Card>
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Bell size={20} weight="duotone" className="text-cyan" />
              <h2 className="text-body-lg font-semibold text-primary">
                Notifications
              </h2>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-body text-primary">
                Push Notifications
              </span>
              <Toggle
                checked={pushNotifications}
                onChange={setPushNotifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightning
                  size={18}
                  weight="duotone"
                  className="text-secondary"
                />
                <span className="text-body text-primary">Mining Alerts</span>
              </div>
              <Toggle checked={miningAlerts} onChange={setMiningAlerts} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-body text-primary">Social Activity</span>
              <Toggle
                checked={socialActivity}
                onChange={setSocialActivity}
              />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── Display ── */}
      <motion.div variants={staggerItem}>
        <Card>
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <Eye size={20} weight="duotone" className="text-cyan" />
              <h2 className="text-body-lg font-semibold text-primary">
                Display
              </h2>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-body text-primary block">
                  Reduced Motion
                </span>
                <span className="text-caption text-tertiary">
                  Respects your OS accessibility setting
                </span>
              </div>
              <Toggle checked={reducedMotion} onChange={setReducedMotion} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-body text-primary">Compact Mode</span>
              <Toggle checked={compactMode} onChange={setCompactMode} />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ── Developer (only in dev mode) ── */}
      {import.meta.env.DEV && (
        <motion.div variants={staggerItem}>
          <Card className="border-yellow/20">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Cube size={20} weight="duotone" className="text-yellow" />
                <h2 className="text-body-lg font-semibold text-primary">
                  Developer
                </h2>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-body text-primary block">
                    Trigger Block Found Celebration
                  </span>
                  <span className="text-caption text-tertiary">
                    Dispatches the block celebration overlay for testing
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Lightning size={16} weight="fill" />}
                  onClick={handleTriggerBlockCelebration}
                >
                  Trigger
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
