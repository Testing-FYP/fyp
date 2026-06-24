'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useAuth, BACKEND_URL } from '@/hooks/useAuth';
import { PlaneTakeoff, MapPin, Calendar, Users, Trash2, ArrowLeft, Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface Trip {
  id: string; title: string; origin: string; destination: string;
  departure_date: string; return_date?: string; passengers: number;
  trip_type: string; status: string; notes?: string;
  total_amount?: number; currency?: string; created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  planned:   'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  booked:    'bg-green-500/10 text-green-400 border border-green-500/20',
  completed: 'bg-muted text-muted-foreground border border-border',
  cancelled: 'bg-red-500/10 text-red-400 border border-red-500/20',
};

const TYPE_ICONS: Record<string, any> = {
  flight: PlaneTakeoff,
  hotel: MapPin,
  bus: MapPin,
  bundle: PlaneTakeoff,
};

export default function TripsPage() {
  const { isAuthenticated, isLoading: authLoading, token } = useAuth();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/auth');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/api/trips`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setTrips(data.trips || []); setIsLoading(false); })
      .catch(() => {
        setIsLoading(false);
        toast.error('Could not load your trips.');
      });
  }, [token]);

  const handleDelete = async (id: string) => {
    if (!token) return;
    setDeletingId(id);
    const res = await fetch(`${BACKEND_URL}/api/trips/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setTrips(t => t.filter(x => x.id !== id));
    setDeletingId(null);
  };

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
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </button>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 text-muted-foreground mb-2">
                <PlaneTakeoff className="w-5 h-5" />
                <span className="small-caps tracking-widest">Saved Journeys</span>
              </div>
              <h1 className="text-5xl title-text">My Trips</h1>
              <p className="text-muted-foreground text-sm mt-2 font-light">
                {trips.length} {trips.length === 1 ? 'trip' : 'trips'} saved
              </p>
            </div>
            <button onClick={() => router.push('/')}
              className="flex items-center gap-2 px-5 py-3 border border-border rounded-2xl text-sm small-caps tracking-wider hover:bg-muted transition-colors">
              <Plus className="w-4 h-4" /> Plan New Trip
            </button>
          </div>
        </motion.div>

        {/* Empty state */}
        {trips.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="text-center py-32 space-y-6">
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center border border-border mx-auto">
              <PlaneTakeoff className="w-10 h-10 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-3xl title-text mb-2">No trips yet</h3>
              <p className="text-muted-foreground text-sm font-light">Search for flights and save them to see them here.</p>
            </div>
            <button onClick={() => router.push('/')}
              className="px-8 py-4 bg-foreground text-background rounded-2xl text-sm small-caps tracking-wider hover:opacity-90 transition-all">
              Start Exploring
            </button>
          </motion.div>
        )}

        {/* Trip Cards */}
        <div className="grid gap-6">
          <AnimatePresence>
            {trips.map((trip, i) => {
              const Icon = TYPE_ICONS[trip.trip_type] || PlaneTakeoff;
              return (
                <motion.div key={trip.id}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card border border-border rounded-3xl p-6 hover:border-foreground/20 transition-all group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-muted border border-border flex items-center justify-center flex-shrink-0 group-hover:bg-foreground group-hover:text-background transition-all duration-300">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium mb-1">{trip.title}</h3>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" /> {trip.origin} → {trip.destination}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className={`text-xs px-3 py-1 rounded-full small-caps tracking-wider ${STATUS_STYLES[trip.status]}`}>
                            {trip.status}
                          </span>
                          <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border small-caps tracking-wider">
                            {trip.trip_type}
                          </span>
                          <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(trip.departure_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                            <Users className="w-3 h-3" /> {trip.passengers} pax
                          </span>
                          {trip.total_amount && (
                            <span className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                              <Tag className="w-3 h-3" /> {trip.currency} {Number(trip.total_amount).toLocaleString()}
                            </span>
                          )}
                        </div>
                        {trip.notes && (
                          <p className="mt-3 text-xs text-muted-foreground font-light italic">{trip.notes}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(trip.id)} disabled={deletingId === trip.id}
                      className="p-2.5 rounded-xl border border-border text-muted-foreground hover:border-red-500/40 hover:text-red-400 transition-all flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
