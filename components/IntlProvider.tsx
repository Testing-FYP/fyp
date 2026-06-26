'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useLocale } from '@/context/LocaleContext';
import en from '@/messages/en.json';
import ar from '@/messages/ar.json';

const messages = { en, ar };

export default function IntlProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}
