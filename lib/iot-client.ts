import type { IotEvent, IotHello, IotTelemetry } from '@/types';

/**
 * Wi-Fi link to the AVISO IoT unit (ESP32 + BNO055).
 *
 * The unit joins the rider's phone hotspot and runs a WebSocket server on
 * port 81. React Native's built-in WebSocket is enough — no native module.
 * The connection reconnects by itself with backoff, and a silent socket
 * (telemetry arrives 10×/s) is treated as dead after a few seconds.
 */

export const IOT_WS_PORT = 81;
const LIVENESS_TIMEOUT_MS = 4000;
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];

export type IotConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

export type IotIncoming =
  | ({ t: 'tel' } & IotTelemetry)
  | ({ t: 'hello' } & IotHello)
  | { t: 'evt'; id: string; type: IotEvent['type']; peak_g: number; vg: number; hg: number; peak_gyro: number; tilt: number }
  | { t: 'crash_cleared'; id: string }
  | { t: 'calibrated' };

export type IotOutgoing =
  | { t: 'ack'; id: string }
  | { t: 'cancel'; id: string }
  | { t: 'sos_sent'; id: string }
  | { t: 'ride'; active: boolean }
  | { t: 'calibrate_upright' }
  | { t: 'beep' };

type Listener<T> = (value: T) => void;

export class IotClient {
  private ws: WebSocket | null = null;
  private host: string | null = null;
  private status: IotConnectionStatus = 'idle';
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private livenessTimer: ReturnType<typeof setTimeout> | null = null;
  private statusListeners = new Set<Listener<IotConnectionStatus>>();
  private messageListeners = new Set<Listener<IotIncoming>>();

  getStatus(): IotConnectionStatus {
    return this.status;
  }

  getHost(): string | null {
    return this.host;
  }

  /** Connect to `host` (IP on the hotspot). Reconnects automatically until stop(). */
  start(host: string): void {
    if (this.host === host && (this.status === 'connected' || this.status === 'connecting')) return;
    this.stop();
    this.host = host;
    this.attempt = 0;
    this.open();
  }

  stop(): void {
    this.host = null;
    this.clearTimers();
    if (this.ws) {
      this.ws.onopen = this.ws.onclose = this.ws.onerror = this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('idle');
  }

  /** Returns false if the unit is not connected. */
  send(message: IotOutgoing): boolean {
    if (!this.ws || this.status !== 'connected') return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  onStatus(listener: Listener<IotConnectionStatus>): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onMessage(listener: Listener<IotIncoming>): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private open(): void {
    if (!this.host) return;
    this.setStatus('connecting');
    const ws = new WebSocket(`ws://${this.host}:${IOT_WS_PORT}`);
    this.ws = ws;
    // Also bounds the connect attempt itself: to an unreachable unit it can
    // hang far longer than the OS would take to report a refusal.
    this.armLiveness();

    ws.onopen = () => {
      this.attempt = 0;
      this.setStatus('connected');
      this.armLiveness();
    };
    ws.onmessage = (e) => {
      this.armLiveness();
      let msg: IotIncoming;
      try {
        msg = JSON.parse(String(e.data)) as IotIncoming;
      } catch {
        return;
      }
      this.messageListeners.forEach((l) => l(msg));
    };
    ws.onerror = () => {
      // onclose follows; reconnection is handled there.
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.clearTimers();
    if (!this.host) return;
    this.setStatus('disconnected');
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)];
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private armLiveness(): void {
    if (this.livenessTimer) clearTimeout(this.livenessTimer);
    this.livenessTimer = setTimeout(() => {
      // No data for a while (or no answer to the connect): the hotspot
      // dropped or the unit lost power.
      const ws = this.ws;
      this.ws = null;
      if (ws) {
        ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
        ws.close();
      }
      this.scheduleReconnect();
    }, LIVENESS_TIMEOUT_MS);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.livenessTimer) clearTimeout(this.livenessTimer);
    this.reconnectTimer = null;
    this.livenessTimer = null;
  }

  private setStatus(status: IotConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((l) => l(status));
  }
}

/** The single app-wide connection. */
export const iotClient = new IotClient();

// ─── Live telemetry store (read with useSyncExternalStore) ──────────────────
// Kept outside React state so 10 updates/s only re-render components that
// actually show live values.

type TelemetrySnapshot = { data: IotTelemetry; at: number } | null;

let telemetry: TelemetrySnapshot = null;
const telemetryListeners = new Set<() => void>();

/** A reading older than this is considered stale (unit disconnected). */
export const TELEMETRY_STALE_MS = 1500;

export const iotTelemetryStore = {
  set(data: IotTelemetry): void {
    telemetry = { data, at: Date.now() };
    telemetryListeners.forEach((l) => l());
  },
  clear(): void {
    telemetry = null;
    telemetryListeners.forEach((l) => l());
  },
  get(): TelemetrySnapshot {
    return telemetry;
  },
  /** Latest reading if it is fresh, else null. For non-React callers. */
  getFresh(): IotTelemetry | null {
    return telemetry && Date.now() - telemetry.at < TELEMETRY_STALE_MS ? telemetry.data : null;
  },
  subscribe(listener: () => void): () => void {
    telemetryListeners.add(listener);
    return () => telemetryListeners.delete(listener);
  },
};
