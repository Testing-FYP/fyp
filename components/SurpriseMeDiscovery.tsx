'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { useTranslations } from 'next-intl';
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
  labelKey: string;
  icon: any;
  vibe?: PlannerData['vibes'][number];
};

const INTEREST_OPTIONS: InterestOption[] = [
  { id: 'family', labelKey: 'interests.family', icon: Baby, vibe: 'family_friendly' },
  { id: 'beach', labelKey: 'interests.beach', icon: Waves, vibe: 'nature_outdoors' },
  { id: 'shopping', labelKey: 'interests.shopping', icon: ShoppingBag, vibe: 'shopping_exploring' },
  { id: 'nature', labelKey: 'interests.nature', icon: Mountain, vibe: 'nature_outdoors' },
  { id: 'culture', labelKey: 'interests.culture', icon: Landmark, vibe: 'culture_history' },
  { id: 'food', labelKey: 'interests.food', icon: Utensils, vibe: 'food_drink' },
  { id: 'nightlife', labelKey: 'interests.nightlife', icon: Moon, vibe: 'nightlife_entertainment' },
  { id: 'wellness', labelKey: 'interests.wellness', icon: Leaf, vibe: 'relaxation_wellness' },
];

const REGION_OPTIONS = [
  { id: 'nearby', labelKey: 'regions.nearby' },
  { id: 'middle_east', labelKey: 'regions.middleEast' },
  { id: 'europe', labelKey: 'regions.europe' },
  { id: 'asia', labelKey: 'regions.asia' },
  { id: 'anywhere', labelKey: 'regions.anywhere' },
];

const CLIMATE_OPTIONS = [
  { id: 'warm', labelKey: 'climates.warm' },
  { id: 'mild', labelKey: 'climates.mild' },
  { id: 'cool', labelKey: 'climates.cool' },
  { id: 'open', labelKey: 'climates.open' },
];

