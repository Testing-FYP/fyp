import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, Theme } from '@/constants/theme';

const THEME_KEY = 'travel_theme';

type ThemePreference = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemTheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(
    systemTheme === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    let active = true;

    async function restorePreference() {
      try {
        const savedPreference = await AsyncStorage.getItem(THEME_KEY);
        if (
          active &&
          (savedPreference === 'light' || savedPreference === 'dark')
        ) {
          setPreference(savedPreference);
        }
      } catch {
        // The system preference remains a safe fallback if storage is unavailable.
      }
    }

    void restorePreference();
    return () => {
      active = false;
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference((current) => {
      const nextPreference = current === 'dark' ? 'light' : 'dark';
      void AsyncStorage.setItem(THEME_KEY, nextPreference);
      return nextPreference;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const isDark = preference === 'dark';
    return {
      theme: isDark ? darkTheme : lightTheme,
      isDark,
      toggleTheme,
    };
  }, [preference]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
