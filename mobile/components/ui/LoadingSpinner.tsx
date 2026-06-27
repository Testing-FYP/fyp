import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface LoadingSpinnerProps {
  message?: string;
  fill?: boolean;
}

export function LoadingSpinner({ message, fill = false }: LoadingSpinnerProps) {
  const { theme } = useTheme();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.container,
        fill && styles.fill,
        fill && { backgroundColor: theme.background },
      ]}
    >
      <ActivityIndicator color={theme.primary} size="large" />
      {message ? (
        <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fill: {
    flex: 1,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
    textAlign: 'center',
  },
});
