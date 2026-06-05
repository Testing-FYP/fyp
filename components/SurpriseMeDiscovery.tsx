'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  Baby,
  CalendarDays,
  Check,
  DollarSign,
  Gauge,
  Hotel,
  Landmark,
  Leaf,
  Loader2,
  MapPin,
  Moon,
  Mountain,
  Plane,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Utensils,
  Users,
  Waves,
} from 'lucide-react';
import AirportAutocomplete from './AirportAutocomplete';
import type { PlannerData } from './TripPlannerWizard';

type SurpriseDestination = {
  city: string;
  country: string;
  iata: string;
  airportName: string;
  matchScore: number;
  headline: string;
  reasons: string[];
  tags: string[];
  bestFor: string;
  estimatedBudget: number;
  flightTimeHint: string;
};

type SurpriseMeDiscoveryProps = {
  onDestinationSelect: (data: Partial<PlannerData>, destination: SurpriseDestination) => void;
};

type InterestOption = {
  id: string;
  label: string;
  icon: any;
  vibe?: PlannerData['vibes'][number];
};

const INTEREST_OPTIONS: InterestOption[] = [
  { id: 'family', label: 'Family friendly', icon: Baby, vibe: 'family_friendly' },
  { id: 'beach', label: 'Beach', icon: Waves, vibe: 'nature_outdoors' },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag, vibe: 'shopping_exploring' },
  { id: 'nature', label: 'Nature', icon: Mountain, vibe: 'nature_outdoors' },
  { id: 'culture', label: 'Culture', icon: Landmark, vibe: 'culture_history' },
  { id: 'food', label: 'Food', icon: Utensils, vibe: 'food_drink' },
  { id: 'nightlife', label: 'Nightlife', icon: Moon, vibe: 'nightlife_entertainment' },
  { id: 'wellness', label: 'Wellness', icon: Leaf, vibe: 'relaxation_wellness' },
];

const REGION_OPTIONS = [
  { id: 'nearby', label: 'Nearby' },
  { id: 'middle_east', label: 'Middle East' },
  { id: 'europe', label: 'Europe' },
  { id: 'asia', label: 'Asia' },
  { id: 'anywhere', label: 'Anywhere' },
];

const CLIMATE_OPTIONS = [
  { id: 'warm', label: 'Warm' },
  { id: 'mild', label: 'Mild' },
  { id: 'cool', label: 'Cool' },
  { id: 'open', label: 'Open' },
];

const PACE_OPTIONS = [
  { id: 'slow', label: 'Slow' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'packed', label: 'Packed' },
];

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function getNights(departureDate: string, returnDate: string) {
  if (!departureDate || !returnDate) return 1;
  const diff = Math.ceil((new Date(returnDate).getTime() - new Date(departureDate).getTime()) / 86400000);
  return Math.max(1, diff || 1);
}

function budgetSplit(totalBudget: number) {
  return {
    totalBudget,
    flightBudget: Math.round(totalBudget * 0.45),
    hotelBudget: Math.round(totalBudget * 0.30),
    transportBudget: Math.round(totalBudget * 0.10),
    dailyExpenseBudget: Math.round(totalBudget * 0.15),
  };
}

