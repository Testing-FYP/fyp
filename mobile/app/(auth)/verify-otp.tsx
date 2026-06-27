import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

const OTP_LENGTH = 6;

export default function VerifyOTPScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const { verifyOTP, resendOTP } = useAuth();
  const { theme } = useTheme();
  const email = Array.isArray(params.email) ? (params.email[0] ?? '') : (params.email ?? '');
  const [digits, setDigits] = useState<string[]>(Array.from({ length: OTP_LENGTH }, () => ''));
  const [cooldown, setCooldown] = useState(60);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setCooldown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function updateDigit(value: string, index: number) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });
    setError('');
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyPress(
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) {
    if (event.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerify() {
    const otp = digits.join('');
    if (!email) {
      setError('The verification email is missing. Return to sign up and try again.');
      return;
    }
    if (otp.length !== OTP_LENGTH) {
      setError('Enter the complete 6-digit code.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await verifyOTP(email, otp);
      router.replace('/(app)');
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : 'Unable to verify that code.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!email || cooldown > 0) {
      return;
    }
    setResending(true);
    setError('');
    setNotice('');
    try {
      await resendOTP(email);
      setCooldown(60);
      setNotice('A new code is on its way.');
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Unable to resend the code.');
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
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

        <View style={[styles.iconCircle, { backgroundColor: theme.inputBg }]}>
          <Ionicons color={theme.primary} name="mail-outline" size={32} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Check your inbox</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Enter the 6-digit code sent to{email ? ` ${email}` : ' your email'}.
        </Text>

        <View style={styles.otpRow}>
          {digits.map((digit, index) => (
            <TextInput
              key={index}
              ref={(input) => {
                inputRefs.current[index] = input;
              }}
              accessibilityLabel={`OTP digit ${index + 1}`}
              keyboardType="number-pad"
              maxLength={1}
              onChangeText={(value) => updateDigit(value, index)}
              onKeyPress={(event) => handleKeyPress(event, index)}
              selectTextOnFocus
              selectionColor={theme.primary}
              style={[
                styles.otpInput,
                {
                  backgroundColor: theme.inputBg,
                  borderColor: digit ? theme.primary : theme.border,
                  color: theme.text,
                },
              ]}
              value={digit}
            />
          ))}
        </View>

        {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: theme.error }]}>{error}</Text> : null}
        {notice ? <Text style={[styles.feedback, { color: theme.success }]}>{notice}</Text> : null}

        <Button loading={loading} onPress={() => { void handleVerify(); }} title="Verify Email" />

        <Pressable
          accessibilityRole="button"
          disabled={cooldown > 0 || resending}
          onPress={() => { void handleResend(); }}
          style={styles.resendButton}
        >
          <Text
            style={[
              styles.resendText,
              { color: cooldown > 0 || resending ? theme.textSecondary : theme.primary },
            ]}
          >
            {resending
              ? 'Sending a new code…'
              : cooldown > 0
                ? `Resend code in ${cooldown}s`
                : 'Resend code'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  backButton: {
    alignItems: 'center',
    borderRadius: 12,
    height: 42,
    justifyContent: 'center',
    left: 24,
    position: 'absolute',
    top: 20,
    width: 42,
  },
  iconCircle: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    marginBottom: 22,
    width: 68,
  },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 23, marginTop: 9, textAlign: 'center' },
  otpRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 16, marginTop: 32 },
  otpInput: {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 22,
    fontWeight: '800',
    height: 56,
    textAlign: 'center',
    width: 47,
  },
  feedback: { fontSize: 14, lineHeight: 20, marginBottom: 16, textAlign: 'center' },
  resendButton: { alignItems: 'center', padding: 16 },
  resendText: { fontSize: 15, fontWeight: '700' },
});
