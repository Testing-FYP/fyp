'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type Locale = 'en' | 'ar';

interface LocaleContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  isRTL: boolean;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'en',
  setLocale: () => {},
  isRTL: false,
});

function applyLocaleToDocument(locale: Locale) {
  document.cookie = `locale=${locale};path=/;max-age=31536000`;
  document.documentElement.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', locale);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = localStorage.getItem('travelEliteLocale') as Locale | null;
    const initialLocale = saved === 'en' || saved === 'ar' ? saved : 'en';
    applyLocaleToDocument(initialLocale);
    const timer = window.setTimeout(() => setLocaleState(initialLocale), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem('travelEliteLocale', newLocale);
    applyLocaleToDocument(newLocale);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, isRTL: locale === 'ar' }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
