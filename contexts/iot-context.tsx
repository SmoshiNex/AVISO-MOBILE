import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import Toast from 'react-native-toast-message';
import { api } from '@/lib/api-client';
import {
  iotClient,
  iotTelemetryStore,
  TELEMETRY_STALE_MS,
  type IotConnectionStatus,
  type IotIncoming,
} from '@/lib/iot-client';
import { useTripContext } from '@/contexts/trip-context';
import { queueRideEvent } from '@/lib/local-db';
import { uploadRideEvent } from '@/lib/sync-service';
import type { IotDeviceInfo, IotEvent, IotHello, IotTelemetry } from '@/types';

const MANUAL_IP_KEY = 'iot_manual_ip';
const DEVICE_REFRESH_MS = 60_000;
const MAX_RECENT_EVENTS = 20;

type PairingCode = { code: string; expires_at: string };

type IotContextValue = {
  status: IotConnectionStatus;
  connected: boolean;
  /** Paired unit as known by the server (null = none paired). */
  device: IotDeviceInfo | null;
  /** Unit info received over Wi-Fi when connected. */
  hello: IotHello | null;
  /** Address used to reach the unit (manual IP wins over the server's). */
  host: string | null;
  manualIp: string | null;
  recentEvents: IotEvent[];
  /** Crash currently counting down on the phone, if any. */
  activeCrashId: string | null;
  refreshDevice: () => Promise<void>;
  setManualIp: (ip: string | null) => Promise<void>;
  requestPairingCode: () => Promise<PairingCode>;
  unpair: () => Promise<void>;
  calibrateUpright: () => boolean;
  testBuzzer: () => boolean;
  /** Rider tapped "I'm OK": stops the unit's alarm and its backup SOS. */
  cancelCrash: (id: string) => void;
  /** The phone delivered the SOS: the unit skips its backup report. */
  confirmSosSent: (id: string) => void;
};

const IotContext = createContext<IotContextValue | null>(null);