const PACE_OPTIONS = [
  { id: 'slow', labelKey: 'paces.slow' },
  { id: 'balanced', labelKey: 'paces.balanced' },
  { id: 'packed', labelKey: 'paces.packed' },
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

function NumberStepper({ label, value, min, onChange, decreaseLabel, increaseLabel }: { label: string; value: number; min: number; onChange: (value: number) => void; decreaseLabel: string; increaseLabel: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-muted px-4 py-3">
      <span className="text-sm font-bold text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background text-sm font-black text-foreground transition hover:border-foreground/30 disabled:opacity-30"
          aria-label={decreaseLabel}
        >
          -
        </button>
        <span className="min-w-7 text-center font-mono text-lg font-black">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-foreground bg-foreground text-sm font-black text-background transition hover:opacity-80"
          aria-label={increaseLabel}
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function SurpriseMeDiscovery({ onDestinationSelect }: SurpriseMeDiscoveryProps) {
  const t = useTranslations('surprise');
  const [today, setToday] = useState('');
  const [origin, setOrigin] = useState('');
  const [autocompleteSource, setAutocompleteSource] = useState<'serpapi' | 'duffel'>('serpapi');
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

  useEffect(() => {
    setToday(todayKey());
  }, []);

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
      setError(t('errors.chooseDepartureAirport'));
      return;
    }
    if (!departureDate) {
      setError(t('errors.chooseDepartureDate'));
      return;
    }
    if (totalTravelers < 1) {
      setError(t('errors.addTraveler'));
      return;
    }
    if (!Number.isFinite(numericBudget) || numericBudget < 1) {
      setError(t('errors.enterBudget'));
      return;
    }
    if (!region || !climate || !pace) {
      setError(t('errors.chooseRegionClimatePace'));
      return;
    }

    setIsLoading(true);
    setError(null);
    setDestinations([]);

    try {
      const response = await fetch('/api/surprise', {
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
      if (!response.ok || json.error) throw new Error(json.error || t('errors.generateFailed'));
      setDestinations(json.destinations || []);
    } catch (err: any) {
      setError(err?.message || t('errors.generateFailed'));
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
              <p className="small-caps">{t('form.badge')}</p>
              <h2 className="mt-2 text-3xl title-text text-foreground">{t('form.title')}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t('form.description')}
              </p>
            </div>
          </div>

          <div className="mt-7 space-y-6">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Autocomplete</span>
              <div className="flex rounded-xl border border-border bg-background p-1">
                {(['serpapi', 'duffel'] as const).map(source => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => setAutocompleteSource(source)}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition ${
                      autocompleteSource === source ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {source === 'serpapi' ? 'SerpAPI' : 'Duffel'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="small-caps ml-1">{t('form.from')}</label>
              <AirportAutocomplete
                value={origin}
                onSelect={setOrigin}
                placeholder={t('form.departureAirport')}
                source={autocompleteSource}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="small-caps ml-1 flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" />{t('form.departure')}</span>
                <input
                  type="date"
                  value={departureDate}
                  min={today}
                  onChange={event => setDepartureDate(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground outline-none transition focus:border-foreground/30"
                />
              </label>
              <label className="space-y-2">
                <span className="small-caps ml-1 flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5" />{t('form.return')}</span>
                <input
                  type="date"
                  value={returnDate}
                  min={departureDate || today}
                  onChange={event => setReturnDate(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground outline-none transition focus:border-foreground/30"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberStepper label={t('form.adults')} value={adults} min={1} onChange={setAdults} decreaseLabel={t('actions.decrease', { label: t('form.adults') })} increaseLabel={t('actions.increase', { label: t('form.adults') })} />
              <NumberStepper label={t('form.children')} value={children} min={0} onChange={setChildren} decreaseLabel={t('actions.decrease', { label: t('form.children') })} increaseLabel={t('actions.increase', { label: t('form.children') })} />
            </div>

            <label className="space-y-2">
              <span className="small-caps ml-1 flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" />{t('form.totalBudget')}</span>
              <input
                type="number"
                min={1}
                value={budget}
                onChange={event => setBudget(event.target.value)}
                placeholder={t('form.budgetPlaceholder')}
                className="w-full rounded-2xl border border-border bg-muted px-4 py-3 text-sm font-semibold text-foreground outline-none transition focus:border-foreground/30"
              />
            </label>

            <div className="space-y-3">
              <p className="small-caps ml-1">{t('form.whatMatters')}</p>
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
                      <span>{t(option.labelKey)}</span>
                      {selected ? <Check className="ml-auto h-3.5 w-3.5 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3">
              <OptionGroup label={t('form.region')} value={region} onChange={setRegion} options={REGION_OPTIONS} t={t} />
              <OptionGroup label={t('form.climate')} value={climate} onChange={setClimate} options={CLIMATE_OPTIONS} t={t} />
              <OptionGroup label={t('form.pace')} value={pace} onChange={setPace} options={PACE_OPTIONS} icon={Gauge} t={t} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ToggleButton active={includeFlight} onClick={() => setIncludeFlight(prev => !prev)} icon={Plane} label={t('form.flights')} />
              <ToggleButton active={includeHotel} onClick={() => setIncludeHotel(prev => !prev)} icon={Hotel} label={t('form.hotels')} />
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
              <span>{isLoading ? t('actions.findingOptions') : t('actions.generateLibrary')}</span>
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
                    <p className="small-caps">{t('results.badge')}</p>
                    <h3 className="mt-2 text-3xl title-text text-foreground">{t('results.title')}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={generateDestinations}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('actions.refresh')}
                  </button>
                </div>
                <div className="grid gap-4">
                  {destinations.map(destination => (
                    <DestinationCard key={`${destination.iata}-${destination.city}`} destination={destination} onSelect={selectDestination} matchLabel={t('results.match')} estimatedTotalLabel={t('results.estimatedTotal')} chooseLabel={t('actions.choose')} />
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
                  <h3 className="mt-4 text-2xl title-text text-foreground">{t('results.emptyTitle')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t('results.emptyDescription')}
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

function OptionGroup({ label, value, onChange, options, icon: Icon, t }: { label: string; value: string; onChange: (value: string) => void; options: { id: string; labelKey: string }[]; icon?: any; t: ReturnType<typeof useTranslations<'surprise'>> }) {
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
            {t(option.labelKey)}
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

function DestinationCard({ destination, onSelect, matchLabel, estimatedTotalLabel, chooseLabel }: { destination: SurpriseDestination; onSelect: (destination: SurpriseDestination) => void; matchLabel: string; estimatedTotalLabel: string; chooseLabel: string }) {
  return (
    <article className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-sm font-black text-emerald-700 dark:text-emerald-300">
              {destination.matchScore}% {matchLabel}
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
          <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">{estimatedTotalLabel}</p>
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
          {chooseLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
