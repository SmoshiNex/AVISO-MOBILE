import { useState } from "react";
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api-client";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function ForgotPasswordScreen() {
    const background     = useThemeColor({}, "background");
    const backgroundElem = useThemeColor({}, "backgroundElement");
    const text             = useThemeColor({}, "text");
    const textSecondary    = useThemeColor({}, "textSecondary");
    const placeholder     = useThemeColor({}, "placeholder");
    const primary         = useThemeColor({}, "primary");
    const danger            = useThemeColor({}, "danger");
    const actionBg        = useThemeColor({}, "actionBg");
    const actionText      = useThemeColor({}, "actionText");
    const colorScheme = useColorScheme();

    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    function handleEmailChange(text: string) {
        setEmail(text);
        if (error) setError("");
    }

    async function handleSend() {
        if (!email.trim()) {
            setError("Please enter your email address.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            await api.post("/rider/auth/forgot-password", {
                email: email.trim(),
            });
            router.push({
                pathname: "/(auth)/forgot-password-otp",
                params: { email: email.trim() },
            });
        } catch (err: any) {
            const message = String(
                err?.message ?? "Something went wrong. Please try again.",
            );
            if (message.toLowerCase().includes("no rider account found")) {
                setError(
                    "No verified rider account was found. If you just registered, finish email verification first.",
                );
            } else {
                setError(message);
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <View style={[styles.root, { backgroundColor: background }]}>
            <StatusBar barStyle={colorScheme === "dark" ? "light-content" : "dark-content"} backgroundColor={background} />
            <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                >
                    <ScrollView
                        contentContainerStyle={styles.scroll}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.brand}>
                            <Image
                                source={require("../../assets/images/logo.png")}
                                style={styles.logoImg}
                                resizeMode="contain"
                            />
                            <Text style={[styles.appName, { color: text }]}>AVISO</Text>
                            <Text style={[styles.tagline, { color: textSecondary }]}>
                                Reset Your Password
                            </Text>
                        </View>

                        <View style={styles.steps}>
                            {[1, 2, 3].map((n) => (
                                <View
                                    key={n}
                                    style={[
                                        styles.stepDot,
                                        { backgroundColor: n === 1 ? primary : backgroundElem },
                                        n === 1 && styles.stepDotActive,
                                    ]}
                                />
                            ))}
                        </View>

                        <Text style={[styles.hint, { color: textSecondary }]}>
                            Enter the email address linked to your rider
                            account. We&apos;ll send you a 6-digit code to reset
                            your password.
                        </Text>

                        <View style={styles.form}>
                            <View style={styles.field}>
                                <Text style={[styles.label, { color: textSecondary }]}>Email address</Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        { backgroundColor: backgroundElem, color: text },
                                        error ? { backgroundColor: 'rgba(239, 68, 68, 0.07)', borderWidth: 1.5, borderColor: danger } : null,
                                    ]}
                                    value={email}
                                    onChangeText={handleEmailChange}
                                    placeholder="rider@example.com"
                                    placeholderTextColor={placeholder}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="done"
                                    onSubmitEditing={handleSend}
                                    keyboardAppearance={colorScheme}
                                    underlineColorAndroid="transparent"
                                />
                                {error ? (
                                    <Text style={[styles.errorText, { color: danger }]}>
                                        {error}
                                    </Text>
                                ) : null}
                            </View>

                            <Pressable
                                style={[
                                    styles.button,
                                    { backgroundColor: actionBg },
                                    (!email.trim() || loading) &&
                                        styles.buttonDisabled,
                                ]}
                                onPress={handleSend}
                                disabled={!email.trim() || loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color={actionText} />
                                ) : (
                                    <Text style={[styles.buttonText, { color: actionText }]}>
                                        Send Reset Code
                                    </Text>
                                )}
                            </Pressable>

                            <Pressable
                                onPress={() => router.back()}
                                style={styles.linkRow}
                            >
                                <Text style={[styles.linkText, { color: textSecondary }]}>
                                    Remember your password?{" "}
                                    <Text style={[styles.linkBold, { color: primary }]}>Log in</Text>
                                </Text>
                            </Pressable>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    safeArea: { flex: 1 },
    flex: { flex: 1 },
    scroll: {
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: 28,
        paddingVertical: 40,
    },
    brand: {
        alignItems: "center",
        marginBottom: 28,
    },
    logoImg: { width: 80, height: 80, marginBottom: 16 },
    appName: {
        fontFamily: "JetBrainsMono_700Bold",
        fontSize: 30,
        letterSpacing: -0.5,
    },
    tagline: {
        fontFamily: "JetBrainsMono_400Regular",
        fontSize: 13,
        marginTop: 4,
    },
    steps: {
        flexDirection: "row",
        justifyContent: "center",
        gap: 8,
        marginBottom: 24,
    },
    stepDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    stepDotActive: {
        width: 24,
    },
    hint: {
        fontFamily: "JetBrainsMono_400Regular",
        fontSize: 14,
        textAlign: "center",
        lineHeight: 22,
        marginBottom: 28,
        paddingHorizontal: 8,
    },
    form: {},
    field: { marginBottom: 16 },
    label: {
        fontFamily: "JetBrainsMono_500Medium",
        fontSize: 13,
        marginBottom: 8,
    },
    input: {
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        fontFamily: "JetBrainsMono_400Regular",
        minHeight: 50,
    },
    errorText: {
        fontFamily: "JetBrainsMono_400Regular",
        fontSize: 13,
        marginTop: 6,
        paddingHorizontal: 2,
    },
    button: {
        borderRadius: 32,
        minHeight: 52,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 10,
    },
    buttonDisabled: { opacity: 0.45 },
    buttonText: {
        fontFamily: "JetBrainsMono_600SemiBold",
        fontSize: 15,
    },
    linkRow: {
        alignItems: "center",
        marginTop: 24,
        minHeight: 44,
        justifyContent: "center",
    },
    linkText: {
        fontFamily: "JetBrainsMono_400Regular",
        fontSize: 14,
    },
    linkBold: {
        fontFamily: "JetBrainsMono_600SemiBold",
    },
});
