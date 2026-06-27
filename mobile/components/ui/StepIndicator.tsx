import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  title: string;
}

export function StepIndicator({ currentStep, totalSteps, title }: StepIndicatorProps) {
  const { theme } = useTheme();
  const progress = `${Math.min(100, (currentStep / totalSteps) * 100)}%` as `${number}%`;

  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: totalSteps, now: currentStep }}>
      <View style={styles.labelRow}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>STEP {currentStep} OF {totalSteps}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
        </View>
        <Text style={[styles.percent, { color: theme.textSecondary }]}>
          {Math.round((currentStep / totalSteps) * 100)}%
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View style={[styles.fill, { backgroundColor: theme.primary, width: progress }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  percent: {
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    borderRadius: 4,
    height: 6,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 4,
    height: '100%',
  },
});
