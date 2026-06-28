import { useRef, useEffect } from 'react';
import { Animated, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const BANNER_HEIGHT = 36;

interface OfflineBannerProps {
  isVisible: boolean;
}

export function OfflineBanner({ isVisible }: OfflineBannerProps) {
  const insets = useSafeAreaInsets();
  // Start well offscreen so the banner is invisible before insets are measured
  const translateY = useRef(new Animated.Value(-200)).current;

  // Must slide up by (insets.top + BANNER_HEIGHT) to fully clear the screen,
  // because the banner is positioned at `top: insets.top`.
  const hideY = -(insets.top + BANNER_HEIGHT);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isVisible ? 0 : hideY,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [isVisible, hideY, translateY]);

  return (
    <Animated.View
      style={[styles.banner, { top: insets.top, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <Ionicons name="cloud-offline-outline" size={13} color="#fff" />
      <Text style={styles.text}>You're offline — detections saved locally</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: BANNER_HEIGHT,
    backgroundColor: '#B45309',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 999,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
});

