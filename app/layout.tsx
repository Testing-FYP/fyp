import type {Metadata} from 'next';
import { Inter, Playfair_Display, Geist } from 'next/font/google';
import './globals.css';
import ThemeToggle from '@/components/ThemeToggle';
import Navbar from '@/components/Navbar';
import { AuthProvider } from '@/hooks/useAuth';
import { CurrencyProvider } from '@/context/CurrencyContext';
import { cn } from "@/lib/utils";
import { Toaster } from 'sonner';
import BackToTop from '@/components/BackToTop';

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Travel Elite',
  description: 'Premium flight search, booking, and travel management',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(playfair.variable, "font-sans", geist.variable)}>
      <body suppressHydrationWarning className="bg-background text-foreground antialiased transition-colors duration-300">
        <CurrencyProvider>
          <AuthProvider>
            <Navbar />
            {children}
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
      </body>
    </html>
  );
}
