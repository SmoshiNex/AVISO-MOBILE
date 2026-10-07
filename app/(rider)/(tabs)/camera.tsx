import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { useCameraPermissions } from "expo-camera";
import {
    UvcCamera,
    PhoneDetectionCamera,
    CameraErrorCodes,
    type UvcCameraHandle,
    type DeviceInfo as UvcDeviceInfo,
    type CameraError as UvcCameraError,
    type RawDetection,
    type DetectionInfo,
} from "@kartik512/react-native-uvc-camera";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useTripContext } from "@/contexts/trip-context";
import { classify } from "@/lib/detection-classifier";
import { announce, stopAllSpeech } from "@/lib/voice-queue";
import { AlertGate, alertKey, type Alert } from "@/lib/alert-gate";
import { useArHeading } from "@/hooks/use-ar-heading";
import { AlertCard } from "@/components/ar/AlertCard";
import { CompassArrow } from "@/components/ar/CompassArrow";
import { SensorHud } from "@/components/SensorHud";
import { saveHazardLog, incrementTripHazards } from "@/lib/local-db";
import { api } from "@/lib/api-client";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { MODEL_CLASS_NAMES, modelClassColor, modelClassName, isRoadHazard } from "@/constants/hazards";
import { classifyRideState } from "@/lib/ride-state-classifier";
import type { DetectionResult } from "@/types";
import { styles } from "@/styles/camera.style";

type SourceMode = "native" | "otg";

const SOURCE_OPTIONS: { mode: SourceMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { mode: "otg", label: "USB Cam", icon: "hardware-chip-outline" },
    { mode: "native", label: "Phone Cam", icon: "camera-outline" },
];

// Decides when an object deserves a popup + voice (once per encounter).
const alertGate = new AlertGate();
const ALERT_CARD_MS = 4000;
// Sign/light popups follow their object: shown at least this long, at most
// this long, and closed this long after the object leaves the video.
const FOLLOW_MIN_MS = 2500;
const FOLLOW_MAX_MS = 8000;
const FOLLOW_LOST_CLOSE_MS = 700;

type BBox = DetectionResult["bbox"];
type TrackedAlert = { key: string; bbox: BBox; lastSeenAt: number; shownAt: number };

const centerDistance = (a: BBox, b: BBox) =>
    Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));
const LOG_COOLDOWN_MS = 8000;
const lastLoggedAt: Record<string, number> = {};

type DetectorStats = { fps: number; ms: number; delegate: string };

