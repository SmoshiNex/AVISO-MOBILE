# AVISO Mobile — Agent Reference

## SDK Version: 54

This project uses **Expo SDK 54** running in **Expo Go 54.x**.

- Do NOT use SDK 56 APIs or packages
- Do NOT suggest EAS-only features for Expo Go workflows
- Check [Expo SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/) for package compatibility

## Package Warnings

| Package | Status | Note |
|---------|--------|------|
| `expo-symbols` | ANDROID CRASH | iOS only — use `@expo/vector-icons` Ionicons instead |
| `react-native-vision-camera` | EAS only | Not Expo Go compatible — use `expo-camera` CameraView |
| `@rnmapbox/maps` | EAS only | Not Expo Go compatible — use `react-native-maps` |
| `npm audit fix --force` | FORBIDDEN | Breaks Expo peer deps — never run this |

## Before Writing Code

Read ALL skill files in `.claude/skills/`:
1. `aviso-mobile-architecture/ARCHITECTURE.md`
2. `aviso-security/SECURITY.md`
3. `react-best-practices/REACT-BEST-PRACTICES.md`
4. `composition-patterns/COMPOSITION-PATTERNS.md`
5. `mobile-design-guidelines/MOBILE-DESIGN-GUIDELINES.md`
