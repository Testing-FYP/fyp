'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { PlaneTakeoff, Eye, EyeOff, User, Mail, Lock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, signup } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '' });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    let result: { error?: string };
    if (tab === 'login') {
      result = await login(form.email, form.password);
    } else {
      if (!form.first_name.trim() || !form.last_name.trim()) {
        setError('First and Last names are required.');
        setIsLoading(false);
        return;
      }
      result = await signup(form.email, form.password, form.first_name, form.last_name);
    }
    setIsLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push('/');
      toast.success(tab === 'login' ? 'Welcome back!' : 'Account created! Welcome to TravelElite.');
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-20">
      {/* Background decoration */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-foreground/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-foreground/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-6">
            <PlaneTakeoff className="w-6 h-6" />
            <span className="title-text text-2xl">TRAVEL ELITE</span>
          </div>
          <p className="text-muted-foreground text-sm font-light">
            {tab === 'login' ? 'Welcome back, traveller' : 'Begin your elite journey'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-3xl p-8 shadow-2xl backdrop-blur-xl">
          {/* Tab Toggle */}
          <div className="flex bg-muted rounded-2xl p-1 mb-8">
            {(['login', 'signup'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); setForm({ email: '', password: '', first_name: '', last_name: '' }); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 small-caps tracking-wider ${
                  tab === t
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'login' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AnimatePresence mode="wait">
              {tab === 'signup' && (
                <motion.div
                  key="names"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-5"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        name="first_name"
                        value={form.first_name}
                        onChange={handleChange}
                        placeholder="First Name"
                        required
                        className="w-full pl-11 pr-4 py-3.5 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        name="last_name"
                        value={form.last_name}
                        onChange={handleChange}
                        placeholder="Last Name"
                        required
                        className="w-full pl-11 pr-4 py-3.5 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all placeholder:text-muted-foreground"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Email Address"
                required
                className="w-full pl-11 pr-4 py-3.5 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all placeholder:text-muted-foreground"
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder={tab === 'signup' ? 'Password (min. 6 chars)' : 'Password'}
                required
                className="w-full pl-11 pr-12 py-3.5 bg-muted border border-border rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all placeholder:text-muted-foreground"
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="text-red-500 text-xs bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={isLoading}
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
                  {tab === 'login' ? 'Sign In' : 'Create Account'}
                </>
              )}
            </button>
          </form>

          <p className="text-center text-muted-foreground text-xs mt-6">
            {tab === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setTab(tab === 'login' ? 'signup' : 'login'); setError(''); }}
              className="text-foreground underline underline-offset-2 hover:opacity-70 transition-opacity"
            >
              {tab === 'login' ? 'Sign up free' : 'Sign in'}
            </button>
          </p>
        </div>
      </motion.div>
    </main>
  );
}
