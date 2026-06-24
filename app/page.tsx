'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Compass, Sparkles, RotateCcw } from 'lucide-react';
import TripPlannerWizard, { PlannerData } from '@/components/TripPlannerWizard';
import TripPlannerResults from '@/components/TripPlannerResults';
import SurpriseMeDiscovery from '@/components/SurpriseMeDiscovery';
import Image from 'next/image';
import planeLoadingImage from './image.png';
import { useCurrency } from '@/context/CurrencyContext';
import DataSourcePanel, { useDataSource } from '@/components/DataSourcePanel';

const GENERATOR_TRANSPORT_TYPES = [
  'metro_subway',
  'train',
  'public_bus',
  'taxi',
  'rideshare_uber',
  'rental_car',
];

function TripGenerationLoading({ isComplete }: { isComplete: boolean }) {
  const [percent, setPercent] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPercent(current => Math.min(90, current + 0.8 + Math.random() * 1.4));
    }, 120);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isComplete) setPercent(100);
  }, [isComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-muted shadow-2xl shadow-foreground/10"
      role="status"
      aria-live="polite"
    >
      <div className="relative aspect-[16/9] min-h-[320px] overflow-hidden bg-foreground/5">
        <motion.div
          className="absolute inset-0 scale-110"
          animate={{ x: ['-2%', '2%', '-2%'], y: ['1%', '-1%', '1%'], scale: [1.08, 1.13, 1.08] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Image
            src={planeLoadingImage}
            alt="Plane flying above the clouds"
            fill
            priority
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 896px"
          />
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-6 pb-8 text-center">
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-background/20 bg-background/90 text-foreground shadow-xl"
          >
            <Sparkles className="h-5 w-5" />
          </motion.div>
          <h2 className="title-text text-4xl text-foreground md:text-5xl">Preparing Your Trip</h2>
          <p className="mt-2 text-4xl font-bold tabular-nums text-foreground">{Math.round(percent)}%</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Matching flights, stays, transport, and activities into one overview.
          </p>
          <div className="mx-auto mt-6 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-foreground/10">
            <motion.div
              className="h-full w-1/2 rounded-full bg-foreground"
              animate={{ x: ['-110%', '220%'] }}
              transition={{ duration: 1.35, repeat: Infinity, ease: [0.76, 0, 0.24, 1] }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function Home() {
  const { convertFromUSD } = useCurrency();
  const { mockSource } = useDataSource();
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpselling, setIsUpselling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plannerData, setPlannerData] = useState<PlannerData | null>(null);
  const [editStep, setEditStep] = useState<number>(0);
  const [plannerMode, setPlannerMode] = useState<'classic' | 'surprise'>('classic');
  const [hasMounted, setHasMounted] = useState(false);
  const [budgetOverview, setBudgetOverview] = useState<{
    flights: number; hotel: number; transport: number; places: number;
    total: number; remaining: number; isOverBudget: boolean; isDetailedMode: boolean;
  } | null>(null);

  useEffect(() => {
    try {
      const savedResults = localStorage.getItem('travelEliteResults');
      const savedPlannerData = localStorage.getItem('travelElitePlannerData');
      if (savedResults) setResults(JSON.parse(savedResults));
      if (savedPlannerData) setPlannerData(JSON.parse(savedPlannerData));
    } catch { /* ignore */ }
    setHasMounted(true);
  }, []);

  const resultsRef = useRef<HTMLDivElement>(null);

  const attachPrefetchedTransport = (json: any, data: PlannerData) => {
    if (!data.transportOptions?.length) return json;
    if (Array.isArray(json?.transport) && json.transport.length > 0) {
      return {
        ...json,
        transportDataSource: json.transportDataSource || data.transportDataSource,
      };
    }
    return {
      ...json,
      transport: data.transportOptions,
      transportDataSource: data.transportDataSource,
    };
  };

  const buildGeneratePayload = (data: PlannerData) => ({
    origin: data.origin,
    destination: data.destination,
    tripType: data.tripType,
    departureDate: data.departureDate,
    returnDate: data.returnDate,
    adults: data.adults,
    children: data.children,
    includeFlight: data.includeFlight,
    budgetMode: data.budgetMode,
    budgetMin: data.budgetMin,
    budgetMax: data.budgetMax,
    totalBudget: data.totalBudget,
    flightBudget: data.flightBudget,
    hotelBudget: data.hotelBudget,
    transportBudget: data.transportBudget,
    dailyExpenseBudget: data.dailyExpenseBudget,
    includePlaceVisits: data.includePlaceVisits,
    dailyCategories: data.includePlaceVisits ? data.dailyCategories : [],
    budgetFlightCabins: data.includeFlight ? data.budgetFlightCabins : [],
    budgetHotelStars: data.includeHotel ? data.budgetHotelStars : [],
    includeHotel: data.includeHotel,
    hotelStars: data.includeHotel ? data.hotelStars : undefined,
    hotelRooms: data.includeHotel ? data.hotelRooms : undefined,
    hotelRoomsPerApartment: data.includeHotel ? data.hotelRoomsPerApartment : undefined,
    nights: data.nights,
    includeTransport: data.includeTransport,
    transportTypes: data.includeTransport ? GENERATOR_TRANSPORT_TYPES : [],
    transportBudgetSelections: data.includeTransport ? data.transportBudgetSelections : undefined,
    vibes: data.vibes,
    destinationCity: data.destinationCity,
    destinationCountry: data.destinationCountry,
    destinationCountryCode: data.destinationCountryCode,
    transportOptions: data.includeTransport ? data.transportOptions : undefined,
    transportDataSource: data.includeTransport ? data.transportDataSource : undefined,
  });

  const handleComplete = async (plannerData: PlannerData) => {
    setIsLoading(true);
    setError(null);
    setPlannerData(plannerData);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildGeneratePayload(plannerData), mockSource }),
      });
      const json = await res.json();

      if (json.error) throw new Error(json.error);

      const generatedResults = attachPrefetchedTransport(json, plannerData);
      setResults(generatedResults);
      localStorage.setItem('travelEliteResults', JSON.stringify(generatedResults));
      localStorage.setItem('travelElitePlannerData', JSON.stringify(plannerData));

      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpsell = async (extraBudget: number) => {
    if (!plannerData) return;
    setIsUpselling(true);

    const updatedData = {
      ...plannerData,
      budgetMax: plannerData.totalBudget + extraBudget,
      totalBudget: plannerData.totalBudget + extraBudget,
      flightBudget: plannerData.flightBudget + Math.round(extraBudget * 0.45),
      hotelBudget: plannerData.hotelBudget + Math.round(extraBudget * 0.30),
      transportBudget: plannerData.transportBudget + Math.round(extraBudget * 0.10),
      dailyExpenseBudget: plannerData.dailyExpenseBudget + Math.round(extraBudget * 0.15),
    };

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...buildGeneratePayload(updatedData), mockSource }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResults(attachPrefetchedTransport(json, updatedData));
      setPlannerData(updatedData);

      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 200);
    } catch (err: any) {
      console.error('Upsell error:', err);
    } finally {
      setIsUpselling(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('travelEliteResults');
    localStorage.removeItem('travelElitePlannerData');
    localStorage.removeItem('travelEliteCart');
    localStorage.removeItem('travelEliteCartAI');
    window.dispatchEvent(new Event('storage'));
    setResults(null);
    setPlannerData(null);
    setEditStep(0);
    setPlannerMode('classic');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateToStep = (stepIndex: number) => {
    setEditStep(stepIndex);
    setPlannerMode('classic');
    setResults(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSurpriseDestination = (data: Partial<PlannerData>) => {
    setPlannerData(prev => ({
      ...(prev || {}),
      ...data,
    } as PlannerData));
    setEditStep(7);
    setPlannerMode('classic');
    setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className="min-h-screen bg-background">
      <DataSourcePanel />
      {/* Hero */}
      <section className="relative min-h-[50vh] flex flex-col items-center justify-center pt-28 pb-16 px-6">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background z-10" />
          <Image
            src="https://images.unsplash.com/photo-1488085061387-422e29b40080?q=80&w=2070&auto=format&fit=crop"
            alt="AI Trip Planner"
            fill
            priority
            className="object-cover opacity-50 dark:opacity-30"
            referrerPolicy="no-referrer"
          />
        </div>

        <div className="relative z-20 text-center w-full max-w-3xl mx-auto space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="p-2.5 rounded-2xl bg-foreground/10 backdrop-blur-xl border border-foreground/10">
                <Sparkles className="w-6 h-6 text-foreground" />
              </div>
              <span className="small-caps tracking-[0.3em] text-foreground/60">Powered by AI</span>
            </div>
            <h1 className="text-6xl md:text-8xl title-text leading-[0.9] mb-4 text-foreground">
              Plan Your <br />
              <span className="italic font-light">Dream Trip</span>
            </h1>
            <p className="text-muted-foreground text-sm font-light max-w-lg mx-auto leading-relaxed mt-6">
              Answer a few questions and our AI concierge will craft a personalized travel plan — with flights, hotels, activities, and a smart budget breakdown.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Wizard or Results */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        {!hasMounted ? (
          <div className="mx-auto h-[640px] w-full max-w-3xl rounded-3xl border border-border bg-muted/40" aria-hidden="true" />
        ) : !results ? (
          <div>
            {!isLoading && (
              <div className="mx-auto mb-12 flex w-full max-w-xl rounded-2xl border border-border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setPlannerMode('classic')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition ${
                    plannerMode === 'classic'
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  }`}
                >
                  <Compass className="h-4 w-4" />
                  Build My Trip
                </button>
                <button
                  type="button"
                  onClick={() => setPlannerMode('surprise')}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase tracking-[0.14em] transition ${
                    plannerMode === 'surprise'
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  }`}
                >
                  <Sparkles className="h-4 w-4" />
                  Surprise Me
                </button>
              </div>
            )}

            {isLoading ? (
              <TripGenerationLoading isComplete={!isLoading} />
            ) : plannerMode === 'classic' ? (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_672px_minmax(0,1fr)] gap-8 items-start">
                <div className="hidden xl:block" />
                <div className="w-full xl:w-[672px] min-w-0">
                  <TripPlannerWizard onComplete={handleComplete} isLoading={isLoading} initialStep={editStep} initialData={plannerData || undefined} onBudgetOverviewChange={setBudgetOverview} />
                </div>
                {budgetOverview?.isDetailedMode ? (
                  <div className="hidden xl:block sticky top-28 self-start w-72 rounded-3xl border border-border bg-muted/95 backdrop-blur-sm p-7 space-y-3 shadow-xl">
                      <div className="text-xs uppercase tracking-[0.2em] font-bold text-muted-foreground mb-3">Budget Overview</div>
                      {[
                        { label: 'Flights', value: budgetOverview.flights },
                        { label: 'Hotel', value: budgetOverview.hotel },
                        { label: 'Transport', value: budgetOverview.transport },
                        { label: 'Places', value: budgetOverview.places },
                      ].map(row => (
                        <div key={row.label} className={`flex justify-between items-center text-base font-medium ${row.value === 0 ? 'opacity-35 line-through' : ''}`}>
                          <span>{row.label}</span>
                          <span className="font-mono font-bold">{convertFromUSD(row.value)}</span>
                        </div>
                      ))}
                      <div className="border-t border-border pt-3 mt-1 space-y-1">
                        <div className="flex justify-between text-base text-muted-foreground">
                          <span>Total used</span>
                          <span className="font-mono font-bold text-foreground">{convertFromUSD(budgetOverview.total)}</span>
                        </div>
                        <div className={`flex justify-between text-base font-bold ${budgetOverview.isOverBudget ? 'text-red-500' : 'text-green-600'}`}>
                          <span>{budgetOverview.isOverBudget ? 'Over budget' : 'Remaining'}</span>
                          <span className="font-mono">{budgetOverview.isOverBudget ? '-' : '+'}{convertFromUSD(Math.abs(budgetOverview.remaining))}</span>
                        </div>
                      </div>
                      {budgetOverview.isOverBudget ? (
                        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500 leading-relaxed">
                          You are {convertFromUSD(Math.abs(budgetOverview.remaining))} over your budget.
                        </div>
                      ) : budgetOverview.total > 0 ? (
                        <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-700 dark:text-green-400 leading-relaxed">
                          Within budget. {convertFromUSD(budgetOverview.remaining)} still unallocated.
                        </div>
                      ) : null}
                  </div>
                ) : (
                  <div className="hidden xl:block" />
                )}
              </div>
            ) : (
              <SurpriseMeDiscovery onDestinationSelect={handleSurpriseDestination} />
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto mt-8 max-w-2xl p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-center text-sm"
              >
                {error}
              </motion.div>
            )}
          </div>
        ) : (
          <div ref={resultsRef}>
            <div className="flex items-center justify-between mb-16">
              <div>
                <h2 className="text-4xl title-text text-foreground">Your Trip Plan</h2>
                <p className="text-muted-foreground text-sm font-light mt-1">
                  {plannerData?.origin} → {plannerData?.destination}
                </p>
              </div>
              <button onClick={handleReset}
                className="flex items-center gap-2 px-6 py-3 rounded-full border border-border text-xs uppercase tracking-[0.15em] font-bold text-muted-foreground hover:border-foreground/30 hover:text-foreground transition-all">
                <RotateCcw className="w-4 h-4" />
                Start Over
              </button>
            </div>

            <TripPlannerResults results={results} onUpsell={handleUpsell} isUpselling={isUpselling} selectedVibes={plannerData?.vibes} plannerData={plannerData} onNavigateToStep={handleNavigateToStep} />
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-center md:text-left">
          <div className="title-text text-2xl tracking-widest font-bold">TRAVEL ELITE</div>
          <div className="text-muted-foreground/60 text-[10px] uppercase tracking-widest font-bold">
            © 2026 TRAVEL ELITE. ALL RIGHTS RESERVED.
          </div>
        </div>
      </footer>
    </main>
  );
}
