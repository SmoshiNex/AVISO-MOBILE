import { useRef, useState, useCallback, useEffect } from "react";
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { Accelerometer, Gyroscope } from "expo-sensors";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useTrip } from "@/hooks/use-trip";
import { DemoDetectionSource } from "@/lib/demo-detection-source";
import { announceDetection, stopAllSpeech } from "@/lib/voice-queue";
import { saveHazardLog, incrementTripHazards } from "@/lib/local-db";
import { api } from "@/lib/api-client";
import * as Network from "expo-network";
import * as SecureStore from "expo-secure-store";
import { resolveArea } from "@/lib/area-resolver";
import { HAZARD_COLORS, HAZARD_WARNINGS } from "@/constants/hazards";
import {
    CRASH_G_THRESHOLD,
    CRASH_ANGULAR_THRESHOLD,
} from "@/constants/detections";
import type { DetectionResult } from "@/types";
import roadSigns from "@/assets/data/road_sign_instructions.json";
import { styles } from "@/styles/camera.style";

type SourceMode = "native" | "otg";

const detectionSource = new DemoDetectionSource(3500);
const LOG_COOLDOWN_MS = 8000;
const lastLoggedAt: Record<string, number> = {};

export default function CameraScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [sourceMode, setSourceMode] = useState<SourceMode>("native");
    const [detections, setDetections] = useState<DetectionResult[]>([]);
    const [warningText, setWarningText] = useState<string | null>(null);
    const [accelMag, setAccelMag] = useState(0);
    const [gyroMag, setGyroMag] = useState(0);
    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const { trip, isActive, startTrip, endTrip } = useTrip();
    const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const detectionClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
        null,
    );
    const riderCodeRef = useRef<string>("");
    const primary = useThemeColor({}, "primary");

    const handleDetections = useCallback(
        async (results: DetectionResult[]) => {
            if (!isActive) {
                setDetections([]);
                return;
            }

            if (results.length > 0) {
                if (detectionClearTimerRef.current)
                    clearTimeout(detectionClearTimerRef.current);
                setDetections(results);
            } else {
                detectionClearTimerRef.current = setTimeout(
                    () => setDetections([]),
                    1500,
                );
                return;
            }

            for (const result of results) {
                if (result.confidence < 0.6) continue;

                const now = Date.now();
                if (
                    !lastLoggedAt[result.type] ||
                    now - lastLoggedAt[result.type] > LOG_COOLDOWN_MS
                ) {
                    lastLoggedAt[result.type] = now;

                    try {
                        const location =
                            await Location.getLastKnownPositionAsync();
                        if (location) {
                            const { latitude, longitude } = location.coords;
                            const area = resolveArea(latitude, longitude);
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
                                            area,
                                            rider_code: riderCodeRef.current,
                                            detected_at,
                                        },
                                    )) as any;
                                    remoteId = response?.data?.id ?? undefined;
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

                const signInstruction = result.signKey
                    ? (roadSigns as Record<string, { instruction: string }>)[
                          result.signKey
                      ]?.instruction
                    : undefined;
                setTimeout(
                    () => announceDetection(result, signInstruction),
                    50,
                );

                if (result.type !== "Traffic Sign") {
                    const warning = HAZARD_WARNINGS[result.type];
                    if (warning) {
                        setWarningText(warning);
                        if (warningTimer.current)
                            clearTimeout(warningTimer.current);
                        warningTimer.current = setTimeout(
                            () => setWarningText(null),
                            4000,
                        );
                    }
                }
            }
        },
        [trip, isActive],
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
            setWarningText(null);
            if (warningTimer.current) clearTimeout(warningTimer.current);
            stopAllSpeech();
        }
    }, [isActive]);

    const handleDetectionsRef = useRef(handleDetections);
    handleDetectionsRef.current = handleDetections;

    useFocusEffect(
        useCallback(() => {
            detectionSource.onDetections((r) => handleDetectionsRef.current(r));
            detectionSource.start();
            return () => {
                if (detectionClearTimerRef.current)
                    clearTimeout(detectionClearTimerRef.current);
                detectionSource.stop();
                stopAllSpeech();
                setDetections([]);
                setWarningText(null);
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

    const activeSignDetection = detections.find((d) => d.signKey);
    const signInstruction = activeSignDetection?.signKey
        ? (roadSigns as Record<string, { instruction: string }>)[
              activeSignDetection.signKey
          ]?.instruction
        : null;

    return (
        <View style={styles.container}>
            {sourceMode === "native" ? (
                <CameraView style={StyleSheet.absoluteFill} facing="back" />
            ) : (
                <View style={[StyleSheet.absoluteFill, styles.otgPlaceholder]}>
                    <Ionicons
                        name="hardware-chip-outline"
                        size={64}
                        color="#9CA3AF"
                    />
                    <Text style={styles.otgText}>
                        Connect Raspberry Pi via USB OTG
                    </Text>
                    <Text style={styles.otgSubtext}>
                        Hardware camera feed will appear here
                    </Text>
                </View>
            )}

            <View style={StyleSheet.absoluteFill} pointerEvents="none">
                {detections.map((d, i) => {
                    const left = d.bbox.x * screenWidth;
                    const top = d.bbox.y * screenHeight;
                    const width = d.bbox.w * screenWidth;
                    const height = d.bbox.h * screenHeight;
                    const boxColor = getBoxColor(d);

                    return (
                        <View
                            key={i}
                            style={[
                                styles.boundingBox,
                                {
                                    left,
                                    top,
                                    width,
                                    height,
                                    borderColor: boxColor,
                                },
                            ]}
                        >
                            <View
                                style={[
                                    styles.labelBadge,
                                    { backgroundColor: boxColor },
                                ]}
                            >
                                <Text
                                    style={styles.labelText}
                                    numberOfLines={1}
                                >
                                    {getBadgeLabel(d)}
                                </Text>
                            </View>
                        </View>
                    );
                })}
            </View>

            {signInstruction && (
                <View style={styles.signPanel} pointerEvents="none">
                    <Ionicons
                        name="information-circle"
                        size={16}
                        color="#fff"
                    />
                    <Text style={styles.signPanelText}>{signInstruction}</Text>
                </View>
            )}

            {warningText && (
                <View style={styles.warningBanner} pointerEvents="none">
                    <Ionicons name="warning" size={16} color="#fff" />
                    <Text style={styles.warningText} numberOfLines={2}>
                        {warningText}
                    </Text>
                </View>
            )}

            <SafeAreaView
                style={styles.topOverlay}
                edges={["top"]}
                pointerEvents="box-none"
            >
                <View style={styles.sourceToggle}>
                    <TouchableOpacity
                        style={[
                            styles.toggleBtn,
                            sourceMode === "native" && styles.toggleBtnActive,
                        ]}
                        onPress={() => setSourceMode("native")}
                    >
                        <Ionicons
                            name="camera-outline"
                            size={14}
                            color={sourceMode === "native" ? "#fff" : "#9CA3AF"}
                        />
                        <Text
                            style={[
                                styles.toggleText,
                                sourceMode === "native" &&
                                    styles.toggleTextActive,
                            ]}
                        >
                            Phone Cam
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            styles.toggleBtn,
                            sourceMode === "otg" && styles.toggleBtnActive,
                        ]}
                        onPress={() => setSourceMode("otg")}
                    >
                        <Ionicons
                            name="hardware-chip-outline"
                            size={14}
                            color={sourceMode === "otg" ? "#fff" : "#9CA3AF"}
                        />
                        <Text
                            style={[
                                styles.toggleText,
                                sourceMode === "otg" && styles.toggleTextActive,
                            ]}
                        >
                            OTG Hardware
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.sosBtn}
                    onPress={() => router.push("/(rider)/emergency-alert")}
                >
                    <Text style={styles.sosBtnText}>SOS</Text>
                </TouchableOpacity>
            </SafeAreaView>

            <View style={styles.sensorHud} pointerEvents="none">
                <Text style={styles.sensorLabel}>G-Force</Text>
                <Text
                    style={[
                        styles.sensorValue,
                        {
                            color:
                                accelMag >= CRASH_G_THRESHOLD
                                    ? "#EF4444"
                                    : "#22C55E",
                        },
                    ]}
                >
                    {accelMag} g
                </Text>
                <Text style={[styles.sensorLabel, { marginTop: 6 }]}>Gyro</Text>
                <Text
                    style={[
                        styles.sensorValue,
                        {
                            color:
                                gyroMag >= CRASH_ANGULAR_THRESHOLD
                                    ? "#EF4444"
                                    : "#22C55E",
                        },
                    ]}
                >
                    {gyroMag} rad/s
                </Text>
            </View>

            <View style={styles.demoBadge} pointerEvents="none">
                <Text style={styles.demoBadgeText}>DEMO MODE</Text>
            </View>

            {isActive && (
                <View style={styles.sessionBar} pointerEvents="box-none">
                    <View style={styles.sessionDot} />
                    <Text style={styles.sessionText}>Ride Live</Text>
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
        </View>
    );
}

function getBoxColor(d: DetectionResult): string {
    if (d.distance !== undefined) {
        if (d.distance < 5) return "#EF4444";
        if (d.distance < 15) return "#F59E0B";
    }
    return HAZARD_COLORS[d.type] ?? "#0274DF";
}

const SHORT_TYPE: Record<string, string> = {
    "Traffic Light Red": "TL Red",
    "Traffic Light Green": "TL Green",
    "Traffic Light Orange": "TL Orange",
    "Road Excavation": "Road Exc.",
    "Road Barrier": "Barrier",
    "Traffic Sign": "Sign",
};

function getBadgeLabel(d: DetectionResult): string {
    const label = SHORT_TYPE[d.type] ?? d.type;
    if (d.distance !== undefined) return `${label} ${d.distance}m`;
    if (d.signKey) {
        const sign = (roadSigns as Record<string, { name: string }>)[d.signKey];
        return sign?.name ?? "Sign";
    }
    return label;
}
