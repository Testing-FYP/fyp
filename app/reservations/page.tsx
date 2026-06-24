'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useAuth, BACKEND_URL } from '@/hooks/useAuth';
import { PlaneTakeoff, Hotel, Bus, ArrowLeft, Calendar, Tag, BanknoteIcon, XCircle, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

interface Reservation {
  id: string; trip_title?: string; reservation_type: string;
  provider?: string; provider_booking_ref?: string;
  origin: string; destination: string;
  departure_datetime?: string; arrival_datetime?: string;
  passengers: number; total_amount?: number; currency?: string;
  cabin_class?: string; status: string; created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; style: string }> = {
  confirmed: { label: 'Confirmed', icon: CheckCircle, style: 'bg-green-500/10 text-green-400 border border-green-500/20' },
  pending:   { label: 'Pending',   icon: Clock,        style: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' },
  cancelled: { label: 'Cancelled', icon: XCircle,      style: 'bg-red-500/10 text-red-400 border border-red-500/20' },
};

const TYPE_ICONS: Record<string, any> = { flight: PlaneTakeoff, hotel: Hotel, bus: Bus };

export default function ReservationsPage() {
  const { isAuthenticated, isLoading: authLoading, token } = useAuth();
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/auth');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/api/reservations`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setReservations(data.reservations || []); setIsLoading(false); })
      .catch(() => {
        setIsLoading(false);
        toast.error('Could not load your reservations.');
      });
  }, [token]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full" />
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background pt-24 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Planner
          </button>
          <div className="flex items-center gap-3 text-muted-foreground mb-2">
            <BanknoteIcon className="w-5 h-5" />
            <span className="small-caps tracking-widest">Booking History</span>
          </div>
          <h1 className="text-5xl title-text">My Reservations</h1>
          <p className="text-muted-foreground text-sm mt-2 font-light">
            {reservations.length} {reservations.length === 1 ? 'reservation' : 'reservations'} total
          </p>
        </motion.div>

        {/* Empty state */}
        {reservations.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-center py-32 space-y-6">
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center border border-border mx-auto">
              <PlaneTakeoff className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-3xl title-text mb-2">No reservations yet</h3>
              <p className="text-muted-foreground text-sm font-light">When you book a flight, hotel, or bus, it will appear here.</p>
            </div>
            <button onClick={() => router.push('/')}
              className="px-8 py-4 bg-foreground text-background rounded-2xl text-sm small-caps tracking-wider hover:opacity-90 transition-all">
              Search & Book
            </button>
          </motion.div>
        )}

        {/* Reservation Cards */}
        <div className="grid gap-6">
          <AnimatePresence>
            {reservations.map((res, i) => {
              const Icon = TYPE_ICONS[res.reservation_type] || PlaneTakeoff;
              const sc = STATUS_CONFIG[res.status] || STATUS_CONFIG.pending;
              const StatusIcon = sc.icon;
              return (
                <motion.div key={res.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-3xl p-6 hover:border-foreground/20 transition-all group">

                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center flex-shrink-0 group-hover:bg-foreground group-hover:text-background transition-all duration-300">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="text-lg font-medium">
                            {res.reservation_type === 'flight'
                              ? `${res.origin} → ${res.destination?.split(',')[0]?.trim() || res.destination}`
                              : res.destination}
                          </h3>
                          <span className={`text-xs px-3 py-1 rounded-full small-caps tracking-wider flex items-center gap-1 ${sc.style}`}>
                            <StatusIcon className="w-3 h-3" /> {sc.label}
                          </span>
                        </div>

                        {res.provider && (
                          <p className="text-sm text-muted-foreground mb-3">
                            {res.provider}
                            {res.provider_booking_ref && <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-lg font-mono">{res.provider_booking_ref}</span>}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border small-caps tracking-wider">
                            {res.reservation_type}
                          </span>
                          {res.cabin_class && (
                            <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border">
                              {res.cabin_class}
                            </span>
                          )}
                          {res.departure_datetime && (
                            <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(res.departure_datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                          {res.total_amount && (
                            <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                              <Tag className="w-3 h-3" /> {res.currency} {Number(res.total_amount).toLocaleString()}
                            </span>
                          )}
                        </div>

                        {res.trip_title && (
                          <p className="mt-3 text-xs text-muted-foreground">Trip: <span className="text-foreground">{res.trip_title}</span></p>
                        )}
                      </div>
                    </div>

                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </main>
  );
}
