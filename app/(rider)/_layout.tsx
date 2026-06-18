import { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCrashDetection } from '@/hooks/use-crash-detection';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Radius } from '@/constants/theme';

type Tab = {
  name: string;
  icon: { focused: string; unfocused: string };
};

const TABS: Tab[] = [
  { name: 'home',    icon: { focused: 'home',           unfocused: 'home-outline' } },
  { name: 'camera',  icon: { focused: 'camera',         unfocused: 'camera-outline' } },
  { name: 'map',     icon: { focused: 'map',             unfocused: 'map-outline' } },
  { name: 'profile', icon: { focused: 'person',          unfocused: 'person-outline' } },
];

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const scaleAnims = useRef(TABS.map(() => new Animated.Value(1))).current;

  const visibleRoutes = state.routes.filter((r) =>
    TABS.some((t) => t.name === r.name),
  );

  const handlePress = (index: number, routeKey: string, routeName: string) => {
    // Bounce animation
    Animated.sequence([
      Animated.timing(scaleAnims[index], { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnims[index], { toValue: 1, useNativeDriver: true, bounciness: 12 }),
    ]).start();

    const isFocused = state.index === state.routes.findIndex((r) => r.key === routeKey);
    const event = navigation.emit({
      type: 'tabPress',
      target: routeKey,
      canPreventDefault: true,
    });
    if (!isFocused && !event.defaultPrevented) {
      navigation.navigate(routeName);
    }
  };

  return (
    <View
      style={[
        styles.tabBarWrapper,
        {
          bottom: Math.max(insets.bottom, 12) + (Platform.OS === 'android' ? 4 : 0),
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.tabBar, { backgroundColor: colors.tabBar }]}>
        {visibleRoutes.map((route) => {
          const tabIndex = TABS.findIndex((t) => t.name === route.name);
          if (tabIndex === -1) return null;

          const tab = TABS[tabIndex];
          const isFocused = state.routes[state.index]?.name === route.name;
          const color = isFocused ? '#fff' : colors.icon;

          return (
            <Animated.View
              key={route.key}
              style={{ transform: [{ scale: scaleAnims[tabIndex] }] }}
            >
              <TouchableOpacity
                style={[styles.tabItem, isFocused && { backgroundColor: colors.primary }]}
                onPress={() => handlePress(tabIndex, route.key, route.name)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={tab.name}
              >
                <Ionicons
                  name={(isFocused ? tab.icon.focused : tab.icon.unfocused) as any}
                  size={22}
                  color={color}
                />
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

export default function RiderLayout() {
  useCrashDetection();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="camera" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="profile" />
      {/* Non-tab screens — hidden from bar */}
      <Tabs.Screen name="hazard-logs"          options={{ href: null }} />
      <Tabs.Screen name="emergency-alert"      options={{ href: null }} />
      <Tabs.Screen name="emergency-contacts"   options={{ href: null }} />
      <Tabs.Screen name="trip-history"         options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: 6,
    gap: 4,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  tabItem: {
    width: 52,
    height: 44,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
