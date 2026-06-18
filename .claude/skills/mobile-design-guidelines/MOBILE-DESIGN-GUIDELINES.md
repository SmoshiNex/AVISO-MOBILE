# Mobile Design Guidelines — AVISO Mobile

## Brand Colors

| Token | Hex | Use |
|-------|-----|-----|
| `primary` | `#0274DF` | Buttons, links, active tab indicators |
| `accent` | `#208AEF` | Header backgrounds, highlights |
| `danger` | `#EF4444` | SOS button, error states, warnings |

Always use `useThemeColor()` — never hardcode hex in components.

## Dark / Light Mode

- Both modes are supported via `useColorScheme` + `useThemeColor`
- Never hardcode `color: '#000'` or `backgroundColor: '#fff'` in JSX
- Test UI changes in both modes before considering work done

## Touch Targets

Minimum 44×44pt on every tappable element:
```tsx
// Buttons
<Pressable style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 }}>

// Icon-only buttons: add padding to reach 44pt
<Pressable style={{ padding: 10 }}>
  <Ionicons name="close" size={24} />
</Pressable>
```

## Safe Areas

All screens with headers or tabs must use SafeAreaView:
```tsx
import { SafeAreaView } from 'react-native-safe-area-context';

// Top-only (when tabs handle bottom)
<SafeAreaView edges={['top']} style={{ flex: 1 }}>

// Full (standalone screens without tabs)
<SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
```

## Bottom Tab Bar

- 4 tabs maximum: Camera · Map · Hazard Logs · Profile
- Icons: `@expo/vector-icons` Ionicons only
  - Inactive: `*-outline` variant
  - Active: filled variant (same name without `-outline`)
- Do NOT use `expo-symbols` — it is iOS-only and crashes on Android

## Typography

| Use | Weight | Size |
|-----|--------|------|
| Screen titles | 700 (bold) | 20–24 |
| Section labels | 600 (semibold) | 16–18 |
| Body text | 400 (regular) | 14–16 |
| Captions/meta | 400 (regular) | 12 |

Use system font only (no custom fonts unless explicitly added).

## Animations

Functional animations only:
- Loading spinners (`ActivityIndicator`) — always show while fetching
- Screen transitions (handled by Expo Router/React Navigation)
- No decorative animations, no Lottie files, no confetti

If using `reanimated`, only use it for meaningful UI feedback (swipe-to-delete, etc.).

## Spacing

Use multiples of 4px: 4, 8, 12, 16, 20, 24, 32, 48.
NativeWind classes map to these: `p-4` = 16px, `p-6` = 24px, etc.

## Error, Loading, Empty States

Every data screen must show all three:
```tsx
if (loading) return <ActivityIndicator className="mt-8" color="#0274DF" />;
if (error) return <ErrorMessage text={error} />;
if (items.length === 0) return <EmptyState message="No records yet." />;
```

## Forms (Auth Screens)

- `KeyboardAvoidingView` wrapper on all screens with TextInput
- `returnKeyType="next"` on all inputs except last
- `returnKeyType="done"` on last input
- All inputs: `autoCapitalize="none"` for email/password fields
- Disable submit button while loading (prevent double-submit)
