import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { GoogleSignInButton } from '@/components/ui/GoogleSignInButton';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

export default function SignupScreen() {
  const router = useRouter();
  const { enterGuestMode, signup } = useAuth();
  const { theme } = useTheme();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSuccess = useCallback(() => {
    router.replace('/(app)');
  }, [router]);

  const handleGoogleError = useCallback((message: string) => {
    setError(message);
  }, []);

  function handleGuestMode() {
    enterGuestMode();
    router.replace('/(app)');
  }

  async function handleSignup() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!firstName.trim() || !lastName.trim() || !normalizedEmail || !password) {
      setError('Complete every field to create your account.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await signup(
        normalizedEmail,
        password,
        firstName.trim(),
        lastName.trim(),
      );
      if (result.needsVerification) {
        router.push({ pathname: '/(auth)/verify-otp', params: { email: result.email } });
      } else {
        router.replace('/(auth)/login');
      }
    } catch (signupError) {
      setError(
        signupError instanceof Error ? signupError.message : 'Unable to create your account.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: theme.inputBg }]}
          >
            <Ionicons color={theme.text} name="arrow-back" size={21} />
          </Pressable>

          <Text style={[styles.title, { color: theme.text }]}>Create your account</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            One profile, every itinerary and booking in reach.
          </Text>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: theme.inputBg, borderColor: theme.error }]}>
              <Text accessibilityRole="alert" style={[styles.errorText, { color: theme.error }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.nameRow}>
            <Input
              autoComplete="given-name"
              containerStyle={styles.nameField}
              label="First name"
              onChangeText={setFirstName}
              placeholder="Alex"
              value={firstName}
            />
            <Input
              autoComplete="family-name"
              containerStyle={styles.nameField}
              label="Last name"
              onChangeText={setLastName}
              placeholder="Morgan"
              value={lastName}
            />
          </View>
          <View style={styles.formTail}>
            <Input
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              placeholder="you@example.com"
              value={email}
            />
            <Input
              autoComplete="new-password"
              label="Password"
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              secureTextEntry
              value={password}
            />
            <Button loading={loading} onPress={() => { void handleSignup(); }} title="Sign Up" />
          </View>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <GoogleSignInButton onError={handleGoogleError} onSuccess={handleGoogleSuccess} />

          <Pressable
            accessibilityRole="button"
            onPress={handleGuestMode}
            style={styles.guestButton}
          >
            <Text style={[styles.guestText, { color: theme.textSecondary }]}>
              Continue as guest
            </Text>
          </Pressable>

          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Already have an account?{' '}
            <Link href="/(auth)/login" style={[styles.link, { color: theme.primary }]}>Sign in</Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 22 },
  backButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    marginBottom: 30,
    width: 42,
  },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.7 },
  subtitle: { fontSize: 16, lineHeight: 24, marginBottom: 26, marginTop: 8 },
  errorBanner: { borderRadius: 12, borderWidth: 1, marginBottom: 18, padding: 13 },
  errorText: { fontSize: 14, lineHeight: 20 },
  nameRow: { flexDirection: 'row', gap: 12 },
  nameField: { flex: 1 },
  formTail: { gap: 18, marginTop: 18 },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  guestButton: { alignSelf: 'center', marginTop: 14, padding: 8 },
  guestText: { fontSize: 14, fontWeight: '700' },
  footer: { fontSize: 15, lineHeight: 22, marginTop: 28, textAlign: 'center' },
  link: { fontWeight: '800' },
});
