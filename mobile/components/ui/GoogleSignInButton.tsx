import axios from 'axios';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { API, GOOGLE_CLIENT_ID, GOOGLE_REDIRECT_URI } from '@/constants/api';
import { GoogleProfile } from '@/context/AuthContext';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

WebBrowser.maybeCompleteAuthSession();

interface GoogleUserInfo {
  id: string;
  email: string;
  given_name?: string;
  family_name?: string;
  name?: string;
}

interface GoogleSignInButtonProps {
  onSuccess: () => void;
  onError: (message: string) => void;
}

function isGoogleUserInfo(value: unknown): value is GoogleUserInfo {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const profile = value as Record<string, unknown>;
  return typeof profile.id === 'string' && typeof profile.email === 'string';
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError<{ error?: { message?: string }; message?: string }>(error)) {
    return (
      error.response?.data?.error?.message ??
      error.response?.data?.message ??
      'Google sign-in could not be completed.'
    );
  }
  return error instanceof Error ? error.message : 'Google sign-in could not be completed.';
}

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const { loginWithGoogle } = useAuth();
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    webClientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_CLIENT_ID,
    androidClientId: GOOGLE_CLIENT_ID,
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: ['openid', 'profile', 'email'],
  });

  const completeSignIn = useCallback(
    async (accessToken: string) => {
      setLoading(true);
      try {
        const profileResponse = await axios.get<unknown>(API.googleUserInfo, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!isGoogleUserInfo(profileResponse.data)) {
          throw new Error('Google returned an incomplete profile.');
        }

        const names = profileResponse.data.name?.trim().split(/\s+/) ?? [];
        const profile: GoogleProfile = {
          googleId: profileResponse.data.id,
          email: profileResponse.data.email,
          firstName: profileResponse.data.given_name ?? names[0] ?? '',
          lastName: profileResponse.data.family_name ?? names.slice(1).join(' '),
        };
        await loginWithGoogle(profile);
        onSuccess();
      } catch (error) {
        onError(errorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [loginWithGoogle, onError, onSuccess],
  );

  useEffect(() => {
    if (response?.type === 'success') {
      const accessToken = response.authentication?.accessToken ?? response.params.access_token;
      if (accessToken) {
        void completeSignIn(accessToken);
      } else {
        onError('Google did not return an access token.');
      }
    } else if (response?.type === 'error') {
      onError('Google sign-in was not completed.');
    }
  }, [completeSignIn, onError, response]);

  const disabled = !request || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled}
      onPress={() => {
        void promptAsync();
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          opacity: disabled ? 0.55 : pressed ? 0.82 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <>
          <View style={styles.googleMark}>
            <Text style={[styles.googleLetter, { color: theme.primary }]}>G</Text>
            <View style={[styles.dot, styles.dotTop, { backgroundColor: theme.error }]} />
            <View style={[styles.dot, styles.dotRight, { backgroundColor: theme.success }]} />
            <View style={[styles.dot, styles.dotBottom, { backgroundColor: theme.accent }]} />
          </View>
          <Text style={[styles.label, { color: theme.text }]}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
    width: '100%',
  },
  googleMark: {
    height: 24,
    justifyContent: 'center',
    marginRight: 10,
    position: 'relative',
    width: 24,
  },
  googleLetter: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  dot: {
    borderRadius: 2,
    height: 4,
    position: 'absolute',
    width: 4,
  },
  dotTop: {
    left: 10,
    top: 0,
  },
  dotRight: {
    right: 0,
    top: 10,
  },
  dotBottom: {
    bottom: 0,
    left: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
