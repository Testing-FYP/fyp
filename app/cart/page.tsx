'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useAuth, BACKEND_URL } from '@/hooks/useAuth';
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
  origin?: string;
  destination: string;
  tripType?: string;
  departureDate?: string;
  returnDate?: string;
  nights?: number;
  travelers?: number;
  adults?: number;
  children?: number;
  vibes?: string[];
  items: CartItem[];
  total: number;
  createdAt: string;
};

type PassengerDetail = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female';
  nationality: string;
  passportNumber: string;
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
  const [aiSnapshot, setAiSnapshot] = useState<any>(null);
  const [passengers, setPassengers] = useState<PassengerDetail[]>([]);
  const { token, isAuthenticated } = useAuth();

  useEffect(() => {
    if (cart) {
      const adults = cart.adults || cart.travelers || 1;
      const children = cart.children || 0;
      const total = adults + children;
      setPassengers(
        Array.from({ length: total }, () => ({
          firstName: '',
          lastName: '',
          dateOfBirth: '',
          gender: 'Male' as const,
          nationality: '',
          passportNumber: '',
        }))
      );
    }
  }, [cart?.travelers, cart?.adults, cart?.children]);

  const updatePassenger = (index: number, field: keyof PassengerDetail, value: string) => {
    setPassengers(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('travelEliteCartAI');
      if (raw) setAiSnapshot(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const restoreAiSelection = () => {
    try {
      const raw = localStorage.getItem('travelEliteCartAI');
      if (!raw) return;
      const snapshot = JSON.parse(raw);
      localStorage.setItem('travelEliteCart', raw);
      setCart(snapshot);
    } catch { /* ignore */ }
  };

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
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      if (!p.firstName.trim() || !p.lastName.trim()) return `Please enter full name for Passenger ${i + 1}.`;
      if (!p.dateOfBirth.trim()) return `Please enter date of birth for Passenger ${i + 1}.`;
      if (!p.nationality.trim()) return `Please enter nationality for Passenger ${i + 1}.`;
    }
    if (form.card.replace(/\s/g, '').length < 13) return 'Card number must be at least 13 digits.';
    if (form.expiry.length !== 5) return 'Expiry must be in MM/YY format.';
    if (form.cvc.length !== 3) return 'CVC must be 3 digits.';
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
    if (!isAuthenticated || !token) {
      setError('Please sign in to complete your booking.');
      return;
    }

    setError('');
    setIsPaying(true);

    try {
      const flightItem = cart.items.find((item: any) => item.type === 'flight');
      const hotelItem = cart.items.find((item: any) => item.type === 'hotel');

      const reservationPromises = [];

      if (flightItem) {
        reservationPromises.push(
          fetch(`${BACKEND_URL}/api/reservations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              reservation_type: 'flight',
              provider: flightItem.title || null,
              origin: cart.origin || flightItem.detail?.split('→')[0]?.trim() || 'BEY',
              destination: cart.destination || flightItem.detail?.split('→')[1]?.trim() || '',
              departure_datetime: cart.departureDate ? new Date(cart.departureDate).toISOString() : null,
              passengers: cart.travelers || 1,
              total_amount: flightItem.price || null,
              currency: 'USD',
              cabin_class: null,
              booking_details: {
                cartItem: flightItem,
                passengers: passengers,
                payer: { name: form.name, email: form.email },
                bookedAt: new Date().toISOString(),
              },
            }),
          })
        );
      }

      if (hotelItem) {
        reservationPromises.push(
          fetch(`${BACKEND_URL}/api/reservations`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              reservation_type: 'hotel',
              provider: hotelItem.title || null,
              origin: cart.destination || '',
              destination: cart.destination || '',
              departure_datetime: cart.departureDate ? new Date(cart.departureDate).toISOString() : null,
              arrival_datetime: cart.returnDate ? new Date(cart.returnDate).toISOString() : null,
              passengers: cart.travelers || 1,
              total_amount: hotelItem.price || null,
              currency: 'USD',
              booking_details: {
                cartItem: hotelItem,
                passengers: passengers,
                payer: { name: form.name, email: form.email },
                bookedAt: new Date().toISOString(),
              },
            }),
          })
        );
      }

      const responses = await Promise.all(reservationPromises);
      const failed = responses.find(r => !r.ok);
      if (failed) {
        const errData = await failed.json();
        throw new Error(errData.error || 'Booking failed. Please try again.');
      }

      window.localStorage.removeItem('travelEliteCart');
      window.localStorage.removeItem('travelEliteCartAI');
      window.localStorage.removeItem('travelEliteResults');
      window.localStorage.removeItem('travelElitePlannerData');
      window.dispatchEvent(new Event('storage'));

      setPaid(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsPaying(false);
    }
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
          <button onClick={() => router.back()} className="mt-8 rounded-2xl bg-foreground px-6 py-3 text-sm font-black text-background">
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
          <p className="mt-2 text-sm text-muted-foreground">
            Your booking has been saved to your reservations. Check <a href="/reservations" className="font-black underline underline-offset-2">My Reservations</a> to view your booking details.
          </p>
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
        <button onClick={() => router.back()} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to planner
        </button>

        <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
          <section className="rounded-3xl border border-border bg-card p-6 lg:col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="small-caps">Passenger Details</p>
                <p className="mt-0.5 text-xs font-semibold text-muted-foreground">Please enter names as they appear on passport or travel documents</p>
              </div>
            </div>

            {passengers.map((passenger, index) => {
              const adults = cart?.adults || cart?.travelers || 1;
              const label = index < adults ? 'Adult' : 'Child';

              return (
              <div key={index} className="mb-6 rounded-2xl border border-border bg-background/50 p-5">
                <h3 className="mb-4 text-sm font-black">
                  Passenger {index + 1} ({label})
                </h3>

                {/* Name */}
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">First name</label>
                    <input
                      value={passenger.firstName}
                      onChange={e => updatePassenger(index, 'firstName', e.target.value)}
                      placeholder="First name"
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Last name</label>
                    <input
                      value={passenger.lastName}
                      onChange={e => updatePassenger(index, 'lastName', e.target.value)}
                      placeholder="Last name"
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                    />
                  </div>
                </div>

                {/* Date of birth + Nationality */}
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Date of birth</label>
                    <input
                      value={passenger.dateOfBirth}
                      onChange={e => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                        let formatted = digits;
                        if (digits.length > 4) {
                          formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                        } else if (digits.length > 2) {
                          formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                        }
                        updatePassenger(index, 'dateOfBirth', formatted);
                      }}
                      placeholder="DD/MM/YYYY"
                      maxLength={10}
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Nationality</label>
                    <input
                      value={passenger.nationality}
                      onChange={e => updatePassenger(index, 'nationality', e.target.value)}
                      placeholder="e.g. Lebanese"
                      className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                    />
                  </div>
                </div>

                {/* Gender */}
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Gender</p>
                  <div className="flex gap-3">
                    {(['Male', 'Female'] as const).map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => updatePassenger(index, 'gender', g)}
                        className={`rounded-xl border px-4 py-2 text-xs font-black transition ${
                          passenger.gender === g
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-border bg-background hover:border-foreground'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Passport */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Passport number <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    value={passenger.passportNumber}
                    onChange={e => updatePassenger(index, 'passportNumber', e.target.value)}
                    placeholder="e.g. A12345678"
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                  />
                </div>
              </div>
              );
            })}
          </section>

          <section className="rounded-3xl border border-border bg-card p-6 lg:sticky lg:top-8 lg:self-start">
            {/* Trip Summary */}
            <div className="mb-6">
              <p className="small-caps mb-3">Trip Summary</p>
              <div className="space-y-2">
                {cart.items.map((item: any) => {
                  const Icon = itemIcon(item.type);
                  return (
                    <div key={item.id || item.type} className="flex items-center gap-3 rounded-2xl border border-border bg-background/70 p-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                      <p className="text-xs font-black">{formatMoney(item.price)}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3">
                <p className="text-xs font-black">Total</p>
                <p className="text-sm font-black">{formatMoney(total)}</p>
              </div>
            </div>
            <hr className="mb-6 border-border" />

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="small-caps">Payment</p>
                <h2 className="mt-2 text-4xl font-black text-foreground">{formatMoney(total)}</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground">
                <CreditCard className="h-6 w-6" />
              </div>
            </div>

            <hr className="mt-6 border-border" />

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-muted-foreground">Cardholder name</span>
                <input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Cardholder name" className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-foreground" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-muted-foreground">Email receipt</span>
                <input value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="Email receipt" className="mt-2 w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none transition focus:border-foreground" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-muted-foreground">Card number</span>
                <input
                  value={form.card}
                  onChange={e => {
                    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
                    const formatted = digits.replace(/(.{4})/g, '$1 ').trim();
                    setForm({ ...form, card: formatted });
                  }}
                  placeholder="Card number"
                  inputMode="numeric"
                  maxLength={19}
                  className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                />
              </label>
              <div className="grid grid-cols-2 gap-3 overflow-hidden">
                <label className="block">
                  <span className="text-xs font-bold text-muted-foreground">MM/YY</span>
                  <input
                    value={form.expiry}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                      const formatted = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
                      setForm({ ...form, expiry: formatted });
                    }}
                    placeholder="MM/YY"
                    inputMode="numeric"
                    maxLength={5}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-muted-foreground">CVC</span>
                  <input
                    value={form.cvc}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 3);
                      setForm({ ...form, cvc: digits });
                    }}
                    placeholder="CVC"
                    inputMode="numeric"
                    maxLength={3}
                    className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
                  />
                </label>
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
