/**
 * TanStack Query v5 hooks for The Bitcoin Game backend API.
 *
 * Provides typed React hooks wrapping the API client with appropriate
 * stale times and refetch intervals matching backend cache TTLs.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Stale times
const REALTIME = 10_000; // 10s — matches backend Redis cache TTL
const STANDARD = 60_000; // 1m
const SLOW = 300_000; // 5m

// --- Dashboard ---

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => api.getDashboardStats(),
    staleTime: REALTIME,
    refetchInterval: REALTIME,
  });
}

export function useGlobalFeed(limit?: number) {
  return useQuery({
    queryKey: ["dashboard", "feed", limit],
    queryFn: () => api.getGlobalFeed(limit),
    staleTime: REALTIME,
  });
}

export function useUpcomingEvents() {
  return useQuery({
    queryKey: ["dashboard", "events"],
    queryFn: () => api.getUpcomingEvents(),
    staleTime: STANDARD,
  });
}

export function useRecentBadges(limit?: number) {
  return useQuery({
    queryKey: ["dashboard", "recent-badges", limit],
    queryFn: () => api.getRecentBadges(limit),
    staleTime: STANDARD,
  });
}

// --- Mining ---

export function useWorkers() {
  return useQuery({
    queryKey: ["mining", "workers"],
    queryFn: () => api.getWorkers(),
    staleTime: REALTIME,
    refetchInterval: REALTIME,
  });
}

export function useShares(cursor?: string) {
  return useQuery({
    queryKey: ["mining", "shares", cursor],
    queryFn: () => api.getShares(cursor),
    staleTime: REALTIME,
  });
}

export function useHashrate() {
  return useQuery({
    queryKey: ["mining", "hashrate"],
    queryFn: () => api.getHashrate(),
    staleTime: REALTIME,
    refetchInterval: REALTIME,
  });
}

export function useHashrateChart(window: string = "24h") {
  return useQuery({
    queryKey: ["mining", "hashrate-chart", window],
    queryFn: () => api.getHashrateChart(window),
    staleTime: SLOW,
  });
}

export function usePersonalBests() {
  return useQuery({
    queryKey: ["mining", "personal-bests"],
    queryFn: () => api.getPersonalBests(),
    staleTime: STANDARD,
  });
}

export function useDifficultyScatter() {
  return useQuery({
    queryKey: ["mining", "difficulty-scatter"],
    queryFn: () => api.getDifficultyScatter(),
    staleTime: STANDARD,
  });
}

export function useBlocks(cursor?: string) {
  return useQuery({
    queryKey: ["mining", "blocks", cursor],
    queryFn: () => api.getBlocks(cursor),
    staleTime: STANDARD,
  });
}

// --- User ---

export function useProfile() {
  return useQuery({
    queryKey: ["user", "profile"],
    queryFn: () => api.getProfile(),
    staleTime: SLOW,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.updateProfile(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["user", "profile"] }),
  });
}
