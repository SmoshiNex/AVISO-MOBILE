# AVISO Mobile — Architecture Reference

## Overview

AVISO Mobile is the rider-facing app. Riders use it to:
- View their camera feed (future: detect hazards via YOLOv8n)
- Report road hazards manually
- Track active trips (location sent to admin dashboard)
- Trigger SOS alerts on crash (dual-sensor detection)
- Manage emergency contacts

## Folder Structure

```
aviso-mobile/
├── app/                         # Expo Router screens (file = route)
│   ├── _layout.tsx              # Root: auth check → redirect
│   ├── (auth)/
│   │   ├── _layout.tsx          # Stack layout
│   │   ├── login.tsx
│   │   ├── signup.tsx
│   │   └── verify-otp.tsx
│   └── (rider)/
│       ├── _layout.tsx          # Tabs layout + crash detection
│       ├── camera.tsx           # Tab 1: Camera
│       ├── map.tsx              # Tab 2: Map
│       ├── hazard-logs.tsx      # Tab 3: Hazard history
│       ├── hazard-detail.tsx    # Stack screen (no tab)
│       ├── emergency-alert.tsx  # Stack screen (no tab)
│       ├── emergency-contacts.tsx # Stack screen (no tab)
│       └── profile.tsx          # Tab 4: Profile
├── components/
│   ├── themed-text.tsx
│   ├── themed-view.tsx
│   └── ui/
│       ├── collapsible.tsx
│       └── icon-symbol.tsx
├── constants/
│   ├── theme.ts                 # Colors, spacing, fonts
│   └── detections.ts            # Crash thresholds
├── hooks/
│   ├── use-color-scheme.ts
│   ├── use-theme-color.ts
│   ├── use-crash-detection.ts   # Starts/stops CrashDetector
│   └── use-trip.ts              # Active trip state + location updates
├── lib/
│   ├── api-client.ts            # fetch wrapper with Bearer token
│   ├── crash-detector.ts        # Dual-sensor crash detection class
│   └── emergency-sos.ts         # POST SOS + SMS fallback
└── types/
    └── index.ts                 # Shared TypeScript types
```

## Auth Flow

```
App opens
  └─ Root _layout reads SecureStore 'rider_token'
       ├─ Token exists → /(rider)/camera
       └─ No token     → /(auth)/login

Login → save token + user → /(rider)/camera
Signup → save email → /(auth)/verify-otp → save token + user → /(rider)/camera
Logout → clear SecureStore → /(auth)/login
```

## Real-Time Location Flow

```
Rider starts trip (POST /api/rider/trips)
  → useTrip hook: every 5s, POST /api/rider/trips/{id}/location
  → Laravel fires LocationUpdated event
  → Laravel Reverb broadcasts on riders.live channel
  → Admin WebSocket listener updates map pin in real time
```

## Crash Detection Flow

```
(rider)/_layout mounts useCrashDetection()
  → CrashDetector subscribes to Accelerometer + Gyroscope
  → Both sensors spike within 300ms window
  → onCrash() fires → router.push('/(rider)/emergency-alert')
  → 10-second countdown → user confirms or cancels
  → If confirmed: POST /api/rider/emergency/sos + expo-sms to contacts
  → 5-second lockout prevents repeated triggers
```

## Hazard Report Flow

```
Camera screen → "Report Hazard" button
  → Bottom sheet: type, description, location (auto from GPS)
  → POST /api/rider/hazard-logs
  → Appears in admin hazard map + rider's hazard-logs tab
```

## Camera / AR Stack

| Environment | Library | Capability |
|-------------|---------|-----------|
| Expo Go (dev) | expo-camera CameraView | Basic camera feed, no AI |
| EAS dev build (prod) | react-native-vision-camera + fast-tflite | YOLOv8n hazard detection |

In Expo Go: camera works but no object detection overlay. Detection is planned for EAS build.

## Backend Connection

- Base URL: `process.env.EXPO_PUBLIC_API_URL` (set in .env, e.g. `http://192.168.x.x:8000`)
- Auth: Bearer token from SecureStore attached by `lib/api-client.ts`
- All protected routes require `RequireRiderRole` middleware (Sanctum token + role=rider)
