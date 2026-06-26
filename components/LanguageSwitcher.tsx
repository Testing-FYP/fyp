'use client';

import { useLocale } from '@/context/LocaleContext';

export default function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border text-xs uppercase tracking-[0.15em] font-bold text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all"
      aria-label="Switch language"
    >
      {locale === 'en' ? 'عربي' : 'EN'}
    </button>
  );
}