function NumberStepper({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted px-4 py-3">
      <span className="text-sm font-bold text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background text-sm font-black text-foreground transition hover:border-foreground/30 disabled:opacity-30"
          aria-label={`Decrease ${label}`}
        >
          -
        </button>
        <span className="min-w-7 text-center font-mono text-lg font-black">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-foreground bg-foreground text-sm font-black text-background transition hover:opacity-80"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function SurpriseMeDiscovery({ onDestinationSelect }: SurpriseMeDiscoveryProps) {
  const [origin, setOrigin] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const [budget, setBudget] = useState('');
  const [region, setRegion] = useState('');
  const [climate, setClimate] = useState('');
  const [pace, setPace] = useState('');
  const [includeFlight, setIncludeFlight] = useState(false);
  const [includeHotel, setIncludeHotel] = useState(false);
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<SurpriseDestination[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nights = getNights(departureDate, returnDate);
  const totalTravelers = adults + children;
  const numericBudget = Number(budget);

  const selectedVibes = useMemo(() => {
    const vibes = selectedInterests
      .map(id => INTEREST_OPTIONS.find(option => option.id === id)?.vibe)
      .filter(Boolean) as PlannerData['vibes'];
    return Array.from(new Set(vibes));
  }, [selectedInterests]);

  const toggleInterest = (id: string) => {
    setSelectedInterests(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const generateDestinations = async () => {
    if (!origin) {
      setError('Choose your departure airport first.');
      return;
    }
    if (!departureDate) {
      setError('Choose a departure date.');
      return;
    }
    if (totalTravelers < 1) {
      setError('Add at least one traveler.');
      return;
    }
    if (!Number.isFinite(numericBudget) || numericBudget < 1) {
      setError('Enter your total budget.');
      return;
    }
    if (!region || !climate || !pace) {
      setError('Choose a region, climate, and pace.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setDestinations([]);

    try {
      const response = await fetch('/api/planner/surprise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin,
          departureDate,
          returnDate,
          adults,
          children,
          budget: numericBudget,
          region,
          climate,
          pace,
          interests: selectedInterests,
          includeFlight,
          includeHotel,
        }),
      });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(json.error || 'Could not generate destination ideas.');
      setDestinations(json.destinations || []);
    } catch (err: any) {
      setError(err?.message || 'Could not generate destination ideas.');
    } finally {
      setIsLoading(false);
    }
  };

  const selectDestination = (destination: SurpriseDestination) => {
    const travelerSafeBudget = Math.max(numericBudget, destination.estimatedBudget || numericBudget);
    onDestinationSelect({
      origin,
      destination: destination.iata,
      tripType: returnDate ? 'round_trip' : 'one_way',
      departureDate,
      returnDate,
      adults,
      children,
      vibes: selectedVibes,
      nights,
      budgetMode: 'total',
      ...budgetSplit(travelerSafeBudget),
    }, destination);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="small-caps">Surprise Me</p>
              <h2 className="mt-2 text-3xl title-text text-foreground">Find somewhere that fits</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Answer the basics and choose from a destination library before the full trip planner runs.
              </p>
            </div>
          </div>

          <div className="mt-7 space-y-6">
            <div className="space-y-3">
              <label className="small-caps ml-1">From</label>
              <AirportAutocomplete value={origin} onSelect={setOrigin} placeholder="Departure airport" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="small-caps ml-1 flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" />Departure</span>
                <input
                  type="date"
                  value={departureDate}
                  min={todayKey()}
                  onChange={event => setDepartureDate(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground outline-none transition focus:border-foreground/30"
                />
              </label>
              <label className="space-y-2">
                <span className="small-caps ml-1 flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" />Return</span>
                <input
                  type="date"
                  value={returnDate}
                  min={departureDate || todayKey()}
                  onChange={event => setReturnDate(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground outline-none transition focus:border-foreground/30"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberStepper label="Adults" value={adults} min={1} onChange={setAdults} />
              <NumberStepper label="Children" value={children} min={0} onChange={setChildren} />
            </div>

            <label className="space-y-2">
              <span className="small-caps ml-1 flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" />Total Budget</span>
              <input
                type="number"
                min={1}
                value={budget}
                onChange={event => setBudget(event.target.value)}
                placeholder="Enter total budget in USD"
                className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground outline-none transition focus:border-foreground/30"
              />
            </label>

            <div className="space-y-3">
              <p className="small-caps ml-1">What matters?</p>
              <div className="grid grid-cols-2 gap-2">
                {INTEREST_OPTIONS.map(option => {
                  const selected = selectedInterests.includes(option.id);
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleInterest(option.id)}
                      className={`flex items-center gap-2 rounded-2xl border px-3 py-3 text-left text-xs font-black uppercase tracking-[0.1em] transition ${
                        selected
                          ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/15'
                          : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{option.label}</span>
                      {selected ? <Check className="ml-auto h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <OptionGroup label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
              <OptionGroup label="Climate" value={climate} onChange={setClimate} options={CLIMATE_OPTIONS} />
              <OptionGroup label="Pace" value={pace} onChange={setPace} options={PACE_OPTIONS} icon={Gauge} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleButton active={includeFlight} onClick={() => setIncludeFlight(prev => !prev)} icon={Plane} label="Flights" />
              <ToggleButton active={includeHotel} onClick={() => setIncludeHotel(prev => !prev)} icon={Hotel} label="Hotels" />
            </div>

            {error ? (
              <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-300">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={generateDestinations}
              disabled={isLoading}
              className="btn-primary flex w-full items-center justify-center gap-3 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span>{isLoading ? 'Finding options' : 'Generate destination library'}</span>
            </button>
          </div>
        </section>

        <section className="min-h-[520px]">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="grid gap-4"
              >
                {[0, 1, 2].map(item => (
                  <div key={item} className="h-40 animate-pulse rounded-3xl border border-border bg-muted" />
                ))}
              </motion.div>
            ) : destinations.length ? (
              <motion.div
                key="results"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="small-caps">Destination Library</p>
                    <h3 className="mt-2 text-3xl title-text text-foreground">Choose your surprise</h3>
                  </div>
                  <button
                    type="button"
                    onClick={generateDestinations}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </button>
                </div>
                <div className="grid gap-4">
                  {destinations.map(destination => (
                    <DestinationCard key={`${destination.iata}-${destination.city}`} destination={destination} onSelect={selectDestination} />
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="flex min-h-[520px] items-center justify-center rounded-3xl border border-dashed border-border bg-muted/40 p-8 text-center"
              >
                <div className="max-w-sm">
                  <MapPin className="mx-auto h-9 w-9 text-muted-foreground" />
                  <h3 className="mt-4 text-2xl title-text text-foreground">Your destination library will appear here</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    The best options include airport codes, fit reasons, budget hints, and the next step back into the planner.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

function OptionGroup({ label, value, onChange, options, icon: Icon }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; label: string }[]; icon?: any }) {
  return (
    <div className="space-y-2">
      <p className="small-caps ml-1 flex items-center gap-2">{Icon ? <Icon className="h-3.5 w-3.5" /> : null}{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${
              value === option.id
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-black transition ${
        active
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      }`}
    >
      <span className="flex items-center gap-2"><Icon className="h-4 w-4" />{label}</span>
      {active ? <Check className="h-4 w-4" /> : null}
    </button>
  );
}

function DestinationCard({ destination, onSelect }: { destination: SurpriseDestination; onSelect: (destination: SurpriseDestination) => void }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-black text-emerald-700 dark:text-emerald-300">
              {destination.matchScore}% match
            </span>
            <span className="rounded-xl border border-border bg-muted px-3 py-1.5 text-sm font-black text-foreground">
              {destination.iata}
            </span>
          </div>
          <h4 className="mt-4 text-3xl title-text leading-tight text-foreground">{destination.city}</h4>
          <p className="text-sm font-bold text-muted-foreground">{destination.country} / {destination.airportName}</p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{destination.headline}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-2xl title-text text-foreground">${destination.estimatedBudget.toLocaleString()}</p>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">estimated total</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {destination.reasons.slice(0, 3).map(reason => (
          <div key={reason} className="rounded-2xl border border-border bg-muted p-3 text-xs font-semibold leading-relaxed text-muted-foreground">
            {reason}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-bold text-foreground">{destination.bestFor}</p>
          <p className="text-xs font-semibold text-muted-foreground">{destination.flightTimeHint}</p>
          <div className="flex flex-wrap gap-2">
            {destination.tags.slice(0, 5).map(tag => (
              <span key={tag} className="rounded-full border border-border bg-background px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSelect(destination)}
          className="btn-primary inline-flex items-center justify-center gap-2 px-6 py-3"
        >
          Choose
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
