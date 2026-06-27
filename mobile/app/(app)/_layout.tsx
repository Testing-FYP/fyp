import { Redirect, Stack } from 'expo-router';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export default function AppLayout() {
  const { token, isLoading } = useAuth();
  const { theme } = useTheme();

  if (isLoading) {
    return <LoadingSpinner fill />;
  }

  if (!token) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: theme.background },
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text, fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="wizard" options={{ headerShown: false }} />
      <Stack.Screen name="results" options={{ headerTitle: 'Your itinerary' }} />
      <Stack.Screen name="reservations" options={{ headerTitle: 'My reservations' }} />
    </Stack>
  );
}
