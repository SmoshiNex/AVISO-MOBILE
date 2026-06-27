import { useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import { styles } from '@/styles/rider-layout.style';

type Tab = {
  name: string;
  icon: { focused: string; unfocused: string };
};

const TABS: Tab[] = [
  { name: 'home',    icon: { focused: 'home',           unfocused: 'home-outline'   } },
  { name: 'camera',  icon: { focused: 'camera',         unfocused: 'camera-outline' } },
  { name: 'map',     icon: { focused: 'map',             unfocused: 'map-outline'    } },
  { name: 'profile', icon: { focused: 'person',          unfocused: 'person-outline' } },
];

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const scaleAnims = useRef(TABS.map(() => new Animated.Value(1))).current;

  const colors = Colors[colorScheme];

  const visibleRoutes = state.routes.filter((r) =>
    TABS.some((t) => t.name === r.name),
  );

  const handlePress = (index: number, routeKey: string, routeName: string) => {
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
      <BlurView intensity={60} tint="light" style={styles.tabBar}>
        {visibleRoutes.map((route) => {
          const tabIndex = TABS.findIndex((t) => t.name === route.name);
          if (tabIndex === -1) return null;

          const tab = TABS[tabIndex];
          const isFocused = state.routes[state.index]?.name === route.name;
          const color = isFocused ? colors.actionText : colors.icon;

          return (
            <Animated.View
              key={route.key}
              style={{ transform: [{ scale: scaleAnims[tabIndex] }] }}
            >
              <TouchableOpacity
                style={[styles.tabItem, isFocused && { backgroundColor: colors.actionBg }]}
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
      </BlurView>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <FloatingTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="camera" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
