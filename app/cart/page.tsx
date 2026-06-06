'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  BadgeCheck,
  Bus,
  CalendarDays,
  CreditCard,
  Hotel,
  Loader2,
  MapPin,
  PlaneTakeoff,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Users,
} from 'lucide-react';

type CartItem = {
  id: string;
  type: string;
  title: string;
  detail: string;
  price: number;
};

type TripCart = {
  tripTitle: string;
  destination: string;
  tripType?: string;
  departureDate?: string;
  returnDate?: string;
  nights?: number;
  travelers?: number;
  vibes?: string[];
  items: CartItem[];
  total: number;
  createdAt: string;
};

function formatMoney(value: any) {
  const amount = Number(value) || 0;
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
}

function formatDate(value?: string) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function itemIcon(type: string) {
  if (type === 'flight') return PlaneTakeoff;
  if (type === 'hotel') return Hotel;
  if (type === 'transport') return Bus;
  return MapPin;
}

export default function CartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<TripCart | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    card: '',
    expiry: '',
    cvc: '',
  });

  useEffect(() => {
    const raw = window.localStorage.getItem('travelEliteCart');
    if (raw) {
      try {
        setCart(JSON.parse(raw));
      } catch {
        window.localStorage.removeItem('travelEliteCart');
      }
    }
    setLoaded(true);
  }, []);

  const total = useMemo(
    () => cart?.items?.reduce((sum, item) => sum + (Number(item.price) || 0), 0) || 0,
    [cart]
  );

  const validatePayment = () => {
    if (!form.name.trim()) return 'Enter the cardholder name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Enter a valid email address.';
    if (form.card.replace(/\D/g, '').length < 12) return 'Enter a valid card number.';
    if (!/^\d{2}\/\d{2}$/.test(form.expiry)) return 'Use MM/YY for the expiry date.';
    if (form.cvc.replace(/\D/g, '').length < 3) return 'Enter a valid CVC.';
    return '';
  };

  const handlePay = async () => {
    const validationError = validatePayment();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!cart?.items?.length) {
      setError('Your cart is empty.');
      return;
    }

    setError('');
    setIsPaying(true);
    await new Promise(resolve => setTimeout(resolve, 900));
    const confirmation = {
      id: `TE-${Date.now()}`,
      ...cart,
      total,
      paidAt: new Date().toISOString(),
      payer: { name: form.name, email: form.email },
      status: 'confirmed',
    };
    window.localStorage.setItem('travelEliteLastPayment', JSON.stringify(confirmation));
    window.localStorage.removeItem('travelEliteCart');
    setPaid(true);
    setIsPaying(false);
  };

  if (!loaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!cart || !cart.items?.length) {
    return (
      <main className="min-h-screen bg-background px-6 pb-20 pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-border bg-card">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="mt-6 text-5xl title-text">Your cart is empty</h1>
          <p className="mt-3 text-sm text-muted-foreground">Select a trip summary first, then return here to checkout.</p>
          <button onClick={() => router.push('/')} className="mt-8 rounded-2xl bg-foreground px-6 py-3 text-sm font-black text-background">
            Back to planner
          </button>
        </div>
      </main>
    );
  }

  if (paid) {
    return (
      <main className="min-h-screen bg-background px-6 pb-20 pt-28">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-3xl rounded-3xl border border-emerald-500/25 bg-card p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 text-emerald-600">
            <BadgeCheck className="h-10 w-10" />
          </div>
          <h1 className="mt-6 text-5xl title-text">Payment confirmed</h1>
          <p className="mt-3 text-muted-foreground">Your selected travel cart has been confirmed locally for this demo checkout.</p>
          <button onClick={() => router.push('/reservations')} className="mt-8 rounded-2xl bg-foreground px-6 py-3 text-sm font-black text-background">
            View reservations
          </button>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 pb-20 pt-28">
      <div className="mx-auto max-w-6xl">
        <button onClick={() => router.push('/')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to planner
        </button>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <div>
                <p className="small-caps">Trip cart</p>
                <h1 className="mt-2 text-4xl title-text">{cart.tripTitle}</h1>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                    {cart.tripType?.replace(/_/g, ' ') || 'trip'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                    <CalendarDays className="h-3 w-3" /> {formatDate(cart.departureDate)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-xs font-bold text-muted-foreground">
                    <Users className="h-3 w-3" /> {cart.travelers || 1} traveler{cart.travelers === 1 ? '' : 's'}
                  </span>
                </div>
                {cart.vibes?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {cart.vibes.map(vibe => (
                      <span key={vibe} className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-bold capitalize text-sky-700 dark:text-sky-300">
                        <Sparkles className="h-3 w-3" /> {vibe.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {cart.items.map(item => {
                const Icon = itemIcon(item.type);
                return (
                  <div key={item.id} className="flex items-center gap-4 rounded-2xl border border-border bg-background/70 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-foreground">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black">{item.title}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-muted-foreground">{item.detail}</p>
                    </div>
                    <p className="font-black">{formatMoney(item.price)}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="small-caps">Payment</p>
                <h2 className="mt-2 text-3xl title-text">{formatMoney(total)}</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                <CreditCard className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Cardholder name" className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground" />
              <input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="Email receipt" className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground" />
              <input value={form.card} onChange={event => setForm({ ...form, card: event.target.value })} placeholder="Card number" inputMode="numeric" className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground" />
              <div className="grid grid-cols-2 gap-3">
                <input value={form.expiry} onChange={event => setForm({ ...form, expiry: event.target.value })} placeholder="MM/YY" className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground" />
                <input value={form.cvc} onChange={event => setForm({ ...form, cvc: event.target.value })} placeholder="CVC" inputMode="numeric" className="rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground" />
              </div>
            </div>

            {error ? <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600">{error}</p> : null}

            <button onClick={handlePay} disabled={isPaying} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-5 py-4 text-sm font-black text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
              {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {isPaying ? 'Processing' : 'Pay now'}
            </button>
            <p className="mt-3 text-center text-xs font-semibold text-muted-foreground">Demo payment only. No real card charge is made.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
