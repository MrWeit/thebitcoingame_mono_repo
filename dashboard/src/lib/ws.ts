/**
 * WebSocket client with auto-reconnect and channel multiplexing.
 *
 * Connects to the backend WebSocket endpoint using a JWT token
 * passed as a query parameter. Supports subscribing to channels
 * (mining, dashboard, gamification, competition) with typed handlers.
 */

type MessageHandler = (data: unknown) => void;

const WS_BASE = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

class WebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private subscriptions: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  /** Connect to the WebSocket server with a JWT token. */
  connect(token: string): void {
    this.token = token;
    this.reconnectAttempts = 0;
    this._connect();
  }

  private _connect(): void {
    if (!this.token) return;

    this.ws = new WebSocket(`${WS_BASE}/ws?token=${this.token}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.resubscribe();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        this.handleMessage(msg);
      } catch {
        // Ignore non-JSON messages
      }
    };

    this.ws.onclose = () => {
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  /**
   * Subscribe to a WebSocket channel and register a message handler.
   * Returns an unsubscribe function.
   */
  subscribe(channel: string, handler: MessageHandler): () => void {
    this.subscriptions.add(channel);

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
    }
    this.handlers.get(channel)!.add(handler);

    // If already connected, send subscribe immediately
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "subscribe", channel }));
    }

    // Return unsubscribe function
    return () => {
      this.handlers.get(channel)?.delete(handler);
      if (this.handlers.get(channel)?.size === 0) {
        this.handlers.delete(channel);
        this.subscriptions.delete(channel);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: "unsubscribe", channel }));
        }
      }
    };
  }

  private handleMessage(msg: {
    channel?: string;
    data?: unknown;
    type?: string;
  }): void {
    if (msg.channel && msg.data) {
      this.handlers.get(msg.channel)?.forEach((h) => h(msg.data));
    }
  }

  private resubscribe(): void {
    this.subscriptions.forEach((channel) => {
      this.ws?.send(JSON.stringify({ action: "subscribe", channel }));
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    // Exponential backoff with jitter: base * 2^attempt + random(0..1000)ms
    const delay =
      Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000) +
      Math.random() * 1000;
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  /** Disconnect and stop all reconnect attempts. */
  disconnect(): void {
    clearTimeout(this.reconnectTimer);
    this.reconnectAttempts = this.maxReconnectAttempts; // prevent reconnect
    this.ws?.close();
    this.ws = null;
    this.subscriptions.clear();
    this.handlers.clear();
  }

  /** Get connection state. */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();
