import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const client = axios.create({
  baseURL: `${process.env.EXPO_PUBLIC_API_URL ?? ''}/api`,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

client.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('rider_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message =
      err.response?.data?.message ?? `Request failed with status ${err.response?.status}`;
    throw Object.assign(new Error(message), {
      status: err.response?.status,
      errors: err.response?.data?.errors,
    });
  }
);

export const api = {
  get: <T>(path: string) => client.get<T, T>(path),
  post: <T>(path: string, body?: unknown) => client.post<T, T>(path, body),
  patch: <T>(path: string, body?: unknown) => client.patch<T, T>(path, body),
  put: <T>(path: string, body?: unknown) => client.put<T, T>(path, body),
  delete: <T>(path: string) => client.delete<T, T>(path),
  postForm: <T>(path: string, formData: FormData) =>
    client.post<T, T>(path, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};
