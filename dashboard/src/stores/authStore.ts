import { create } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/ws";

interface AuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
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
  login: (address: string, accessToken?: string, refreshToken?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: true, // Default true for development
  accessToken: null,
  refreshToken: null,
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
  login: (address: string, accessToken?: string, refreshToken?: string) => {
    // Initialize API client with tokens
    if (accessToken) {
      api.setToken(accessToken);
      wsClient.connect(accessToken);
    }
    if (refreshToken) {
      api.setRefreshToken(refreshToken);
    }

    set({
      isAuthenticated: true,
      accessToken: accessToken ?? null,
      refreshToken: refreshToken ?? null,
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
    });
  },
  logout: () => {
    api.clearToken();
    wsClient.disconnect();
    set({
      isAuthenticated: false,
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  },
}));
