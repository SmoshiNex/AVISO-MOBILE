# AVISO Mobile — Claude Coding Guide

## MANDATORY: Invoke These Skills Before Every Task

At the start of every session and before doing any work, use the Skill tool to invoke ALL of the following skills:

1. **Architecture** → `Skill("aviso-mobile-architecture")`
2. **Security** → `Skill("aviso-security")`
3. **React Best Practices** → `Skill("react-best-practices")`
4. **Composition Patterns** → `Skill("composition-patterns")`
5. **Mobile Design Guidelines** → `Skill("mobile-design-guidelines")`

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Expo SDK 54 / React Native 0.81.5 / React 19.1.0 |
| Language | TypeScript 5.9 — strict, no `any` |
| Routing | Expo Router 6 — file-based, typed routes |
| Styling | NativeWind 4 (Tailwind for RN) + StyleSheet for dynamic values |
| Maps | react-native-maps — Expo Go compatible |
| Camera | expo-camera CameraView — Expo Go compatible |
| Sensors | expo-sensors (Accelerometer + Gyroscope) — crash detection |
| Auth tokens | expo-secure-store only — never AsyncStorage |
| HTTP | lib/api-client.ts (fetch wrapper with Bearer token) |
| Backend | Laravel 12 at aviso-main — REST API at `/api/rider/*` |

---

## File Creation Rules

| Type | Location |
|------|----------|
| Expo Router screen | `app/<group>/<screen>.tsx` |
| Route group layout | `app/<group>/_layout.tsx` |
| Shared component | `components/<name>.tsx` |
| UI primitive | `components/ui/<name>.tsx` |
| Hook | `hooks/use-<name>.ts` |
| API/service utility | `lib/<name>.ts` |
| Type definitions | `types/index.ts` |
| Theme / spacing | `constants/theme.ts` |
| Detection constants | `constants/detections.ts` |
| Platform override | Same path + `.web.ts` / `.ios.tsx` suffix |

---

## Naming Conventions

- Screen files: `kebab-case.tsx` (e.g. `hazard-logs.tsx`, `verify-otp.tsx`)
- Components: `PascalCase.tsx` (e.g. `ThemedText.tsx`)
- Hooks: `use-kebab-case.ts` (e.g. `use-crash-detection.ts`)
- Lib utilities: `kebab-case.ts` (e.g. `api-client.ts`)
- Types/interfaces: `PascalCase` (e.g. `HazardLog`, `EmergencyContact`)
- Props types: `ComponentNameProps`
- Constants: `UPPER_SNAKE_CASE` for values

---

## Key Patterns

### Theme colors — always useThemeColor()
```tsx
import { useThemeColor } from '@/hooks/use-theme-color';
const background = useThemeColor({}, 'background');
const primary = useThemeColor({}, 'primary');
```

### API calls — always use api-client.ts
```ts
import { api } from '@/lib/api-client';
const data = await api.get('/rider/hazard-logs');
const result = await api.post('/rider/hazard-logs', body);
```
Never call `fetch` directly in components.

### Token storage — always SecureStore
```ts
import * as SecureStore from 'expo-secure-store';
await SecureStore.setItemAsync('rider_token', token);
const token = await SecureStore.getItemAsync('rider_token');
```

### Safe areas — always on screens with notch/tabs
```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
<SafeAreaView edges={['top']} style={{ flex: 1 }}>
```

### NativeWind — className for static styles
```tsx
<View className="flex-1 bg-white px-4" />
// Dynamic values → StyleSheet.create
```

### Icons — Ionicons from @expo/vector-icons
```tsx
import { Ionicons } from '@expo/vector-icons';
<Ionicons name="camera-outline" size={24} color={color} />
```
Do NOT use expo-symbols on Android — it is iOS-only.

---

## Route Structure

```
app/
  _layout.tsx          ← root: checks auth token, redirects
  (auth)/
    _layout.tsx        ← Stack, no header
    login.tsx
    signup.tsx
    verify-otp.tsx
  (rider)/
    _layout.tsx        ← Tabs: camera · map · hazard-logs · profile
    camera.tsx         ← CameraView + hazard report + SOS button
    map.tsx            ← MapView + hazard markers
    hazard-logs.tsx    ← Rider's own hazard history
    hazard-detail.tsx  ← (no tab — stack screen)
    emergency-alert.tsx ← (no tab — SOS countdown)
    emergency-contacts.tsx ← (no tab — from profile)
    profile.tsx
```

---

## Backend API Reference

Base URL: `EXPO_PUBLIC_API_URL` env var

| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/rider/auth/login` | No |
| POST | `/api/rider/auth/register` | No |
| POST | `/api/rider/auth/verify-otp` | No |
| DELETE | `/api/rider/auth/logout` | Yes |
| GET | `/api/rider/hazard-logs` | Yes |
| POST | `/api/rider/hazard-logs` | Yes |
| GET | `/api/rider/trips` | Yes |
| POST | `/api/rider/trips` | Yes |
| PUT | `/api/rider/trips/{id}/location` | Yes |
| PUT | `/api/rider/trips/{id}/end` | Yes |
| POST | `/api/rider/emergency/sos` | Yes |
| GET/POST/PUT/DELETE | `/api/rider/emergency-contacts` | Yes |

---

## Dev Commands

```bash
npx expo start --clear    # Start Metro (clear cache)
# Press 's' to switch to Expo Go mode, then scan QR with Expo Go 54.x
npx expo install --check  # Verify package versions
expo lint                 # ESLint
```
