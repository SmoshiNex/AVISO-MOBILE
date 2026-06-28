import { create } from "axios";
import * as SecureStore from "expo-secure-store";

const rawBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? "")
    .trim()
    .replace(/\/$/, "");

function validateBaseUrl(): string {
    if (!rawBaseUrl) {
        throw new Error(
            "EXPO_PUBLIC_API_URL is not set. Use your PC LAN IP or a reachable domain instead of localhost when testing in Expo Go.",
        );
    }

    if (
        /^(https?:\/\/)?(localhost|127\.0\.0\.1|::1)(:\d+)?$/i.test(rawBaseUrl)
    ) {
        throw new Error(
            "EXPO_PUBLIC_API_URL points to localhost. Expo Go on a physical device cannot reach localhost; use your PC LAN IP or a reachable domain.",
        );
    }

    return `${rawBaseUrl}/api`;
}

const client = create({
    baseURL: `${rawBaseUrl}/api`,
    headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
    },
});

client.interceptors.request.use(async (config) => {
    config.baseURL = validateBaseUrl();

    const token = await SecureStore.getItemAsync("rider_token");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
    return config;
});

client.interceptors.response.use(
    (res) => res.data,
    (err) => {
        if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
            throw Object.assign(
                new Error(
                    "Unable to reach the backend. Check your internet connection and EXPO_PUBLIC_API_URL.",
                ),
                {
                    code: "NETWORK_ERROR",
                },
            );
        }

        const message =
            err.response?.data?.message ??
            `Request failed with status ${err.response?.status}`;
        throw Object.assign(new Error(message), {
            status: err.response?.status,
            errors: err.response?.data?.errors,
        });
    },
);

export const api = {
    get: <T>(path: string) => client.get<T, T>(path),
    post: <T>(path: string, body?: unknown) => client.post<T, T>(path, body),
    patch: <T>(path: string, body?: unknown) => client.patch<T, T>(path, body),
    put: <T>(path: string, body?: unknown) => client.put<T, T>(path, body),
    delete: <T>(path: string) => client.delete<T, T>(path),
    postForm: <T>(path: string, formData: FormData) =>
        client.post<T, T>(path, formData, {
            headers: { "Content-Type": "multipart/form-data" },
        }),
};
