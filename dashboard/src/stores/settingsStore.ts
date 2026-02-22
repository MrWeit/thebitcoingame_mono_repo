import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NotificationPreferences {
  // High priority (default on)
  personalBest: boolean;
  badgeEarned: boolean;
  worldCupMatch: boolean;
  lotteryResults: boolean;
  // Medium priority (default off)
  blockFoundAny: boolean;
  leaderboardChange: boolean;
  coopActivity: boolean;
  educationRecommendation: boolean;
  // Delivery
  inApp: boolean;
  browserPush: boolean;
  emailNotifications: boolean;
  email: string;
}

export interface PrivacySettings {
  publicProfile: boolean;
  showOnLeaderboard: boolean;
  showCountryFlag: boolean;
  showInCoopRankings: boolean;
}

export interface MiningSettings {
  coinbaseSignature: string;
  difficultyPreference: "auto" | "low" | "medium" | "high";
}

export interface SoundSettings {
  mode: "off" | "subtle" | "full";
  gameSounds: boolean;
  volume: number;
}

interface SettingsState {
  notifications: NotificationPreferences;
  privacy: PrivacySettings;
  mining: MiningSettings;
  sound: SoundSettings;
  apiKey: string;
  apiKeyLastUsed: Date | null;
  updateNotifications: (prefs: Partial<NotificationPreferences>) => void;
  updatePrivacy: (prefs: Partial<PrivacySettings>) => void;
  updateMining: (prefs: Partial<MiningSettings>) => void;
  updateSound: (prefs: Partial<SoundSettings>) => void;
  regenerateApiKey: () => void;
}

function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "sk-tbg-";
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      notifications: {
        personalBest: true,
        badgeEarned: true,
        worldCupMatch: true,
        lotteryResults: true,
        blockFoundAny: false,
        leaderboardChange: false,
        coopActivity: false,
        educationRecommendation: false,
        inApp: true,
        browserPush: false,
        emailNotifications: false,
        email: "",
      },
      privacy: {
        publicProfile: true,
        showOnLeaderboard: true,
        showCountryFlag: true,
        showInCoopRankings: true,
      },
      mining: {
        coinbaseSignature: "/TheBitcoinGame:SatoshiHunter/",
        difficultyPreference: "auto",
      },
      sound: {
        mode: "subtle",
        gameSounds: true,
        volume: 80,
      },
      apiKey: generateApiKey(),
      apiKeyLastUsed: new Date(Date.now() - 2 * 3_600_000),

      updateNotifications: (prefs) =>
        set((state) => ({
          notifications: { ...state.notifications, ...prefs },
        })),
      updatePrivacy: (prefs) =>
        set((state) => ({
          privacy: { ...state.privacy, ...prefs },
        })),
      updateMining: (prefs) =>
        set((state) => ({
          mining: { ...state.mining, ...prefs },
        })),
      updateSound: (prefs) =>
        set((state) => ({
          sound: { ...state.sound, ...prefs },
        })),
      regenerateApiKey: () =>
        set({ apiKey: generateApiKey(), apiKeyLastUsed: null }),
    }),
    { name: "tbg-settings" }
  )
);
