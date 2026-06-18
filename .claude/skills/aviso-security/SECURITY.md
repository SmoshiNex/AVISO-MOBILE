# AVISO Mobile — Security Guidelines

## Token Storage

- **ALWAYS** use `expo-secure-store` for the rider token and user object
- **NEVER** use `AsyncStorage`, `localStorage`, or module-level variables for tokens
- Keys: `rider_token` (string), `rider_user` (JSON string)
- Clear both on logout

```ts
// Correct
await SecureStore.setItemAsync('rider_token', token);

// Wrong — never do this
AsyncStorage.setItem('rider_token', token);
```

## API Calls

- All requests go through `lib/api-client.ts` which attaches the Bearer token automatically
- Never construct `Authorization` headers manually in components
- Never embed API keys or secrets in source code — use `.env` (already in `.gitignore`)
- `EXPO_PUBLIC_` prefix is for the API URL only, never for secrets

## Permissions

Request permissions at runtime, not at startup. Handle denial gracefully:

```ts
const [permission, requestPermission] = useCameraPermissions();
if (!permission?.granted) {
  return <PermissionDeniedScreen onRequest={requestPermission} />;
}
```

Required permissions and their purpose:
- Camera → hazard detection camera feed
- Location → trip tracking, hazard geo-tagging
- SMS → emergency SOS fallback when no internet

## Crash Detection Anti-Spam

The crash detector has a 5-second lockout (`CRASH_LOCKOUT_MS`) after firing. This prevents:
- Repeated SOS triggers from a single event
- SMS spam to emergency contacts
- Multiple simultaneous POST requests to /emergency/sos

Never remove the lockout or reduce it below 3000ms.

## Data Privacy

- Never log the rider token, password, or OTP to the console
- User PII (name, email, phone) loaded from SecureStore — never from URL params
- Emergency contacts stored server-side only, fetched on demand

## Error Handling

- Show user-friendly error messages on failed API calls
- Do not display raw Laravel error stack traces in the UI
- 401 responses → clear SecureStore and redirect to login
- 422 responses → show field-level validation errors

## Email OTP

- OTP is 6 digits, expires in 10 minutes (enforced server-side)
- After verifyOtp success, delete OTP from DB (done server-side)
- Never auto-fill or cache OTP values