export function IotProvider({ children }: { children: ReactNode }) {
  const { isActive } = useTripContext();
  const [status, setStatus] = useState<IotConnectionStatus>(iotClient.getStatus());
  const [device, setDevice] = useState<IotDeviceInfo | null>(null);
  const [hello, setHello] = useState<IotHello | null>(null);
  const [manualIp, setManualIpState] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<IotEvent[]>([]);
  const [activeCrashId, setActiveCrashId] = useState<string | null>(null);

  // Crash ids already handed to the countdown screen (the unit re-sends until acked).
  const handledCrashIds = useRef(new Set<string>());
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const host = manualIp || device?.local_ip || null;

  const refreshDevice = useCallback(async () => {
    try {
      const res = await api.get<{ device: IotDeviceInfo | null }>('/rider/iot/device');
      setDevice(res.device);
    } catch {
      // Offline: keep the last known device.
    }
  }, []);

  // Server device info (gives the unit's hotspot IP) + saved manual IP.
  useEffect(() => {
    SecureStore.getItemAsync(MANUAL_IP_KEY).then((ip) => setManualIpState(ip || null));
    refreshDevice();
  }, [refreshDevice]);

  // While not connected, re-check the server now and then: the unit reports
  // a new IP whenever it joins a hotspot.
  useEffect(() => {
    if (status === 'connected') return;
    const timer = setInterval(refreshDevice, DEVICE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [status, refreshDevice]);

  // Connect to whatever address we have.
  useEffect(() => {
    if (host) iotClient.start(host);
    else iotClient.stop();
  }, [host]);

  useEffect(() => iotClient.onStatus((s) => {
    setStatus(s);
    if (s !== 'connected') iotTelemetryStore.clear();
    // Tell the unit whether a ride is active (enables its no-hit tip-over rule).
    if (s === 'connected') iotClient.send({ t: 'ride', active: isActiveRef.current });
  }), []);

  useEffect(() => {
    iotClient.send({ t: 'ride', active: isActive });
  }, [isActive]);

  // Crash-detection log: every classification during a ride is queued on the
  // phone (survives no-signal stretches), then uploaded. sync-service retries
  // whatever could not be sent right away.
  const logEvent = useCallback(async (event: IotEvent) => {
    if (!isActiveRef.current) return;   // the log covers rides only
    try {
      const position = await Location.getLastKnownPositionAsync();
      if (!position) return;            // the unit has no GPS of its own
      const row = {
        event_uid: event.id,
        event_type: event.type,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        acceleration_peak: event.peak_g,
        vertical_g: event.vg,
        horizontal_g: event.hg,
        gyro_peak_dps: event.peak_gyro,
        tilt_deg: event.tilt,
        detected_at: new Date(event.receivedAt).toISOString(),
      };
      await queueRideEvent(row);
      await uploadRideEvent(row);
    } catch {
      // Never interrupts the ride; the queue keeps the row for the next sync.
    }
  }, []);

  useEffect(() => iotClient.onMessage((msg: IotIncoming) => {
    switch (msg.t) {
      case 'tel': {
        const { t: _t, ...data } = msg;
        iotTelemetryStore.set(data);
        break;
      }
      case 'hello': {
        const { t: _t, ...info } = msg;
        setHello(info);
        break;
      }
      case 'evt': {
        const event: IotEvent = {
          id: msg.id, type: msg.type, peak_g: msg.peak_g, vg: msg.vg ?? 0, hg: msg.hg ?? 0,
          peak_gyro: msg.peak_gyro, tilt: msg.tilt, receivedAt: Date.now(),
        };
        if (event.type === 'crash') {
          iotClient.send({ t: 'ack', id: event.id });
          if (handledCrashIds.current.has(event.id)) break;   // re-sent until acked
          handledCrashIds.current.add(event.id);
          setActiveCrashId(event.id);
          router.push({ pathname: '/(rider)/emergency-alert', params: { eventId: event.id } });
        }
        logEvent(event);
        // The 10 s normal-riding summaries would flood the recent list.
        if (event.type !== 'normal') {
          setRecentEvents((prev) => [event, ...prev].slice(0, MAX_RECENT_EVENTS));
        }
        break;
      }
      case 'crash_cleared':
        Toast.show({ type: 'info', text1: 'IoT: the motorcycle is upright again' });
        break;
      case 'calibrated':
        Toast.show({ type: 'success', text1: 'Upright position saved' });
        break;
    }
  }), [logEvent]);

  const setManualIp = useCallback(async (ip: string | null) => {
    const value = ip?.trim() || null;
    if (value) await SecureStore.setItemAsync(MANUAL_IP_KEY, value);
    else await SecureStore.deleteItemAsync(MANUAL_IP_KEY);
    setManualIpState(value);
  }, []);

  const requestPairingCode = useCallback(
    () => api.post<PairingCode>('/rider/iot/pairing-code', {}),
    [],
  );

  const unpair = useCallback(async () => {
    await api.delete('/rider/iot/device');
    iotClient.stop();
    setDevice(null);
    setHello(null);
  }, []);

  const value = useMemo<IotContextValue>(() => ({
    status,
    connected: status === 'connected',
    device,
    hello,
    host,
    manualIp,
    recentEvents,
    activeCrashId,
    refreshDevice,
    setManualIp,
    requestPairingCode,
    unpair,
    calibrateUpright: () => iotClient.send({ t: 'calibrate_upright' }),
    testBuzzer: () => iotClient.send({ t: 'beep' }),
    cancelCrash: (id: string) => {
      iotClient.send({ t: 'cancel', id });
      setActiveCrashId(null);
    },
    confirmSosSent: (id: string) => {
      iotClient.send({ t: 'sos_sent', id });
      setActiveCrashId(null);
    },
  }), [status, device, hello, host, manualIp, recentEvents, activeCrashId,
    refreshDevice, setManualIp, requestPairingCode, unpair]);

  return <IotContext.Provider value={value}>{children}</IotContext.Provider>;
}

export function useIot(): IotContextValue {
  const ctx = useContext(IotContext);
  if (!ctx) throw new Error('useIot must be used inside IotProvider');
  return ctx;
}

/** Latest live reading from the unit, or null when none arrived recently. */
export function useIotTelemetry(): IotTelemetry | null {
  const snapshot = useSyncExternalStore(iotTelemetryStore.subscribe, iotTelemetryStore.get);
  return snapshot && Date.now() - snapshot.at < TELEMETRY_STALE_MS ? snapshot.data : null;
}
