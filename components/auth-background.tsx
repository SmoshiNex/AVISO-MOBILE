import { View } from 'react-native';

interface AuthBackgroundProps {
  children: React.ReactNode;
}

export function AuthBackground({ children }: AuthBackgroundProps) {
  return <View style={{ flex: 1, backgroundColor: '#F7F7F7' }}>{children}</View>;
}
