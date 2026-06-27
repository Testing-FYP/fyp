import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export default function IndexScreen() {
  const { token, isLoading } = useAuth();
  const { theme } = useTheme();

  if (isLoading) {
    return <LoadingSpinner fill message="Preparing your journey…" />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Redirect href={token ? '/(app)' : '/(auth)/login'} />
    </View>
  );
}
