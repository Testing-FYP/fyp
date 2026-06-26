import type {Metadata} from 'next';
import localFont from 'next/font/local';
import './globals.css';
import ThemeToggle from '@/components/ThemeToggle';
import Navbar from '@/components/Navbar';
import { AuthProvider } from '@/hooks/useAuth';
import { CurrencyProvider } from '@/context/CurrencyContext';
import SessionProviderWrapper from '@/components/SessionProviderWrapper';
import { cn } from "@/lib/utils";
import { Toaster } from 'sonner';
import BackToTop from '@/components/BackToTop';
import { LocaleProvider } from '@/context/LocaleContext';
import IntlProvider from '@/components/IntlProvider';

const geist = localFont({
  src: '../node_modules/next/dist/next-devtools/server/font/geist-latin.woff2',
  variable: '--font-sans',
});

const playfair = {variable: '[--font-display:Georgia,serif]'};

export const metadata: Metadata = {
  title: 'Travel Elite',
  description: 'Premium flight search, booking, and travel management',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning className={cn(playfair.variable, "font-sans", geist.variable)}>
      <body suppressHydrationWarning className="bg-background text-foreground antialiased transition-colors duration-300">
        <LocaleProvider>
          <IntlProvider>
            <CurrencyProvider>
              <AuthProvider>
                <Navbar />
                <SessionProviderWrapper>{children}</SessionProviderWrapper>
                <ThemeToggle />
                <Toaster
                  position="top-right"
                  toastOptions={{
                    duration: 4000,
                    classNames: {
                      toast: 'z-[200]',
                    },
                  }}
                />
                <BackToTop />
              </AuthProvider>
            </CurrencyProvider>
          </IntlProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
