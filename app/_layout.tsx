import "../global.css";
import { useEffect, useState } from "react";
import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Toast from "react-native-toast-message";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import * as SecureStore from "expo-secure-store";
import {
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { initDb } from "@/lib/local-db";
import { startSyncInterval, pullFromBackend } from "@/lib/sync-service";
import { OfflineBanner } from "@/components/OfflineBanner";
import { UpdateBanner } from "@/components/UpdateBanner";
import { useAppUpdates } from "@/hooks/use-app-updates";
import { useRideActive } from "@/lib/ride-state";
import { ThemePreferenceProvider } from "@/contexts/theme-context";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const [fontsLoaded] = useFonts({
        JetBrainsMono_400Regular,
        JetBrainsMono_500Medium,
        JetBrainsMono_600SemiBold,
        JetBrainsMono_700Bold,
    });

    useEffect(() => {
        if (fontsLoaded) SplashScreen.hideAsync();
    }, [fontsLoaded]);

    useEffect(() => {
        let stopSync: (() => void) | undefined;

        (async () => {
            try {
                await initDb();
                // Only pull on cold start if the user is already logged in from a
                // previous session. Pulling before login has no token, fails, and
                // would otherwise consume the pull cooldown window.
                const token = await SecureStore.getItemAsync("rider_token");
                if (token) await pullFromBackend();
                stopSync = startSyncInterval(30_000);
            } catch (err) {
                console.error("[startup] database init failed:", err);
            }
        })();

        return () => stopSync?.();
    }, []);

    if (!fontsLoaded) return null;

    // KeyboardProvider: lets screens keep the focused input above the keyboard
    // (the app is edge-to-edge, so Android no longer resizes the window for it).
    return (
        <KeyboardProvider>
            <ThemePreferenceProvider>
                <RootLayoutNav />
            </ThemePreferenceProvider>
        </KeyboardProvider>
    );
}

function RootLayoutNav() {
    const colorScheme = useColorScheme();
    const { isOnline } = useNetworkStatus();
    const { status: updateStatus, restart } = useAppUpdates();
    const rideActive = useRideActive();
    const [updateLater, setUpdateLater] = useState(false);

    return (
        <ThemeProvider
            value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            <OfflineBanner isVisible={!isOnline} />
            {/* Never restart during a ride: the banner waits until End Ride. "Later" applies it on the next app start. */}
            {updateStatus === "ready" && !rideActive && !updateLater && (
                <UpdateBanner onRestart={restart} onLater={() => setUpdateLater(true)} />
            )}
            <Toast />
        </ThemeProvider>
    );
}
