import { create } from "zustand";

export interface UserProfile {
  displayName: string;
  countryCode: string;
  xp: number;
  level: number;
  levelTitle: string;
  xpToNext: number;
  mode: "full" | "simple";
  isFirstVisit: boolean;
  onboardingComplete: boolean;
  streakWeeks: number;
  longestStreak: number;
  streakStartDate: string;
  completedLessons: string[];
  completedTracks: string[];
}

interface UserState {
  profile: UserProfile;
  setDisplayName: (name: string) => void;
  setCountryCode: (code: string) => void;
  addXP: (amount: number) => void;
  setMode: (mode: "full" | "simple") => void;
  completeOnboarding: () => void;
  completeLesson: (lessonId: string) => void;
  completeTrack: (trackId: string) => void;
}

const LEVEL_THRESHOLDS = [
  { level: 1, title: "Nocoiner", xpRequired: 0, cumulative: 0 },
  { level: 2, title: "Curious Cat", xpRequired: 100, cumulative: 100 },
  { level: 3, title: "Hash Pupil", xpRequired: 500, cumulative: 600 },
  { level: 4, title: "Solo Miner", xpRequired: 1000, cumulative: 1600 },
  { level: 5, title: "Difficulty Hunter", xpRequired: 2500, cumulative: 4100 },
  { level: 6, title: "Share Collector", xpRequired: 3000, cumulative: 7100 },
  { level: 7, title: "Hash Veteran", xpRequired: 3500, cumulative: 10600 },
  { level: 8, title: "Block Chaser", xpRequired: 4000, cumulative: 14600 },
  { level: 9, title: "Nonce Grinder", xpRequired: 5000, cumulative: 19600 },
  { level: 10, title: "Hashrate Warrior", xpRequired: 10000, cumulative: 29600 },
  { level: 15, title: "Diff Hunter", xpRequired: 25000, cumulative: 79600 },
  { level: 20, title: "Mining Veteran", xpRequired: 50000, cumulative: 179600 },
  { level: 25, title: "Satoshi's Apprentice", xpRequired: 100000, cumulative: 429600 },
  { level: 30, title: "Cypherpunk", xpRequired: 250000, cumulative: 929600 },
  { level: 50, title: "Timechain Guardian", xpRequired: 1000000, cumulative: 4929600 },
];

export function getLevelInfo(xp: number) {
  let currentLevel = LEVEL_THRESHOLDS[0];
  let nextLevel = LEVEL_THRESHOLDS[1];

  for (let i = 0; i < LEVEL_THRESHOLDS.length - 1; i++) {
    if (xp >= LEVEL_THRESHOLDS[i].cumulative) {
      currentLevel = LEVEL_THRESHOLDS[i];
      nextLevel = LEVEL_THRESHOLDS[i + 1];
    }
  }

  const xpIntoLevel = xp - currentLevel.cumulative;
  const xpForLevel = nextLevel.cumulative - currentLevel.cumulative;

  return {
    level: currentLevel.level,
    title: currentLevel.title,
    xpIntoLevel,
    xpForLevel,
    nextLevel: nextLevel.level,
    nextTitle: nextLevel.title,
  };
}

export { LEVEL_THRESHOLDS };

export const useUserStore = create<UserState>((set) => ({
  profile: {
    displayName: "SatoshiHunter",
    countryCode: "PT",
    xp: 2340,
    level: 7,
    levelTitle: "Hash Veteran",
    xpToNext: 5000,
    mode: "full",
    isFirstVisit: false,
    onboardingComplete: true,
    streakWeeks: 12,
    longestStreak: 12,
    streakStartDate: "2025-11-18",
    completedLessons: ["1-1", "1-2", "1-3", "1-4", "2-1"],
    completedTracks: ["1"],
  },
  setDisplayName: (name) =>
    set((state) => ({ profile: { ...state.profile, displayName: name } })),
  setCountryCode: (code) =>
    set((state) => ({ profile: { ...state.profile, countryCode: code } })),
  addXP: (amount) =>
    set((state) => {
      const newXP = state.profile.xp + amount;
      const info = getLevelInfo(newXP);
      return {
        profile: {
          ...state.profile,
          xp: newXP,
          level: info.level,
          levelTitle: info.title,
          xpToNext: info.xpForLevel,
        },
      };
    }),
  setMode: (mode) =>
    set((state) => ({ profile: { ...state.profile, mode } })),
  completeOnboarding: () =>
    set((state) => ({
      profile: { ...state.profile, onboardingComplete: true, isFirstVisit: false },
    })),
  completeLesson: (lessonId) =>
    set((state) => ({
      profile: {
        ...state.profile,
        completedLessons: state.profile.completedLessons.includes(lessonId)
          ? state.profile.completedLessons
          : [...state.profile.completedLessons, lessonId],
      },
    })),
  completeTrack: (trackId) =>
    set((state) => ({
      profile: {
        ...state.profile,
        completedTracks: state.profile.completedTracks.includes(trackId)
          ? state.profile.completedTracks
          : [...state.profile.completedTracks, trackId],
      },
    })),
}));
