'use client';
import { useState, useEffect, createContext, useContext } from 'react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string; needsVerification?: boolean; email?: string }>;
  signup: (
    email: string,
    password: string,
    first_name: string,
    last_name: string
  ) => Promise<{ error?: string; needsVerification?: boolean; email?: string }>;
  verifyOTP: (email: string, otp: string) => Promise<{ error?: string }>;
  resendOTP: (email: string) => Promise<{ error?: string }>;
  logout: () => void;
  token: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('travel_token');
    const storedUser = localStorage.getItem('travel_user');
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return {
          error: data.error || 'Login failed.',
          needsVerification: data.needsVerification,
          email: data.email,
        };
      }
      localStorage.setItem('travel_token', data.token);
      localStorage.setItem('travel_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Could not connect to server.' };
    }
  };

  const signup = async (email: string, password: string, first_name: string, last_name: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, first_name, last_name }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Signup failed.' };
      if (data.needsVerification === true) {
        return { needsVerification: true, email: data.email };
      }
      localStorage.setItem('travel_token', data.token);
      localStorage.setItem('travel_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Could not connect to server.' };
    }
  };

  const verifyOTP = async (email: string, otp: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Verification failed' };
      localStorage.setItem('travel_token', data.token);
      localStorage.setItem('travel_user', JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Could not connect to server.' };
    }
  };

  const resendOTP = async (email: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to resend OTP' };
      return {};
    } catch {
      return { error: 'Could not connect to server.' };
    }
  };

  const logout = () => {
    localStorage.removeItem('travel_token');
    localStorage.removeItem('travel_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, signup, verifyOTP, resendOTP, logout, token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export { BACKEND_URL };
