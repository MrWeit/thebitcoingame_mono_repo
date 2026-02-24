/**
 * Typed HTTP client for The Bitcoin Game API.
 *
 * Reads the JWT token from the auth store and automatically includes it
 * in all requests. Retries once on 401 with token refresh.
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

class ApiClient {
  private token: string | null = null;
  private refreshToken_: string | null = null;
  private refreshing: Promise<void> | null = null;

  setToken(token: string): void {
    this.token = token;
  }

  setRefreshToken(token: string): void {
    this.refreshToken_ = token;
  }

  clearToken(): void {
    this.token = null;
    this.refreshToken_ = null;
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...headers, ...(options?.headers as Record<string, string>) },
    });

    if (response.status === 401 && this.refreshToken_) {
      await this.refreshAccessToken();
      // Retry with new token
      const retryHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      };
      const retry = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: { ...retryHeaders, ...(options?.headers as Record<string, string>) },
      });
      if (!retry.ok) {
        const error = await retry.json().catch(() => ({ detail: "Unknown error" }));
        throw new Error(error.detail || `HTTP ${retry.status}`);
      }
      return retry.json();
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // --- Auth ---

  async challenge(btcAddress: string) {
    return this.request<{ nonce: string; message: string }>(
      "/api/v1/auth/challenge",
      { method: "POST", body: JSON.stringify({ btc_address: btcAddress }) },
    );
  }

  async verify(btcAddress: string, signature: string, nonce: string) {
    return this.request<{ access_token: string; refresh_token: string }>(
      "/api/v1/auth/verify",
      {
        method: "POST",
        body: JSON.stringify({ btc_address: btcAddress, signature, nonce }),
      },
    );
  }

  async refreshAccessToken(): Promise<void> {
    // Deduplicate concurrent refreshes
    if (this.refreshing) {
      await this.refreshing;
      return;
    }

    this.refreshing = (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: this.refreshToken_ }),
        });

        if (!response.ok) {
          this.clearToken();
          throw new Error("Token refresh failed");
        }

        const data = await response.json();
        this.token = data.access_token;
        if (data.refresh_token) {
          this.refreshToken_ = data.refresh_token;
        }
      } finally {
        this.refreshing = null;
      }
    })();

    await this.refreshing;
  }

  // --- Mining ---

  async getWorkers() {
    return this.request("/api/v1/mining/workers");
  }

  async getShares(cursor?: string, limit?: number) {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return this.request(`/api/v1/mining/shares${qs ? `?${qs}` : ""}`);
  }

  async getHashrate() {
    return this.request("/api/v1/mining/hashrate");
  }

  async getHashrateChart(window: string = "24h") {
    return this.request(`/api/v1/mining/hashrate/chart?window=${window}`);
  }

  async getPersonalBests() {
    return this.request("/api/v1/mining/difficulty/bests");
  }

  async getDifficultyScatter() {
    return this.request("/api/v1/mining/difficulty/scatter");
  }

  async getBlocks(cursor?: string) {
    return this.request(`/api/v1/mining/blocks${cursor ? `?cursor=${cursor}` : ""}`);
  }

  // --- Dashboard ---

  async getDashboardStats() {
    return this.request("/api/v1/dashboard/stats");
  }

  async getGlobalFeed(limit?: number, beforeId?: number) {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (beforeId) params.set("before_id", String(beforeId));
    const qs = params.toString();
    return this.request(`/api/v1/dashboard/feed${qs ? `?${qs}` : ""}`);
  }

  async getUpcomingEvents() {
    return this.request("/api/v1/dashboard/events");
  }

  async getRecentBadges(limit?: number) {
    return this.request(`/api/v1/dashboard/recent-badges${limit ? `?limit=${limit}` : ""}`);
  }

  // --- User ---

  async getProfile() {
    return this.request("/api/v1/users/me");
  }

  async updateProfile(data: Record<string, unknown>) {
    return this.request("/api/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
