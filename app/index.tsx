import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useThemeColor } from "@/hooks/use-theme-color";

export default function IndexPage() {
    const background = useThemeColor({}, "background");
    const tint = useThemeColor({}, "tint");
    const [target, setTarget] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        SecureStore.getItemAsync("rider_token")
            .then((token) => {
                if (!mounted) return;

                setTarget(token ? "/(rider)/(tabs)/home" : "/(auth)/login");
            })
            .catch(() => {
                if (mounted) {
                    setTarget("/(auth)/login");
                }
            });

        return () => {
            mounted = false;
        };
    }, []);

    if (!target) {
        return (
            <View style={[styles.container, { backgroundColor: background }]}>
                <ActivityIndicator size="large" color={tint} />
            </View>
        );
    }

    return <Redirect href={target as any} />;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    },
});
