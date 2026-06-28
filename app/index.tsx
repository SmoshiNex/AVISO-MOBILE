import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";

export default function IndexPage() {
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
            <View style={styles.container}>
                <ActivityIndicator size="large" />
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
        backgroundColor: "#fff",
    },
});
