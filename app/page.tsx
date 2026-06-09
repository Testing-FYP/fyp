'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Compass, Sparkles, RotateCcw } from 'lucide-react';
import TripPlannerWizard, { PlannerData } from '@/components/TripPlannerWizard';
import TripPlannerResults from '@/components/TripPlannerResults';
import SurpriseMeDiscovery from '@/components/SurpriseMeDiscovery';
import Image from 'next/image';

const GENERATOR_TRANSPORT_TYPES = [
  'metro_subway',
  'train',
  'public_bus',
  'taxi',
  'rideshare_uber',
  'rental_car',
];

export default function Home() {
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUpselling, setIsUpselling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plannerData, setPlannerData] = useState<PlannerData | null>(null);
  const [editStep, setEditStep] = useState<number>(0);
  const [plannerMode, setPlannerMode] = useState<'classic' | 'surprise'>('classic');

  useEffect(() => {
    try {
      const savedResults = localStorage.getItem('travelEliteResults');
      const savedPlannerData = localStorage.getItem('travelElitePlannerData');
      if (savedResults) setResults(JSON.parse(savedResults));
      if (savedPlannerData) setPlannerData(JSON.parse(savedPlannerData));
    } catch { /* ignore */ }
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
    budgetFlightCabins: data.includeFlight ? data.budgetFlightCabins : [],
    budgetHotelStars: data.includeHotel ? data.budgetHotelStars : [],
    includeHotel: data.includeHotel,
    hotelStars: data.includeHotel ? data.hotelStars : undefined,
    hotelRooms: data.includeHotel ? data.hotelRooms : undefined,
    hotelRoomsPerApartment: data.includeHotel ? data.hotelRoomsPerApartment : undefined,
    nights: data.nights,
    includeTransport: data.includeTransport,
    transportTypes: data.includeTransport ? GENERATOR_TRANSPORT_TYPES : [],
    vibes: data.vibes,
    destinationStates: data.destinationStates,
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
        body: JSON.stringify(buildGeneratePayload(plannerData)),
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
        body: JSON.stringify(buildGeneratePayload(updatedData)),
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
        {!results ? (
          <div>
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

            {plannerMode === 'classic' ? (
              <div className="max-w-2xl mx-auto">
                <TripPlannerWizard onComplete={handleComplete} isLoading={isLoading} initialStep={editStep} initialData={plannerData || undefined} />
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
