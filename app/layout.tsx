import type {Metadata} from 'next';
import { Inter, Playfair_Display, Geist } from 'next/font/google';
import './globals.css';
import ThemeToggle from '@/components/ThemeToggle';
import Navbar from '@/components/Navbar';
import { AuthProvider } from '@/hooks/useAuth';
import { cn } from "@/lib/utils";

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
        <AuthProvider>
          <Navbar />
          {children}
          <ThemeToggle />
        </AuthProvider>
      </body>
    </html>
  );
}
