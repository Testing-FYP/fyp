import { Redirect, Stack } from 'expo-router';

import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export default function AuthLayout() {
  const { token, isLoading } = useAuth();
  const { theme } = useTheme();

  if (isLoading) {
    return <LoadingSpinner fill />;
  }

  if (token) {
    return <Redirect href="/(app)" />;
  }

  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: theme.background },
        headerShown: false,
      }}
    />
  );
}
