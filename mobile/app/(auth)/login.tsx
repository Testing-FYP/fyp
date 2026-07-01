import { LinearGradient } from 'expo-linear-gradient';
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

export default function LoginScreen() {
  const router = useRouter();
  const { enterGuestMode, login } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSuccess = useCallback(() => {
    router.replace('/(app)');
  }, [router]);

  const handleGoogleError = useCallback((message: string) => {
    setError(message);
  }, []);

  function handleGuestMode() {
    enterGuestMode();
    router.replace('/(app)');
  }

  async function handleLogin() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setError('Enter your email and password to continue.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await login(normalizedEmail, password);
      handleSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            <LinearGradient
              colors={[theme.gradientStart, theme.gradientEnd]}
              style={styles.brandMark}
            >
              <Text style={[styles.brandInitials, { color: theme.surface }]}>TE</Text>
            </LinearGradient>
            <Text style={[styles.brandName, { color: theme.text }]}>TravelElite</Text>
          </View>

          <View style={styles.intro}>
            <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Sign in to keep planning where you left off.
            </Text>
          </View>

          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: theme.inputBg, borderColor: theme.error }]}>
              <Text accessibilityRole="alert" style={[styles.errorText, { color: theme.error }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <View style={styles.form}>
            <Input
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Email"
              onChangeText={setEmail}
              onSubmitEditing={() => {
                void handleLogin();
              }}
              placeholder="you@example.com"
              returnKeyType="next"
              value={email}
            />
            <Input
              autoComplete="password"
              label="Password"
              onChangeText={setPassword}
              onSubmitEditing={() => {
                void handleLogin();
              }}
              placeholder="Enter your password"
              returnKeyType="go"
              secureTextEntry
              value={password}
            />
            <Button
              loading={loading}
              onPress={() => {
                void handleLogin();
              }}
              title="Sign In"
            />
          </View>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            <Text style={[styles.dividerText, { color: theme.textSecondary }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          </View>

          <GoogleSignInButton onError={handleGoogleError} onSuccess={handleSuccess} />

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
            New to TravelElite?{' '}
            <Link href="/(auth)/signup" style={[styles.link, { color: theme.primary }]}>
              Create an account
            </Link>
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  brandRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 46 },
  brandMark: {
    alignItems: 'center',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    marginRight: 11,
    width: 42,
  },
  brandInitials: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  brandName: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  intro: { marginBottom: 28 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  subtitle: { fontSize: 16, lineHeight: 24, marginTop: 8 },
  errorBanner: { borderRadius: 12, borderWidth: 1, marginBottom: 18, padding: 13 },
  errorText: { fontSize: 14, lineHeight: 20 },
  form: { gap: 18 },
  dividerRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  guestButton: { alignSelf: 'center', marginTop: 14, padding: 8 },
  guestText: { fontSize: 14, fontWeight: '700' },
  footer: { fontSize: 15, lineHeight: 22, marginTop: 28, textAlign: 'center' },
  link: { fontWeight: '800' },
});
