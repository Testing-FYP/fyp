import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { DataSourcePanel } from '@/components/ui/DataSourcePanel';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export default function HomeScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  async function handleLogout() {
    setSigningOut(true);
    setError('');
    try {
      await logout();
      router.replace('/(auth)/login');
    } catch {
      setError('Your local session could not be cleared. Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const firstName = user?.first_name?.trim() || 'Traveler';

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: theme.textSecondary }]}>GOOD TO SEE YOU</Text>
            <Text numberOfLines={2} style={[styles.greeting, { color: theme.text }]}>
              Plan Your Dream Trip, {firstName}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              accessibilityRole="button"
              hitSlop={8}
              onPress={toggleTheme}
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: theme.inputBg, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons color={theme.text} name={isDark ? 'sunny-outline' : 'moon-outline'} size={21} />
            </Pressable>
            <Pressable
              accessibilityLabel="Sign out"
              accessibilityRole="button"
              disabled={signingOut}
              hitSlop={8}
              onPress={() => { void handleLogout(); }}
              style={({ pressed }) => [
                styles.iconButton,
                { backgroundColor: theme.inputBg, opacity: signingOut || pressed ? 0.55 : 1 },
              ]}
            >
              <Ionicons color={theme.text} name="log-out-outline" size={21} />
            </Pressable>
          </View>
        </View>

        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.error }]}>{error}</Text> : null}

        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          end={{ x: 1, y: 1 }}
          start={{ x: 0, y: 0 }}
          style={styles.hero}
        >
          <View style={[styles.heroIcon, { backgroundColor: theme.surface }]}>
            <Ionicons color={theme.primary} name="airplane" size={24} />
          </View>
          <Text style={[styles.heroTitle, { color: theme.surface }]}>Your next chapter starts here.</Text>
          <Text style={[styles.heroBody, { color: theme.surface }]}>
            Tell us how you want to travel. We’ll shape the flights, stay, and moments around you.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(app)/wizard')}
            style={({ pressed }) => [
              styles.heroButton,
              { backgroundColor: theme.surface, opacity: pressed ? 0.86 : 1 },
            ]}
          >
            <Text style={[styles.heroButtonText, { color: theme.primaryDark }]}>Plan New Trip</Text>
            <Ionicons color={theme.primaryDark} name="arrow-forward" size={20} />
          </Pressable>
        </LinearGradient>

        <Button
          onPress={() => router.push('/(app)/reservations')}
          title="My Reservations"
          variant="outline"
        />

        <View style={styles.howItWorks}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Simple by design</Text>
          <View style={styles.stepsRow}>
            {[
              { icon: 'options-outline' as const, label: 'Share your style' },
              { icon: 'sparkles-outline' as const, label: 'Get your plan' },
              { icon: 'bookmark-outline' as const, label: 'Save or book' },
            ].map((step, index) => (
              <View key={step.label} style={styles.step}>
                <View style={[styles.stepIcon, { backgroundColor: theme.inputBg }]}>
                  <Ionicons color={theme.primary} name={step.icon} size={21} />
                </View>
                <Text style={[styles.stepNumber, { color: theme.textSecondary }]}>0{index + 1}</Text>
                <Text style={[styles.stepLabel, { color: theme.text }]}>{step.label}</Text>
              </View>
            ))}
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
      <DataSourcePanel />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: 36, paddingHorizontal: 20, paddingTop: 14 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 24 },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.3, marginBottom: 6 },
  greeting: { fontSize: 27, fontWeight: '800', letterSpacing: -0.6, lineHeight: 33 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: { alignItems: 'center', borderRadius: 12, height: 42, justifyContent: 'center', width: 42 },
  error: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  hero: { borderRadius: 26, marginBottom: 18, overflow: 'hidden', padding: 24 },
  heroIcon: { alignItems: 'center', borderRadius: 16, height: 48, justifyContent: 'center', marginBottom: 26, opacity: 0.95, width: 48 },
  heroTitle: { fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 35, maxWidth: 300 },
  heroBody: { fontSize: 15, lineHeight: 23, marginTop: 10, maxWidth: 320, opacity: 0.9 },
  heroButton: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 14, flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, minHeight: 54, paddingHorizontal: 18 },
  heroButtonText: { fontSize: 16, fontWeight: '800' },
  howItWorks: { marginTop: 34 },
  sectionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 17 },
  stepsRow: { flexDirection: 'row', gap: 12 },
  step: { flex: 1 },
  stepIcon: { alignItems: 'center', borderRadius: 13, height: 44, justifyContent: 'center', marginBottom: 10, width: 44 },
  stepNumber: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 3 },
  stepLabel: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
});
