import "../global.css";
import { useEffect } from "react";
import {
    DarkTheme,
    DefaultTheme,
    ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import Toast from "react-native-toast-message";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import {
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { initDb } from "@/lib/local-db";
import { startSyncInterval, pullFromBackend } from "@/lib/sync-service";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
    const colorScheme = useColorScheme();

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
                await pullFromBackend();
                stopSync = startSyncInterval(30_000);
            } catch (err) {
                console.error("[startup] database init failed:", err);
            }
        })();

        return () => stopSync?.();
    }, []);

    if (!fontsLoaded) return null;

    return (
        <ThemeProvider
            value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
            <Stack screenOptions={{ headerShown: false }} />
            <StatusBar style="auto" />
            <Toast />
        </ThemeProvider>
    );
}
