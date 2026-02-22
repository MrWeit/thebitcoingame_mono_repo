import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  user: {
    address: string;
    displayName: string;
    countryCode: string;
    level: number;
    levelTitle: string;
    xp: number;
    xpToNext: number;
    streak: number;
    workersOnline: number;
    workersTotal: number;
  } | null;
  login: (address: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: true, // Default true for development
  user: {
    address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    displayName: "SatoshiHunter",
    countryCode: "PT",
    level: 7,
    levelTitle: "Solo Miner",
    xp: 2340,
    xpToNext: 5000,
    streak: 12,
    workersOnline: 3,
    workersTotal: 3,
  },
  login: (address: string) =>
    set({
      isAuthenticated: true,
      user: {
        address,
        displayName: "SatoshiHunter",
        countryCode: "PT",
        level: 7,
        levelTitle: "Solo Miner",
        xp: 2340,
        xpToNext: 5000,
        streak: 12,
        workersOnline: 3,
        workersTotal: 3,
      },
    }),
  logout: () => set({ isAuthenticated: false, user: null }),
}));
