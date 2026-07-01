import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { API } from '@/constants/api';

const TOKEN_KEY = 'travel_token';
const USER_KEY = 'travel_user';

export interface User {
  id?: string | number;
  email: string;
  first_name: string;
  last_name: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface SignupResult {
  needsVerification: boolean;
  email: string;
}

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isGuest: boolean;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => Promise<SignupResult>;
  verifyOTP: (email: string, otp: string) => Promise<void>;
  resendOTP: (email: string) => Promise<void>;
  loginWithGoogle: (profile: GoogleProfile) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.email === 'string' &&
    typeof candidate.first_name === 'string' &&
    typeof candidate.last_name === 'string'
  );
}

function isAuthResponse(value: unknown): value is AuthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.token === 'string' && isUser(candidate.user);
}

function messageFromError(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string; error?: string }>(error)) {
    return error.response?.data?.message ?? error.response?.data?.error ?? fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const enterGuestMode = useCallback(() => {
    setIsGuest(true);
  }, []);

  const exitGuestMode = useCallback(() => {
    setIsGuest(false);
  }, []);

  const persistSession = useCallback(async (session: AuthResponse) => {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, session.token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
    ]);
    setToken(session.token);
    setUser(session.user);
  }, []);

  useEffect(() => {
    let active = true;

    async function restoreSession() {
      try {
        const [savedToken, savedUser] = await Promise.all([
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(USER_KEY),
        ]);

        if (!active || !savedToken || !savedUser) {
          return;
        }

        const parsedUser: unknown = JSON.parse(savedUser);
        if (isUser(parsedUser)) {
          setToken(savedToken);
          setUser(parsedUser);
        } else {
          await Promise.all([
            SecureStore.deleteItemAsync(TOKEN_KEY),
            SecureStore.deleteItemAsync(USER_KEY),
          ]);
        }
      } catch {
        await Promise.all([
          SecureStore.deleteItemAsync(TOKEN_KEY),
          SecureStore.deleteItemAsync(USER_KEY),
        ]);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      try {
        const response = await axios.post<unknown>(API.login, { email, password });
        if (!isAuthResponse(response.data)) {
          throw new Error('The server returned an invalid sign-in response.');
        }
        await persistSession(response.data);
      } catch (error) {
        throw new Error(messageFromError(error, 'Unable to sign in. Please try again.'));
      }
    },
    [persistSession],
  );

  const signup = useCallback(
    async (
      email: string,
      password: string,
      firstName: string,
      lastName: string,
    ) => {
      try {
        const response = await axios.post<unknown>(API.signup, {
          email,
          password,
          first_name: firstName,
          last_name: lastName,
        });

        if (typeof response.data !== 'object' || response.data === null) {
          throw new Error('The server returned an invalid sign-up response.');
        }

        const payload = response.data as Record<string, unknown>;
        return {
          needsVerification: payload.needsVerification !== false,
          email: typeof payload.email === 'string' ? payload.email : email,
        };
      } catch (error) {
        throw new Error(
          messageFromError(error, 'Unable to create your account. Please try again.'),
        );
      }
    },
    [],
  );

  const verifyOTP = useCallback(
    async (email: string, otp: string) => {
      try {
        const response = await axios.post<unknown>(API.verifyOTP, { email, otp });
        if (!isAuthResponse(response.data)) {
          throw new Error('The server returned an invalid verification response.');
        }
        await persistSession(response.data);
      } catch (error) {
        throw new Error(
          messageFromError(error, 'Unable to verify that code. Please try again.'),
        );
      }
    },
    [persistSession],
  );

  const resendOTP = useCallback(async (email: string) => {
    try {
      await axios.post(API.resendOTP, { email });
    } catch (error) {
      throw new Error(
        messageFromError(error, 'Unable to resend the code. Please try again.'),
      );
    }
  }, []);

  const loginWithGoogle = useCallback(
    async (profile: GoogleProfile) => {
      try {
        const response = await axios.post<unknown>(API.googleAuth, profile);
        if (!isAuthResponse(response.data)) {
          throw new Error('The server returned an invalid Google sign-in response.');
        }
        await persistSession(response.data);
      } catch (error) {
        throw new Error(
          messageFromError(error, 'Unable to continue with Google. Please try again.'),
        );
      }
    },
    [persistSession],
  );

  const logout = useCallback(async () => {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
      ]);
    } finally {
      setToken(null);
      setUser(null);
      setIsGuest(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isGuest,
      enterGuestMode,
      exitGuestMode,
      login,
      signup,
      verifyOTP,
      resendOTP,
      loginWithGoogle,
      logout,
    }),
    [
      user,
      token,
      isLoading,
      isGuest,
      enterGuestMode,
      exitGuestMode,
      login,
      signup,
      verifyOTP,
      resendOTP,
      loginWithGoogle,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