export default function CameraScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [sourceMode, setSourceMode] = useState<SourceMode>("otg");
    const uvcCameraRef = useRef<UvcCameraHandle>(null);
    const [uvcDevice, setUvcDevice] = useState<UvcDeviceInfo | null>(null);
    const [uvcDisconnected, setUvcDisconnected] = useState(false);
    const [detections, setDetections] = useState<DetectionResult[]>([]);
    const [activeAlert, setActiveAlert] = useState<{ alert: Alert; id: number } | null>(null);
    // Latest box of the object a sign/light popup is attached to (null = out of view).
    const [trackedBbox, setTrackedBbox] = useState<BBox | null | undefined>(undefined);
    const trackRef = useRef<TrackedAlert | null>(null);
    const [arrowEnabled, setArrowEnabled] = useState(true);
    const [accelMag, setAccelMag] = useState(0);
    const [gyroMag, setGyroMag] = useState(0);
    const rideState = useMemo(
        () => classifyRideState(accelMag, gyroMag),
        [accelMag, gyroMag],
    );
    const { trip, isActive, startTrip, endTrip } = useTripContext();
    const insets = useSafeAreaInsets();
    // World-locked arrow direction + rider GPS, live for the whole ride.
    const { angleRef, angle, visibility, positionRef, compassRef } = useArHeading(isActive);
    const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const detectionClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const riderCodeRef = useRef<string>("");
    const primary = useThemeColor({}, "primary");
    const isFocused = useIsFocused();
    // The on-device model only runs while this tab is open and a ride is live.
    const detectionEnabled = isFocused && isActive;
    const [detectorStats, setDetectorStats] = useState<DetectorStats | null>(null);
    const statsRef = useRef({ frames: 0, since: 0 });
    // How many of each object are in view right now, most frequent first.
    const objectCounts = useMemo(() => {
        const counts = new Map<string, { label: string; color: string; count: number }>();
        for (const d of detections) {
            const label = modelClassName(d.classIndex);
            const entry = counts.get(label);
            if (entry) entry.count += 1;
            else counts.set(label, { label, color: modelClassColor(d.classIndex), count: 1 });
        }
        return [...counts.values()].sort((a, b) => b.count - a.count);
    }, [detections]);

    const handleDetections = useCallback(
        async (results: DetectionResult[]) => {
            if (!isActive) {
                setDetections([]);
                return;
            }

            // Popup + voice: at most one alert, and only for objects that are
            // new — not on every frame the object stays in view.
            const now = Date.now();
            const alert = alertGate.process(results, now, positionRef.current);
            if (alert) {
                setActiveAlert({ alert, id: now });
                if (alertTimer.current) clearTimeout(alertTimer.current);
                if (alert.kind === "road") {
                    // Road hazards: fixed informational card.
                    trackRef.current = null;
                    setTrackedBbox(undefined);
                    alertTimer.current = setTimeout(() => setActiveAlert(null), ALERT_CARD_MS);
                } else {
                    // Signs/lights: the card follows the object (capped in time).
                    trackRef.current = {
                        key: alert.key,
                        bbox: alert.detection.bbox,
                        lastSeenAt: now,
                        shownAt: now,
                    };
                    setTrackedBbox(alert.detection.bbox);
                    alertTimer.current = setTimeout(() => {
                        trackRef.current = null;
                        setActiveAlert(null);
                    }, FOLLOW_MAX_MS);
                }
                if (alert.voice) announce(alert.voice, alert.priority);
            } else if (trackRef.current) {
                const track = trackRef.current;
                let best: DetectionResult | null = null;
                for (const d of results) {
                    if (alertKey(d) !== track.key) continue;
                    if (!best || centerDistance(d.bbox, track.bbox) < centerDistance(best.bbox, track.bbox)) best = d;
                }
                if (best) {
                    track.bbox = best.bbox;
                    track.lastSeenAt = now;
                    setTrackedBbox(best.bbox);
                } else if (
                    now - track.lastSeenAt >= FOLLOW_LOST_CLOSE_MS &&
                    now - track.shownAt >= FOLLOW_MIN_MS
                ) {
                    trackRef.current = null;
                    if (alertTimer.current) clearTimeout(alertTimer.current);
                    setActiveAlert(null);
                } else {
                    setTrackedBbox(null);
                }
            }

            if (results.length > 0) {
                if (detectionClearTimerRef.current) {
                    clearTimeout(detectionClearTimerRef.current);
                    detectionClearTimerRef.current = null;
                }
                setDetections(results);
            } else {
                // One pending clear at a time, or boxes flicker at real frame rates.
                if (!detectionClearTimerRef.current) {
                    detectionClearTimerRef.current = setTimeout(() => {
                        detectionClearTimerRef.current = null;
                        setDetections([]);
                    }, 1500);
                }
                return;
            }

            for (const result of results) {
                if (result.confidence < 0.6) continue;

                // Lights and signs only warn the rider below; only road
                // hazards are recorded.
                const now = Date.now();
                if (
                    isRoadHazard(result.type) &&
                    (!lastLoggedAt[result.type] ||
                        now - lastLoggedAt[result.type] > LOG_COOLDOWN_MS)
                ) {
                    lastLoggedAt[result.type] = now;

                    try {
                        const location =
                            await Location.getLastKnownPositionAsync();
                        if (location) {
                            const { latitude, longitude } = location.coords;
                            const detected_at = new Date().toISOString();

                            // Online-first: POST to backend immediately when connected.
                            // Falls back to SQLite queue (synced=false) when offline or backend unreachable.
                            const networkState =
                                await Network.getNetworkStateAsync();
                            const isOnline =
                                networkState.isConnected === true &&
                                networkState.isInternetReachable !== false;

                            let synced = false;
                            let remoteId: number | undefined;
                            // The server resolves the real barangay from the
                            // GPS point; until then the area stays unknown.
                            let area: string | undefined;

                            if (isOnline) {
                                try {
                                    const response = (await api.post(
                                        "/rider/hazard-logs",
                                        {
                                            type: result.type,
                                            latitude,
                                            longitude,
                                            confidence: result.confidence,
                                            distance: result.distance ?? null,
                                            rider_code: riderCodeRef.current,
                                            detected_at,
                                        },
                                    )) as any;
                                    remoteId = response?.data?.id ?? undefined;
                                    area = response?.data?.area ?? undefined;
                                    synced = !!remoteId;
                                } catch {
                                    // Backend unreachable — save to offline queue, batch sync retries
                                }
                            }

                            await saveHazardLog({
                                remote_id: remoteId,
                                trip_id: trip?.id,
                                type: result.type,
                                confidence: result.confidence,
                                distance: result.distance,
                                latitude,
                                longitude,
                                area,
                                detected_at,
                                synced,
                            });
                            if (trip?.id) await incrementTripHazards(trip.id);
                        }
                    } catch {
                        // Location unavailable — skip logging
                    }
                }
            }
        },
        [trip, isActive, positionRef],
    );

    useEffect(() => {
        SecureStore.getItemAsync("rider_code").then((v) => {
            if (v) riderCodeRef.current = v;
        });
    }, []);

    useEffect(() => {
        if (!isActive) {
            if (detectionClearTimerRef.current)
                clearTimeout(detectionClearTimerRef.current);
            setDetections([]);
            setActiveAlert(null);
            trackRef.current = null;
            if (alertTimer.current) clearTimeout(alertTimer.current);
            alertGate.reset();
            stopAllSpeech();
        }
    }, [isActive]);

    const handleDetectionsRef = useRef(handleDetections);
    handleDetectionsRef.current = handleDetections;

    const handleCameraDetections = useCallback(
        (raw: RawDetection[], info: DetectionInfo) => {
            const results = raw
                .map((r) => classify(r.classIndex, r.confidence, { x: r.x, y: r.y, w: r.w, h: r.h }))
                .filter((r): r is DetectionResult => r !== null);
            handleDetectionsRef.current(results);

            // Frames checked per second, refreshed once a second.
            const stats = statsRef.current;
            const now = Date.now();
            if (!stats.since) stats.since = now;
            stats.frames += 1;
            const elapsed = now - stats.since;
            if (elapsed >= 1000) {
                setDetectorStats({
                    fps: (stats.frames * 1000) / elapsed,
                    ms: info.inferenceMs,
                    delegate: info.delegate,
                });
                stats.frames = 0;
                stats.since = now;
            }
        },
        [],
    );

    // Start the speed reading fresh when detection stops or the camera changes.
    useEffect(() => {
        statsRef.current = { frames: 0, since: 0 };
        setDetectorStats(null);
    }, [detectionEnabled, sourceMode]);

    useFocusEffect(
        useCallback(() => {
            return () => {
                if (detectionClearTimerRef.current) {
                    clearTimeout(detectionClearTimerRef.current);
                    detectionClearTimerRef.current = null;
                }
                stopAllSpeech();
                setDetections([]);
                setActiveAlert(null);
                trackRef.current = null;
                if (alertTimer.current) clearTimeout(alertTimer.current);
                alertGate.reset();
            };
        }, []),
    );

    useFocusEffect(
        useCallback(() => {
            Accelerometer.setUpdateInterval(200);
            Gyroscope.setUpdateInterval(200);
            const accelSub = Accelerometer.addListener(({ x, y, z }) =>
                setAccelMag(
                    parseFloat(Math.sqrt(x * x + y * y + z * z).toFixed(2)),
                ),
            );
            const gyroSub = Gyroscope.addListener(({ x, y, z }) =>
                setGyroMag(
                    parseFloat(Math.sqrt(x * x + y * y + z * z).toFixed(2)),
                ),
            );
            return () => {
                accelSub.remove();
                gyroSub.remove();
            };
        }, []),
    );

    const handleStartRide = useCallback(async () => {
        Toast.show({ type: "info", text1: "Starting ride..." });
        try {
            await startTrip();
            Toast.show({ type: "success", text1: "Ride started — stay safe!" });
        } catch (err: any) {
            Toast.show({
                type: "error",
                text1:
                    err?.message ??
                    "Could not start ride. Check your connection.",
            });
        }
    }, [startTrip]);

    const handleUvcCameraReady = useCallback((device: UvcDeviceInfo) => {
        setUvcDevice(device);
        setUvcDisconnected(false);
    }, []);

    const handleCameraError = useCallback((cameraError: UvcCameraError) => {
        // Expected while the rig isn't plugged in yet — not a real error to surface.
        if (cameraError.code === CameraErrorCodes.NO_DEVICE_FOUND) return;
        Toast.show({
            type: "error",
            text1: "Camera Error",
            text2: cameraError.message,
        });
    }, []);

    const handleUvcDeviceDisconnected = useCallback(() => {
        setUvcDevice(null);
        setUvcDisconnected(true);
    }, []);

    const handleEndRide = useCallback(async () => {
        Toast.show({ type: "info", text1: "Ending ride..." });
        try {
            await endTrip();
            Toast.show({ type: "success", text1: "Ride ended and saved!" });
        } catch {
            Toast.show({ type: "error", text1: "Could not end ride." });
        }
    }, [endTrip]);

    if (!permission) return <View style={styles.container} />;

    if (!permission.granted) {
        return (
            <SafeAreaView style={styles.permissionContainer} edges={["top"]}>
                <Ionicons name="camera-outline" size={64} color="#9CA3AF" />
                <Text style={styles.permissionTitle}>
                    Camera Access Required
                </Text>
                <Text style={styles.permissionText}>
                    AVISO needs camera access to detect road hazards in real
                    time.
                </Text>
                <TouchableOpacity
                    style={[styles.permissionBtn, { backgroundColor: primary }]}
                    onPress={requestPermission}
                >
                    <Text style={styles.permissionBtnText}>
                        Grant Permission
                    </Text>
                </TouchableOpacity>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            {sourceMode === "native" ? (
                // Mounted only while this tab is open, so the camera turns off on other tabs.
                isFocused && (
                    <PhoneDetectionCamera
                        style={StyleSheet.absoluteFill}
                        detectionEnabled={detectionEnabled}
                        classNames={MODEL_CLASS_NAMES}
                        onDetections={handleCameraDetections}
                        onCameraError={handleCameraError}
                    />
                )
            ) : (
                <>
                    <UvcCamera
                        ref={uvcCameraRef}
                        style={StyleSheet.absoluteFill}
                        detectionEnabled={detectionEnabled}
                        classNames={MODEL_CLASS_NAMES}
                        onDetections={handleCameraDetections}
                        onCameraReady={handleUvcCameraReady}
                        onCameraError={handleCameraError}
                        onDeviceDisconnected={handleUvcDeviceDisconnected}
                    />
                    {!uvcDevice && (
                        <View
                            style={[
                                StyleSheet.absoluteFill,
                                styles.otgPlaceholder,
                            ]}
                        >
                            <Ionicons
                                name="hardware-chip-outline"
                                size={64}
                                color="#9CA3AF"
                            />
                            <Text style={styles.otgText}>
                                {uvcDisconnected
                                    ? "USB camera disconnected"
                                    : "Connect the hazard-detection camera via USB OTG"}
                            </Text>
                            <Text style={styles.otgSubtext}>
                                Plug in the USB webcam — the live feed will
                                appear automatically
                            </Text>
                        </View>
                    )}
                </>
            )}

            {/* Boxes are drawn natively over the video, like YOLOv8 results.plot() (YoloAnnotator.kt). */}

            {isActive && arrowEnabled && (
                <CompassArrow
                    angle={angle}
                    visibility={visibility}
                    angleRef={angleRef}
                    compassRef={compassRef}
                />
            )}

            <SensorHud
                phoneG={accelMag}
                phoneGyro={gyroMag}
                phoneState={rideState}
            />

            {activeAlert && (
                <AlertCard
                    key={activeAlert.id}
                    alert={activeAlert.alert}
                    top={insets.top + 56}
                    trackedBbox={activeAlert.alert.kind === "road" ? undefined : trackedBbox}
                />
            )}

            {(objectCounts.length > 0 || detectorStats) && (
                <View style={styles.detectorPanel} pointerEvents="none">
                    {objectCounts.length > 0 && (
                        <View style={styles.objectCountRow}>
                            {objectCounts.map((o) => (
                                <View key={o.label} style={styles.objectCountPill}>
                                    <View style={[styles.objectCountDot, { backgroundColor: o.color }]} />
                                    <Text style={styles.objectCountText} numberOfLines={1}>
                                        {`${o.label} ${o.count}`}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    )}
                    {detectorStats && (
                        <View style={styles.detectorChip}>
                            <Text style={styles.detectorChipText}>
                                {`${detectorStats.fps.toFixed(1)} FPS · ${Math.round(detectorStats.ms)} ms · ${detectorStats.delegate}`}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {isActive && (
                <View style={styles.sessionBar} pointerEvents="box-none">
                    <View style={styles.sessionDot} />
                    <Text style={styles.sessionText}>Ride Live</Text>
                    <TouchableOpacity
                        style={[
                            styles.arrowToggleBtn,
                            arrowEnabled && styles.arrowToggleBtnActive,
                        ]}
                        onPress={() => setArrowEnabled((v) => !v)}
                        accessibilityLabel="Toggle direction arrow"
                    >
                        <Ionicons name="navigate" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.endRideBtn}
                        onPress={handleEndRide}
                    >
                        <Ionicons
                            name="stop-circle-outline"
                            size={16}
                            color="#fff"
                        />
                        <Text style={styles.endRideBtnText}>End Ride</Text>
                    </TouchableOpacity>
                </View>
            )}

            {!isActive && (
                <View style={styles.startRideOverlay}>
                    <View style={styles.startRideCard}>
                        <Ionicons
                            name="bicycle"
                            size={32}
                            color={primary}
                            style={{ marginBottom: 8 }}
                        />
                        <Text style={styles.startRideTitle}>
                            Ready to ride?
                        </Text>
                        <Text style={styles.startRideSubtitle}>
                            Start a ride to log detections and track your route
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.startRideBtn,
                                { backgroundColor: primary },
                            ]}
                            onPress={handleStartRide}
                        >
                            <Text style={styles.startRideBtnText}>
                                Start Ride
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Last, so it stays tappable above the "Ready to ride?" overlay */}
            <SafeAreaView
                style={styles.topOverlay}
                edges={["top"]}
                pointerEvents="box-none"
            >
                <View style={styles.sourceToggle}>
                    {SOURCE_OPTIONS.map((option) => {
                        const selected = sourceMode === option.mode;
                        return (
                            <TouchableOpacity
                                key={option.mode}
                                style={[styles.toggleBtn, selected && styles.toggleBtnActive]}
                                onPress={() => setSourceMode(option.mode)}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                accessibilityLabel={`Use ${option.label}`}
                            >
                                <Ionicons
                                    name={option.icon}
                                    size={14}
                                    color={selected ? "#fff" : "#9CA3AF"}
                                />
                                <Text style={[styles.toggleText, selected && styles.toggleTextActive]}>
                                    {option.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </SafeAreaView>
        </View>
    );
}

