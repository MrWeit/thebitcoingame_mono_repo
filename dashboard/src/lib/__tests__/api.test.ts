/**
 * API client unit tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create a fresh ApiClient for each test
const createClient = async () => {
  // Dynamic import to get fresh module
  const mod = await import("../api");
  return mod.api;
};

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("ApiClient", () => {
  let api: Awaited<ReturnType<typeof createClient>>;

  beforeEach(async () => {
    api = await createClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    api.clearToken();
  });

  it("should include auth header when token is set", async () => {
    api.setToken("my-jwt-token");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: "test" }),
    });

    await api.getDashboardStats();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer my-jwt-token");
  });

  it("should not include auth header when no token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: "test" }),
    });

    await api.getDashboardStats();

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBeUndefined();
  });

  it("should throw on non-401 errors", async () => {
    api.setToken("my-token");

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Internal Server Error" }),
    });

    await expect(api.getDashboardStats()).rejects.toThrow("Internal Server Error");
  });

  it("should retry on 401 with token refresh", async () => {
    api.setToken("old-token");
    api.setRefreshToken("refresh-token");

    // First call returns 401
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Token expired" }),
    });

    // Refresh call succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "new-token", refresh_token: "new-refresh" }),
    });

    // Retry succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ hashrate: 100 }),
    });

    const result = await api.getDashboardStats();
    expect(result).toEqual({ hashrate: 100 });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("should call correct endpoint for dashboard stats", async () => {
    api.setToken("token");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await api.getDashboardStats();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/dashboard/stats");
  });

  it("should call correct endpoint for global feed with params", async () => {
    api.setToken("token");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ([]),
    });

    await api.getGlobalFeed(10, 42);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/dashboard/feed");
    expect(url).toContain("limit=10");
    expect(url).toContain("before_id=42");
  });

  it("should call correct endpoint for workers", async () => {
    api.setToken("token");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await api.getWorkers();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/mining/workers");
  });

  it("should handle challenge endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ nonce: "abc123", message: "Sign this" }),
    });

    const result = await api.challenge("bc1q...");
    expect(result.nonce).toBe("abc123");
  });

  it("should handle profile update", async () => {
    api.setToken("token");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 1, displayName: "New Name" }),
    });

    const result = await api.updateProfile({ display_name: "New Name" });
    expect(result).toHaveProperty("displayName");

    const [, options] = mockFetch.mock.calls[0];
    expect(options.method).toBe("PATCH");
  });
});
