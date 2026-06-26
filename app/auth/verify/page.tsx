'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailCheck, PlaneTakeoff, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useTranslations } from 'next-intl';

function VerifyEmailContent() {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const { verifyOTP, resendOTP } = useAuth();
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join('');

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setInterval(() => {
      setResendCooldown(seconds => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  };

  const updateDigit = (index: number, value: string) => {
    const nextDigit = value.replace(/\D/g, '').slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = nextDigit;
    setDigits(nextDigits);

    if (nextDigit && index < digits.length - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      focusInput(index - 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedDigits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedDigits.length !== 6) return;

    e.preventDefault();
    setDigits(pastedDigits.split(''));
    focusInput(5);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error('Email address is missing. Please sign up again.');
      return;
    }

    setIsLoading(true);
    const result = await verifyOTP(email, code);
    setIsLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Email verified! Welcome to TravelElite.');
    router.push('/');
  };

  const handleResend = async () => {
    if (!email) {
      toast.error('Email address is missing. Please sign up again.');
      return;
    }

    const result = await resendOTP(email);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    setResendCooldown(60);
    toast.success('New code sent!');
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-20">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-foreground/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-6">
            <PlaneTakeoff className="w-6 h-6" />
            <span className="title-text text-2xl">TRAVEL ELITE</span>
          </div>
          <p className="text-muted-foreground text-sm font-light">
            One last step before takeoff
          </p>
        </div>

        <div className="bg-card border border-border rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex justify-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center">
              <MailCheck className="w-6 h-6 text-foreground" />
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-xl font-medium tracking-tight mb-3">{t('verifyEmail')}</h1>
            <p className="text-muted-foreground text-sm leading-6">
              {t('enterOtp')}{' '}
              <span className="text-foreground break-all">{email || 'your email'}</span>
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-6">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={element => {
                    inputRefs.current[index] = element;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => updateDigit(index, e.target.value)}
                  onKeyDown={e => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  aria-label={`Verification code digit ${index + 1}`}
                  className="h-12 w-11 sm:h-14 sm:w-12 rounded-2xl bg-muted border border-border text-center text-lg font-semibold tracking-tight focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={code.length < 6 || isLoading}
              className="w-full py-3.5 bg-foreground text-background rounded-2xl text-sm font-medium small-caps tracking-wider hover:opacity-90 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full"
                />
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {t('verify')}
                </>
              )}
            </button>
          </form>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="inline-flex items-center justify-center gap-2 text-muted-foreground text-xs hover:text-foreground transition-colors disabled:opacity-50 disabled:hover:text-muted-foreground"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {resendCooldown > 0 ? `${t('resendCode')} ${resendCooldown}s` : t('resendCode')}
            </button>
          </div>
        </div>
      </motion.div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
