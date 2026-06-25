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

Use the Skill tool to invoke ALL skills in `.claude/skills/`:
1. `Skill("aviso-mobile-architecture")`
2. `Skill("aviso-security")`
3. `Skill("react-best-practices")`
4. `Skill("composition-patterns")`
5. `Skill("mobile-design-guidelines")`
