'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Calendar as CalendarIcon, Users, Plane, DollarSign, Hotel, Bus, Star,
  ChevronRight, ChevronLeft, Check, Minus, Plus, Sparkles,
  Wifi, Coffee, UtensilsCrossed, Dumbbell, CarFront, Train, ArrowRight, BedDouble,
  Compass, AlertTriangle, Lightbulb, Pencil, Loader2
} from 'lucide-react';
import AirportAutocomplete from './AirportAutocomplete';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';

type TripType = 'one_way' | 'round_trip' | 'multi_city';
type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';
type BudgetMode = 'total' | 'per_category';
type TransportType = 'metro_subway' | 'train' | 'public_bus' | 'taxi' | 'rideshare_uber' | 'rental_car';
type TransportPriority = 'cheapest' | 'fastest' | 'comfortable';

type GeocodedCity = {
  id: string;
  name: string;
  state?: string;
  latitude?: string;
  longitude?: string;
};

export interface TransportOption {
  id: TransportType;
  transportType: TransportType;
  type: TransportType;
  displayName: string;
  available: boolean;
  estimatedPrice: number | null;
  priceLabel: string;
  singleTicketPrice?: string;
  dayPassPrice?: string;
  priceRange?: string;
  travelTimeNotes?: string;
  pricingType?: string;
  pricingNotes?: string;
  meterInfo?: string;
  surgePricingNotes?: string;
  extraCosts?: string;
  bestUseCase?: string;
  notes: string;
  dataSource?: string;
}

export interface PlannerData {
  // Step 1
  origin: string;
  destination: string;
  destinationCity?: string;
  destinationCountry?: string;
  destinationCountryCode?: string;
  tripType: TripType;
  // Step 2
  departureDate: string;
  returnDate: string;
  // Step 3
  adults: number;
  children: number;
  // Step 4
  includeFlight: boolean;
  cabinClass: CabinClass;
  includeBaggage: boolean;
  baggageCount: number;
  directOnly: boolean;
  // Step 5
  includeHotel: boolean;
  hotelStars: number;
  hotelRooms: number;
  hotelBeds: number;
  hotelAmenities: string[];
  nearAirport: boolean;
  nights: number;
  // Step 6 — Transport
  includeTransport: boolean;
  transportTypes: TransportType[];
  transportPriority: TransportPriority;
  transportOptions?: TransportOption[];
  transportDataSource?: string;
  // Step 7 — Vibe
  vibes: string[];
  destinationStates: string[];
  // Step 8 — Budget
  budgetMode: BudgetMode;
  totalBudget: number;
  flightBudget: number;
  hotelBudget: number;
  transportBudget: number;
  dailyExpenseBudget: number;

}

interface TripPlannerWizardProps {
  onComplete: (data: PlannerData) => void;
  isLoading: boolean;
  initialStep?: number;
  initialData?: Partial<PlannerData>;
}

const AMENITIES = [
  { id: 'breakfast', label: 'Complimentary Breakfast', icon: UtensilsCrossed },
  { id: 'wifi', label: 'High-Speed WiFi', icon: Wifi },
  { id: 'coffee', label: 'In-Room Coffee', icon: Coffee },
  { id: 'gym', label: 'Fitness Center', icon: Dumbbell },
  { id: 'pool', label: 'Swimming Pool', icon: Star },
  { id: 'spa', label: 'Spa Access', icon: Star },
  { id: 'shuttle', label: 'Airport Shuttle', icon: CarFront },
  { id: 'toiletries', label: 'Luxury Toiletries', icon: Star },
];

const VIBE_OPTIONS = [
  { id: 'food_drink', label: 'Food & Drink', emoji: '🍕' },
  { id: 'nature_outdoors', label: 'Nature & Outdoors', emoji: '🌿' },
  { id: 'culture_history', label: 'Culture & History', emoji: '🏛️' },
  { id: 'shopping_exploring', label: 'Shopping & Exploring', emoji: '🛍️' },
  { id: 'nightlife_entertainment', label: 'Nightlife & Entertainment', emoji: '🎉' },
  { id: 'relaxation_wellness', label: 'Relaxation & Wellness', emoji: '🧘' },
  { id: 'art_architecture', label: 'Art & Architecture', emoji: '🎨' },
  { id: 'family_friendly', label: 'Family Friendly', emoji: '👨‍👩‍👧' },
];

const TRANSPORT_OPTIONS: { value: TransportType; label: string; icon: any }[] = [
  { value: 'metro_subway', label: 'Metro / Subway', icon: Train },
  { value: 'train', label: 'Train', icon: Train },
  { value: 'public_bus', label: 'Public Bus', icon: Bus },
  { value: 'taxi', label: 'Taxi', icon: CarFront },
  { value: 'rideshare_uber', label: 'Rideshare / Uber', icon: CarFront },
  { value: 'rental_car', label: 'Rental Car', icon: CarFront },
];

const STEPS = [
  { title: 'Where To', subtitle: 'Select your destination' },
  { title: 'When', subtitle: 'Pick your travel dates' },
  { title: 'Who', subtitle: 'How many travelers?' },
  { title: 'Flight Style', subtitle: 'Choose your cabin preferences' },
  { title: 'Stay', subtitle: 'Define your hotel needs' },
  { title: 'Transportation', subtitle: 'Choose how you want to move around your destination' },
  { title: 'Your Vibe', subtitle: "What's your travel style?" },
  { title: 'Budget', subtitle: 'Set your spending limits' },
  { title: 'Review', subtitle: 'Confirm your trip details' },
];

export default function TripPlannerWizard({ onComplete, isLoading, initialStep = 0, initialData }: TripPlannerWizardProps) {
  const [step, setStep] = useState(initialStep);
  const [direction, setDirection] = useState(1);
  // 'range' = initial picking (click from, then to), 'idle' = both set,
  // 'editDeparture' = picking departure only, 'editReturn' = picking return only
  const [datePickMode, setDatePickMode] = useState<'range' | 'idle' | 'editDeparture' | 'editReturn'>('range');

  const [data, setData] = useState<PlannerData>({
    origin: '',
    destination: '',
    tripType: 'round_trip',
    departureDate: new Date().toISOString().split('T')[0],
    returnDate: '',
    adults: 1,
    children: 0,
    includeFlight: true,
    cabinClass: 'economy',
    includeBaggage: true,
    baggageCount: 1,
    directOnly: false,
    budgetMode: 'total',
    totalBudget: 3000,
    flightBudget: 1500,
    hotelBudget: 800,
    transportBudget: 200,
    dailyExpenseBudget: 500,
    includeHotel: true,
    hotelStars: 4,
    hotelRooms: 1,
    hotelBeds: 2,
    hotelAmenities: ['wifi', 'breakfast'],
    nearAirport: false,
    nights: 1,
    includeTransport: true,
    transportTypes: ['public_bus'],
    transportPriority: 'cheapest',
    vibes: [],
    destinationStates: [],
    ...initialData,
  });

  const update = (partial: Partial<PlannerData>) => setData(prev => ({ ...prev, ...partial }));
  const [transportLoading, setTransportLoading] = useState(false);
  const transportFetchKeyRef = useRef('');
  const [countryCities, setCountryCities] = useState<GeocodedCity[]>([]);
  const [countryStates, setCountryStates] = useState<string[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesError, setCitiesError] = useState('');
  const cityFetchKeyRef = useRef('');

  const getTransportLookupKey = (current: PlannerData) => [
    current.destination,
    current.destinationCity || '',
    current.destinationCountry || '',
    current.destinationCountryCode || '',
    current.transportPriority,
  ].join('|');

  const applyTransportResponse = (json: any) => {
    const options = Array.isArray(json?.options) ? json.options : [];
    const availableIds = new Set(options.filter((option: TransportOption) => option.available).map((option: TransportOption) => option.id));
    setData(prev => {
      const selectedAvailable = prev.transportTypes.filter(type => availableIds.has(type));
      const firstAvailable = options.find((option: TransportOption) => option.available)?.id;
      return {
        ...prev,
        transportOptions: options,
        transportDataSource: json?.dataSource || 'static_fallback',
        transportTypes: selectedAvailable.length ? selectedAvailable : firstAvailable ? [firstAvailable] : [],
      };
    });
  };

  const fetchCountryCities = useCallback(async (country: string) => {
    const lookupKey = country.trim().toLowerCase();
    if (!lookupKey || cityFetchKeyRef.current === lookupKey) return;

    cityFetchKeyRef.current = lookupKey;
    setCitiesLoading(true);
    setCitiesError('');
    setCountryCities([]);
    setCountryStates([]);
    try {
      const response = await fetch(`/api/geocoded/cities?country=${encodeURIComponent(country)}&limit=80`);
      const json = await response.json();
      if (!response.ok || json?.error) throw new Error(json?.error || 'Could not load cities.');
      setCountryCities(Array.isArray(json?.cities) ? json.cities : []);
      setCountryStates(Array.isArray(json?.states) ? json.states : []);
    } catch (error: any) {
      cityFetchKeyRef.current = '';
      setCountryCities([]);
      setCountryStates([]);
      setCitiesError(error?.message || 'Could not load cities.');
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  const countryCitiesLookup = data.destinationCountryCode || data.destinationCountry || '';
  const countryStateOptions = useMemo(() => {
    const sourceStates = countryStates.length ? countryStates : countryCities.map(city => city.state || '');
    const seen = new Set<string>();
    return sourceStates
      .map(state => state.trim())
      .filter(state => {
        const key = state.toLowerCase();
        if (!state || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [countryCities, countryStates]);

  const fetchTransportOptions = useCallback(async (current: PlannerData) => {
    if (!current.includeTransport || !current.destination) return;
    const lookupKey = getTransportLookupKey(current);
    if (transportLoading || transportFetchKeyRef.current === lookupKey) return;

    transportFetchKeyRef.current = lookupKey;
    setTransportLoading(true);
    try {
      const response = await fetch('/api/planner/transport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: current.destination,
          destinationCity: current.destinationCity || current.destination,
          destinationCountry: current.destinationCountry || '',
          selectedTransportTypes: current.transportTypes,
          transportPriority: current.transportPriority,
        }),
      });
      const json = await response.json();
      applyTransportResponse(json);
    } catch {
      transportFetchKeyRef.current = '';
    } finally {
      setTransportLoading(false);
    }
  }, [transportLoading]);

  const next = () => {
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep(s => s + 1);
      if (step === 2) {
        void fetchTransportOptions(data);
      }
    }
  };
  const prev = () => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  };
  const goToStep = (target: number) => {
    setDirection(target > step ? 1 : -1);
    setStep(target);
  };

  const canProceed = () => {
    if (step === 0) return data.origin && data.destination;
    if (step === 1) return data.departureDate && (data.tripType !== 'round_trip' || data.returnDate);
    if (step === 5 && data.includeTransport) return !transportLoading && data.transportTypes.length > 0;
    return true;
  };

  useEffect(() => {
    if (step === 5 && data.includeTransport && !data.transportOptions?.length) {
      void fetchTransportOptions(data);
    }
  }, [step, data.includeTransport, data.destination, data.transportOptions?.length, fetchTransportOptions]);

  useEffect(() => {
    if (step === 6 && countryCitiesLookup) {
      void fetchCountryCities(countryCitiesLookup);
    }
  }, [step, countryCitiesLookup, fetchCountryCities]);

  const progress = ((step + 1) / STEPS.length) * 100;

  // Clear the default departure date for round trip when first entering Step 2,
  // so the range picker starts fully empty. Only fires when departure is still
  // the auto-default (today) and return is empty (i.e. user hasn't picked yet).
  useEffect(() => {
    if (step === 1 && data.tripType === 'round_trip' && !data.returnDate) {
      const todayStr = new Date().toISOString().split('T')[0];
      if (data.departureDate === todayStr) {
        update({ departureDate: '' });
        setDatePickMode('range');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Auto-compute nights from dates (user can still override manually)
  const nightsAutoSet = useRef(false);
  useEffect(() => {
    if (data.tripType === 'round_trip' && data.departureDate && data.returnDate) {
      const d = Math.ceil((new Date(data.returnDate).getTime() - new Date(data.departureDate).getTime()) / 86400000);
      if (d > 0 && !nightsAutoSet.current) {
        update({ nights: d });
      }
    } else if (data.tripType === 'one_way' && !nightsAutoSet.current) {
      update({ nights: 1 });
    }
  }, [data.departureDate, data.returnDate, data.tripType]);

  // ── Smart Budget Suggestion ──
  const autoFilledRef = useRef<number | null>(null);

  // Destination cost estimates from Gemini
  const [costEstimates, setCostEstimates] = useState<{
    dailyMeals: number; dailyTransport: number; dailyMiscellaneous: number;
    averageUberOrTaxi: number; currencyNote: string; isEstimate: boolean;
  } | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const lastCostKey = useRef('');

  const HOTEL_NIGHTLY: Record<number, number> = { 1: 60, 2: 100, 3: 160, 4: 280, 5: 450 };
  const CABIN_FALLBACK: Record<string, number> = { economy: 300, premium_economy: 600, business: 1500, first: 3000 };

  // Use the user-editable nights from wizard state (no hardcoded fallback)
  const nights = data.nights;

  const totalTravelers = data.adults + data.children;

  // Derive the destination city name from the IATA code for display
  const destinationCity = data.destination || '';

  const estimatedFlightPrice = (CABIN_FALLBACK[data.cabinClass] || 300) * totalTravelers;

  const suggestedBudget = useMemo(() => {
    // Only calculate and log in an active browser session on/after Step 8 (step === 7)
    if (typeof window === 'undefined' || step < 7) {
      return null;
    }

    const flightCost = estimatedFlightPrice;
    const hotelCost = (HOTEL_NIGHTLY[data.hotelStars] || 160) * nights * data.hotelRooms;
    const meals = costEstimates?.dailyMeals ?? 50;
    const transport = costEstimates?.dailyTransport ?? 20;
    const misc = costEstimates?.dailyMiscellaneous ?? 15;
    const dailyCostPerPerson = meals + transport + misc;
    const totalDailyCost = dailyCostPerPerson * totalTravelers * nights;
    const total = flightCost + hotelCost + totalDailyCost;
    const rounded = Math.ceil(total / 100) * 100;
    console.log('💰 BUDGET BREAKDOWN:');
    console.log('   ✈️ Flights:', flightCost);
    console.log('   🏨 Hotels:', hotelCost, `($${HOTEL_NIGHTLY[data.hotelStars] || 160}/night × ${nights} nights × ${data.hotelRooms} rooms)`);
    console.log('   🍽️ Daily meals:', meals * totalTravelers * nights, `($${meals}/person × ${totalTravelers} × ${nights} nights)`);
    console.log('   🚌 Daily transport:', transport * totalTravelers * nights, `($${transport}/person × ${totalTravelers} × ${nights} nights)`);
    console.log('   🛍️ Daily misc:', misc * totalTravelers * nights, `($${misc}/person × ${totalTravelers} × ${nights} nights)`);
    console.log('   💰 Total suggestion:', rounded);
    return rounded;
  }, [estimatedFlightPrice, data.hotelStars, data.hotelRooms, nights, totalTravelers, costEstimates, step]);

  const cabinLabel = ({ economy: 'Economy', premium_economy: 'Premium Economy', business: 'Business', first: 'First Class' } as Record<string, string>)[data.cabinClass] || data.cabinClass;

  const currentBudgetTotal = data.budgetMode === 'total'
    ? data.totalBudget
    : data.flightBudget + data.hotelBudget + data.transportBudget + data.dailyExpenseBudget;

  const isBelowSuggestion = suggestedBudget !== null && currentBudgetTotal < suggestedBudget;

  // Fetch destination-specific cost estimates from Gemini
  useEffect(() => {
    if (step !== 7 || !data.destination) return;
    const key = data.destination;
    if (key === lastCostKey.current) return;
    lastCostKey.current = key;
    let cancelled = false;
    (async () => {
      setCostLoading(true);
      try {
        const res = await fetch('/api/planner/cost-estimates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ destinationCity: data.destination, destinationCountry: '' }),
        });
        const json = await res.json();
        if (!cancelled) {
          setCostEstimates({
            dailyMeals: json.dailyMeals || 50,
            dailyTransport: json.dailyTransport || 20,
            dailyMiscellaneous: json.dailyMiscellaneous || 15,
            averageUberOrTaxi: json.averageUberOrTaxi || 10,
            currencyNote: json.currencyNote || '',
            isEstimate: json.isEstimate || false,
          });
        }
      } catch {
        if (!cancelled) {
          setCostEstimates({ dailyMeals: 50, dailyTransport: 20, dailyMiscellaneous: 15, averageUberOrTaxi: 10, currencyNote: '', isEstimate: true });
        }
      }
      if (!cancelled) setCostLoading(false);
    })();
    return () => { cancelled = true; };
  }, [step, data.destination]);

  // Auto-fill budget when suggestion first becomes available or changes
  useEffect(() => {
    if (step !== 7 || suggestedBudget === null) return;
    if (autoFilledRef.current === null || data.totalBudget === autoFilledRef.current) {
      setData(prev => ({
        ...prev,
        totalBudget: suggestedBudget,
        flightBudget: Math.round(suggestedBudget * 0.45),
        hotelBudget: Math.round(suggestedBudget * 0.30),
        transportBudget: Math.round(suggestedBudget * 0.10),
        dailyExpenseBudget: Math.round(suggestedBudget * 0.15),
      }));
      autoFilledRef.current = suggestedBudget;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedBudget, step]);

  // Counter component for reuse
  const Counter = ({ label, sublabel, value, min, onChange }: { label: string; sublabel: string; value: number; min: number; onChange: (v: number) => void }) => (
    <div className="flex items-center justify-between py-5 px-6 rounded-3xl bg-muted border border-border">
      <div>
        <div className="text-base font-bold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{sublabel}</div>
      </div>
      <div className="flex items-center gap-5">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all border ${value <= min ? 'bg-muted border-border text-muted-foreground/30 cursor-not-allowed' : 'bg-background border-border text-foreground hover:bg-foreground hover:text-background hover:border-foreground'}`}>
          <Minus className="w-4 h-4" />
        </button>
        <span className="text-2xl font-bold text-foreground min-w-[28px] text-center font-mono">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)}
          className="w-10 h-10 rounded-xl bg-foreground text-background flex items-center justify-center hover:opacity-80 transition-all border border-foreground">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const getTransportOption = (type: TransportType) => data.transportOptions?.find(option => option.id === type || option.transportType === type);
  const destinationLabel = data.destinationCity || data.destination || 'this destination';
  const countryCitiesLabel = data.destinationCountry || data.destinationCountryCode || 'this country';

  const renderStep = () => {
    switch (step) {
      // Step 1 — Destination
      case 0:
        return (
          <div className="space-y-8">
            <div className="space-y-3">
              <label className="small-caps ml-1">Trip Type</label>
              <div className="flex gap-3">
                {(['one_way', 'round_trip'] as TripType[]).map(type => (
                  <button key={type} type="button" onClick={() => update({ tripType: type })}
                    className={`flex-1 py-4 rounded-2xl border text-xs uppercase tracking-[0.15em] font-bold transition-all ${data.tripType === type ? 'bg-foreground text-background border-foreground shadow-lg shadow-foreground/10' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 relative z-30">
              <label className="small-caps ml-1">From</label>
              <AirportAutocomplete value={data.origin} onSelect={(v) => update({ origin: v })} placeholder="Departure City" />
            </div>
            <div className="space-y-3 relative z-20">
              <label className="small-caps ml-1">To</label>
              <AirportAutocomplete
                value={data.destination}
                onSelect={(v) => update({ destination: v, destinationCity: undefined, destinationCountry: undefined, destinationCountryCode: undefined, destinationStates: [], transportOptions: undefined, transportDataSource: undefined })}
                onSelectSuggestion={(suggestion) => update({
                  destination: suggestion.iata_code,
                  destinationCity: suggestion.city_name,
                  destinationCountry: suggestion.country_name,
                  destinationCountryCode: suggestion.country_code || suggestion.iata_country_code,
                  destinationStates: [],
                  transportOptions: undefined,
                  transportDataSource: undefined,
                })}
                placeholder="Arrival City"
              />
            </div>
          </div>
        );

      // Step 2 — Dates
      case 1: {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Helper: convert "YYYY-MM-DD" string to Date, or undefined
        const parseDate = (s: string) => {
          if (!s) return undefined;
          const [y, m, d] = s.split('-').map(Number);
          return new Date(y, m - 1, d);
        };
        // Helper: convert Date to "YYYY-MM-DD" string
        const toStr = (d: Date | undefined) =>
          d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';

        if (data.tripType === 'round_trip') {
          // ── Round Trip: range calendar with picking/idle modes ──
          const rangeValue: DateRange = {
            from: parseDate(data.departureDate),
            to: parseDate(data.returnDate),
          };

          // Auto-enter idle mode when both dates are set during initial range pick
          const bothDatesSet = !!rangeValue.from && !!rangeValue.to;
          const effectiveMode = (datePickMode === 'range' && bothDatesSet) ? 'idle' : datePickMode;
          const selectedNights = rangeValue.from && rangeValue.to
            ? Math.max(0, Math.ceil((rangeValue.to.getTime() - rangeValue.from.getTime()) / 86400000))
            : 0;
          const selectedDateCount = rangeValue.from
            ? selectedNights > 0 ? selectedNights + 1 : 1
            : 0;
          const returnWeekRow = rangeValue.to
            ? Math.floor(((new Date(rangeValue.to.getFullYear(), rangeValue.to.getMonth(), 1).getDay()) + rangeValue.to.getDate() - 1) / 7)
            : 0;
          const durationBadgeTop = `calc(6rem + ${returnWeekRow} * 2.25rem)`;

          // Determine which date card is "active" (being edited)
          const depActive = effectiveMode === 'range' || effectiveMode === 'editDeparture';
          const retActive = effectiveMode === 'editReturn';

          return (
            <div className="space-y-6">
              {/* Date label cards */}
              <div className="flex gap-4">
                {/* Departure card */}
                <div className={`flex-1 rounded-2xl py-4 px-5 flex items-center gap-3 transition-all border ${depActive ? 'bg-foreground/5 border-foreground/30' : 'bg-muted border-border'
                  }`}>
                  <CalendarIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.65rem] small-caps tracking-widest text-muted-foreground">Departure</p>
                    <p className="text-sm font-medium">
                      {rangeValue.from
                        ? rangeValue.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-muted-foreground">Pick a date</span>}
                    </p>
                  </div>
                  {effectiveMode === 'idle' && (
                    <button
                      type="button"
                      onClick={() => setDatePickMode('editDeparture')}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-foreground/5 transition-all flex-shrink-0"
                      title="Change departure date"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {/* Return card */}
                <div className={`flex-1 rounded-2xl py-4 px-5 flex items-center gap-3 transition-all border ${retActive ? 'bg-foreground/5 border-foreground/30' : 'bg-muted border-border'
                  }`}>
                  <CalendarIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.65rem] small-caps tracking-widest text-muted-foreground">Return</p>
                    <p className="text-sm font-medium">
                      {rangeValue.to
                        ? rangeValue.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-muted-foreground">Pick a date</span>}
                    </p>
                  </div>
                  {effectiveMode === 'idle' && (
                    <button
                      type="button"
                      onClick={() => setDatePickMode('editReturn')}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-foreground/5 transition-all flex-shrink-0"
                      title="Change return date"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Editing hint */}
              {(effectiveMode === 'editDeparture' || effectiveMode === 'editReturn') && (
                <p className="text-xs text-center text-muted-foreground">
                  Select a new <span className="font-medium text-foreground">{effectiveMode === 'editDeparture' ? 'departure' : 'return'}</span> date
                </p>
              )}

              <div className="hidden">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Selected dates</div>
                <div className="mt-1 text-sm font-bold text-foreground">
                  {selectedDateCount > 0 ? `${selectedDateCount} day${selectedDateCount !== 1 ? 's' : ''}` : 'No dates selected'}
                  {selectedNights > 0 ? ` • ${selectedNights} night${selectedNights !== 1 ? 's' : ''}` : ''}
                </div>
              </div>

              {/* Calendar */}
              <div className="flex justify-center">
                {(effectiveMode === 'range' || effectiveMode === 'idle') ? (
                  /* Range mode or idle — show range calendar */
                  <div className="relative overflow-visible">
                    {selectedNights > 0 && (
                      <div
                        className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-[9999] -translate-y-1/2 whitespace-nowrap rounded-lg border border-foreground bg-foreground px-3 py-1 text-xs font-black text-background shadow-2xl"
                        style={{ top: durationBadgeTop }}
                      >
                        {selectedDateCount} day{selectedDateCount !== 1 ? 's' : ''}
                      </div>
                    )}
                    <Calendar
                      mode="range"
                      selected={rangeValue}
                      onSelect={(range: DateRange | undefined) => {
                        update({
                          departureDate: toStr(range?.from),
                          returnDate: toStr(range?.to),
                        });
                        // Auto-idle when both dates are now set
                        if (range?.from && range?.to) {
                          setDatePickMode('idle');
                        }
                      }}
                      numberOfMonths={2}
                      showOutsideDays={false}
                      disabled={{ before: today }}
                      defaultMonth={parseDate(data.departureDate) || today}
                      className="rounded-2xl border border-border bg-card p-4"
                    />
                  </div>
                ) : (
                  /* Edit single date mode — show single-pick calendar */
                  <Calendar
                    mode="single"
                    selected={
                      effectiveMode === 'editDeparture'
                        ? parseDate(data.departureDate)
                        : parseDate(data.returnDate)
                    }
                    onSelect={(date: Date | undefined) => {
                      if (!date) return;
                      if (effectiveMode === 'editDeparture') {
                        // Don't allow departure after return
                        const ret = parseDate(data.returnDate);
                        if (ret && date > ret) return;
                        update({ departureDate: toStr(date) });
                      } else {
                        // Don't allow return before departure
                        const dep = parseDate(data.departureDate);
                        if (dep && date < dep) return;
                        update({ returnDate: toStr(date) });
                      }
                      setDatePickMode('idle');
                    }}
                    numberOfMonths={2}
                    showOutsideDays={false}
                    disabled={{ before: today }}
                    defaultMonth={
                      (effectiveMode === 'editDeparture'
                        ? parseDate(data.departureDate)
                        : parseDate(data.returnDate)) || today
                    }
                    className="rounded-2xl border border-border bg-card p-4"
                  />
                )}
              </div>
            </div>
          );
        }

        // ── One Way: single-date calendar ──
        const selectedDate = parseDate(data.departureDate);
        const selectedDateCount = selectedDate ? 1 : 0;

        return (
          <div className="space-y-6">
            {/* Date label */}
            <div className="bg-muted border border-border rounded-2xl py-4 px-5 flex items-center gap-3">
              <CalendarIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-[0.65rem] small-caps tracking-widest text-muted-foreground">Departure</p>
                <p className="text-sm font-medium">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : <span className="text-muted-foreground">Pick a date</span>}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted px-5 py-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Selected dates</div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {selectedDateCount ? '1 day' : 'No dates selected'}
              </div>
            </div>

            {/* Single calendar */}
            <div className="flex justify-center">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date: Date | undefined) => {
                  update({ departureDate: toStr(date) });
                }}
                showOutsideDays={false}
                disabled={{ before: today }}
                defaultMonth={selectedDate || today}
                className="rounded-2xl border border-border bg-card p-4"
              />
            </div>
          </div>
        );
      }

      // Step 3 — Travelers
      case 2:
        return (
          <div className="space-y-5">
            <Counter label="Adults" sublabel="18 years and older" value={data.adults} min={1} onChange={v => update({ adults: v })} />
            <Counter label="Children" sublabel="0 — 17 years" value={data.children} min={0} onChange={v => update({ children: v })} />
          </div>
        );

      // Step 4 — Flight Preferences
      case 3:
        return (
          <div className="space-y-8">
            {/* Include Flight toggle */}
            <div className="flex items-center justify-between py-5 px-6 rounded-3xl bg-muted border border-border">
              <div className="flex items-center gap-3">
                <Plane className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-base font-bold text-foreground">Include Flights</div>
                  <div className="text-xs text-muted-foreground">Search for flights to your destination</div>
                </div>
              </div>
              <button type="button" onClick={() => update({ includeFlight: !data.includeFlight })}
                className={`w-16 h-9 rounded-full transition-all duration-300 relative shadow-inner ${data.includeFlight ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}>
                <div className={`w-7 h-7 rounded-full shadow-lg absolute top-1 transition-all duration-300 flex items-center justify-center ${data.includeFlight ? 'left-8 bg-white' : 'left-1 bg-white'}`}>
                  {data.includeFlight && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                </div>
              </button>
            </div>

            {data.includeFlight ? (
              <>
                <div className="space-y-3">
                  <label className="small-caps ml-1">Cabin Class</label>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: 'economy', label: 'Economy' },
                      { value: 'premium_economy', label: 'Premium Economy' },
                      { value: 'business', label: 'Business' },
                      { value: 'first', label: 'First Class' },
                    ] as { value: CabinClass; label: string }[]).map(c => (
                      <button key={c.value} type="button" onClick={() => update({ cabinClass: c.value })}
                        className={`py-4 rounded-2xl border text-xs uppercase tracking-[0.12em] font-bold transition-all ${data.cabinClass === c.value ? 'bg-foreground text-background border-foreground shadow-lg' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between py-5 px-6 rounded-3xl bg-muted border border-border">
                  <div className="flex items-center gap-3">
                    <Plane className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-base font-bold text-foreground">Direct Flights Only</div>
                      <div className="text-xs text-muted-foreground">No layovers or connections</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => update({ directOnly: !data.directOnly })}
                    className={`w-16 h-9 rounded-full transition-all duration-300 relative shadow-inner ${data.directOnly ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}>
                    <div className={`w-7 h-7 rounded-full shadow-lg absolute top-1 transition-all duration-300 flex items-center justify-center ${data.directOnly ? 'left-8 bg-white' : 'left-1 bg-white'}`}>
                      {data.directOnly && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 px-6 rounded-3xl border border-dashed border-border text-center">
                <p className="text-sm text-muted-foreground/60">Flight not included in this trip</p>
              </div>
            )}
          </div>
        );

      // Step 8 — Budget
      case 7:
        return (
          <div className="space-y-8">
            <div className="space-y-3">
              <label className="small-caps ml-1">Budget Mode</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => update({ budgetMode: 'total' })}
                  className={`flex-1 py-4 rounded-2xl border text-xs uppercase tracking-[0.12em] font-bold transition-all ${data.budgetMode === 'total' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                  <div className="flex flex-col items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    <span>Total Budget</span>
                    <span className="text-[8px] tracking-wider opacity-60 normal-case">AI allocates for you</span>
                  </div>
                </button>
                <button type="button" onClick={() => update({ budgetMode: 'per_category' })}
                  className={`flex-1 py-4 rounded-2xl border text-xs uppercase tracking-[0.12em] font-bold transition-all ${data.budgetMode === 'per_category' ? 'bg-foreground text-background border-foreground' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                  <div className="flex flex-col items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    <span>Per Category</span>
                    <span className="text-[8px] tracking-wider opacity-60 normal-case">You decide each</span>
                  </div>
                </button>
              </div>
            </div>

            {data.budgetMode === 'total' ? (
              <div className="space-y-4">
                <div className="text-center py-8 px-6 rounded-3xl bg-muted border border-border">
                  <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-2">Total Trip Budget</div>
                  <div className="text-5xl font-bold text-foreground title-text">${data.totalBudget.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground/60 mt-2">The AI will intelligently allocate across flights, hotels, and more</div>
                </div>
                <input type="range" min="500" max="50000" step="250" value={data.totalBudget}
                  onChange={e => { update({ totalBudget: parseInt(e.target.value) }); autoFilledRef.current = null; }}
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground" />
                <div className="flex justify-between text-[10px] text-muted-foreground/40 font-bold uppercase tracking-wider">
                  <span>$500</span><span>$50,000</span>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {([
                  { key: 'flightBudget' as const, label: 'Flights', icon: Plane, max: 20000 },
                  { key: 'hotelBudget' as const, label: 'Hotels', icon: Hotel, max: 10000 },
                  { key: 'transportBudget' as const, label: 'Transportation', icon: Bus, max: 5000 },
                  { key: 'dailyExpenseBudget' as const, label: 'Daily Expenses', icon: DollarSign, max: 5000 },
                ]).map(item => (
                  <div key={item.key} className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <item.icon className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs font-bold text-foreground uppercase tracking-wider">{item.label}</span>
                      </div>
                      <span className="text-sm font-bold text-foreground font-mono">${data[item.key].toLocaleString()}</span>
                    </div>
                    <input type="range" min="0" max={item.max} step="50" value={data[item.key]}
                      onChange={e => { update({ [item.key]: parseInt(e.target.value) }); autoFilledRef.current = null; }}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-foreground" />
                  </div>
                ))}
                <div className="text-center py-4 px-6 rounded-2xl bg-muted border border-border">
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Combined Total: </span>
                  <span className="text-lg font-bold text-foreground font-mono ml-2">
                    ${(data.flightBudget + data.hotelBudget + data.transportBudget + data.dailyExpenseBudget).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {/* Cost breakdown card */}
            {costLoading && (
              <div className="space-y-3 py-5 px-6 rounded-3xl bg-muted border border-border animate-pulse">
                <div className="h-3 bg-border/50 rounded w-2/3 mx-auto" />
                <div className="space-y-2 pt-2">
                  <div className="h-2.5 bg-border/40 rounded w-full" />
                  <div className="h-2.5 bg-border/40 rounded w-5/6" />
                  <div className="h-2.5 bg-border/40 rounded w-4/6" />
                  <div className="h-2.5 bg-border/40 rounded w-3/6" />
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <div className="w-3 h-3 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
                  <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Analyzing costs for {destinationCity}...</span>
                </div>
              </div>
            )}

            {!costLoading && suggestedBudget !== null && (
              <div className="space-y-4">
                {/* Breakdown card */}
                <div className="py-5 px-6 rounded-3xl bg-muted border border-border space-y-3">
                  <div className="text-[10px] uppercase tracking-[0.15em] font-bold text-muted-foreground text-center mb-3">
                    Cost Breakdown for {destinationCity}
                  </div>
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-2">✈️ Flights (est.)</span>
                      <span className="text-xs font-bold text-foreground font-mono">${estimatedFlightPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-2">🏨 Hotels ({nights} night{nights !== 1 ? 's' : ''} × {data.hotelRooms} room{data.hotelRooms !== 1 ? 's' : ''})</span>
                      <span className="text-xs font-bold text-foreground font-mono">${((HOTEL_NIGHTLY[data.hotelStars] || 160) * nights * data.hotelRooms).toLocaleString()}/total</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-2">🍽️ Daily meals in {destinationCity}</span>
                      <span className="text-xs font-bold text-foreground font-mono">${costEstimates?.dailyMeals ?? 50}/person/day</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-2">🚌 Local transport in {destinationCity}</span>
                      <span className="text-xs font-bold text-foreground font-mono">${costEstimates?.dailyTransport ?? 20}/person/day</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground flex items-center gap-2">🛍️ Miscellaneous</span>
                      <span className="text-xs font-bold text-foreground font-mono">${costEstimates?.dailyMiscellaneous ?? 15}/person/day</span>
                    </div>
                  </div>
                  {costEstimates?.currencyNote && (
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-[10px] text-muted-foreground/60 leading-relaxed">💱 {costEstimates.currencyNote}</p>
                    </div>
                  )}
                </div>
                {/* Suggestion line */}
                <div className="text-center text-[10px] text-muted-foreground/50 uppercase tracking-wider font-bold">
                  Suggested: ${suggestedBudget.toLocaleString()} — estimated based on your cabin class, hotel rating, and destination costs
                </div>
              </div>
            )}

            {/* Under-budget warning */}
            {!costLoading && isBelowSuggestion && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 py-4 px-5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                    ⚠️ Your budget may be too low for {cabinLabel} flights and {data.hotelStars}-star hotels.
                    We'll show the best available options within your budget.
                  </p>
                </div>
                <div className="flex items-start gap-3 py-3 px-5 rounded-2xl bg-muted border border-border">
                  <Lightbulb className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    💡 To lower your budget, consider choosing a lower{' '}
                    <button type="button" onClick={() => goToStep(3)}
                      className="underline underline-offset-2 font-bold text-foreground hover:opacity-70 transition-opacity">
                      cabin class
                    </button>{' '}or fewer{' '}
                    <button type="button" onClick={() => goToStep(4)}
                      className="underline underline-offset-2 font-bold text-foreground hover:opacity-70 transition-opacity">
                      hotel stars
                    </button>.
                  </p>
                </div>
              </div>
            )}
          </div>
        );

      // Step 5 — Stay
      case 4:
        return (
          <div className="space-y-8">
            {/* Include Hotel toggle */}
            <div className="flex items-center justify-between py-5 px-6 rounded-3xl bg-muted border border-border">
              <div className="flex items-center gap-3">
                <Hotel className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-base font-bold text-foreground">Include Hotel</div>
                  <div className="text-xs text-muted-foreground">Search for accommodation at your destination</div>
                </div>
              </div>
              <button type="button" onClick={() => update({ includeHotel: !data.includeHotel })}
                className={`w-16 h-9 rounded-full transition-all duration-300 relative shadow-inner ${data.includeHotel ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}>
                <div className={`w-7 h-7 rounded-full shadow-lg absolute top-1 transition-all duration-300 flex items-center justify-center ${data.includeHotel ? 'left-8 bg-white' : 'left-1 bg-white'}`}>
                  {data.includeHotel && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                </div>
              </button>
            </div>

            {data.includeHotel ? (
              <>
                <div className="space-y-3">
                  <label className="small-caps ml-1">Minimum Star Rating</label>
                  <div className="flex gap-2 py-4 px-6 rounded-3xl bg-muted border border-border">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} type="button" onClick={() => update({ hotelStars: s })}
                        className="flex-1 flex justify-center transition-transform hover:scale-110">
                        <Star className={`w-8 h-8 transition-colors ${s <= data.hotelStars ? 'fill-amber-400 text-amber-400' : 'text-border'}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <Counter label="Rooms" sublabel="Number of hotel rooms" value={data.hotelRooms} min={1} onChange={v => update({ hotelRooms: v })} />

                <Counter label="Beds" sublabel="Number of beds per room" value={data.hotelBeds} min={1} onChange={v => update({ hotelBeds: v })} />

                {/* Nights counter */}
                <div className="space-y-2">
                  <Counter label="Nights" sublabel="How many nights to stay" value={data.nights} min={1} onChange={v => { nightsAutoSet.current = true; update({ nights: Math.min(30, v) }); }} />
                  <div className="px-6 space-y-1">
                    <div className="text-xs text-muted-foreground font-mono">
                      {data.nights} night{data.nights !== 1 ? 's' : ''} × ${(HOTEL_NIGHTLY[data.hotelStars] || 160).toLocaleString()}/night = ${((HOTEL_NIGHTLY[data.hotelStars] || 160) * data.nights).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50">
                      Adjust if you won't need a hotel for the full duration.
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="small-caps ml-1">Desired Amenities</label>
                  <div className="grid grid-cols-2 gap-3">
                    {AMENITIES.map(a => {
                      const selected = data.hotelAmenities.includes(a.id);
                      return (
                        <button key={a.id} type="button"
                          onClick={() => update({
                            hotelAmenities: selected
                              ? data.hotelAmenities.filter(x => x !== a.id)
                              : [...data.hotelAmenities, a.id]
                          })}
                          className={`flex items-center gap-3 py-3.5 px-5 rounded-2xl border text-left transition-all duration-200 ${selected ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                          <a.icon className="w-4 h-4 shrink-0" />
                          <span className="text-[11px] font-bold uppercase tracking-wider">{a.label}</span>
                          {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between py-5 px-6 rounded-3xl bg-muted border border-border">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-base font-bold text-foreground">Near Airport</div>
                      <div className="text-xs text-muted-foreground">Hotel close to arrival location</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => update({ nearAirport: !data.nearAirport })}
                    className={`w-16 h-9 rounded-full transition-all duration-300 relative shadow-inner ${data.nearAirport ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}>
                    <div className={`w-7 h-7 rounded-full shadow-lg absolute top-1 transition-all duration-300 flex items-center justify-center ${data.nearAirport ? 'left-8 bg-white' : 'left-1 bg-white'}`}>
                      {data.nearAirport && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                    </div>
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 px-6 rounded-3xl border border-dashed border-border text-center">
                <p className="text-sm text-muted-foreground/60">Hotel not included in this trip</p>
              </div>
            )}
          </div>
        );

      // Step 6 — Transport
      case 5:
        return (
          <div className="space-y-8">
            <div className="flex items-center justify-between py-5 px-6 rounded-3xl bg-muted border border-border">
              <div className="flex items-center gap-3">
                <Bus className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="text-base font-bold text-foreground">Ground Transportation</div>
                  <div className="text-xs text-muted-foreground">Include at your destination</div>
                </div>
              </div>
              <button type="button" onClick={() => update({ includeTransport: !data.includeTransport })}
                className={`w-16 h-9 rounded-full transition-all duration-300 relative shadow-inner ${data.includeTransport ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}>
                <div className={`w-7 h-7 rounded-full shadow-lg absolute top-1 transition-all duration-300 flex items-center justify-center ${data.includeTransport ? 'left-8 bg-white' : 'left-1 bg-white'}`}>
                  {data.includeTransport && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                </div>
              </button>
            </div>

            {data.includeTransport ? (
              <>
                <div className="space-y-3">
                  <label className="small-caps ml-1">Transport Type <span className="normal-case text-[9px] text-muted-foreground/50 ml-1">(select multiple)</span></label>
                  {transportLoading && (
                    <div className="flex items-center justify-center gap-3 rounded-2xl border border-border bg-muted px-5 py-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking live transport in {destinationLabel}
                    </div>
                  )}
                  {!transportLoading && data.transportOptions?.length ? (
                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
                      Live transport data ready
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-3">
                    {TRANSPORT_OPTIONS.map(t => {
                      const selected = data.transportTypes.includes(t.value);
                      const liveOption = getTransportOption(t.value);
                      const hasLiveData = !!liveOption;
                      const available = !hasLiveData || liveOption.available;
                      const unavailableLabel = `Not available in ${destinationLabel}`;
                      return (
                        <button key={t.value} type="button"
                          disabled={!available}
                          onClick={() => update({
                            transportTypes: selected
                              ? data.transportTypes.filter(x => x !== t.value)
                              : [...data.transportTypes, t.value]
                          })}
                          className={`flex min-h-[104px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-200 ${
                            !available
                              ? 'cursor-not-allowed bg-muted/60 border-border text-muted-foreground/35'
                              : selected
                                ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                                : 'bg-background border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          }`}>
                          <div className="flex w-full items-center gap-2">
                            <t.icon className="h-4 w-4 shrink-0" />
                            <span className="text-[11px] font-black uppercase tracking-[0.12em]">{t.label}</span>
                            {selected && available && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                          </div>
                          <div className="space-y-1">
                            <div className={`text-sm font-black ${selected && available ? 'text-white' : 'text-foreground'}`}>
                              {available ? liveOption?.priceLabel || 'Price pending' : 'Unavailable'}
                            </div>
                            <div className={`text-[10px] font-semibold leading-relaxed ${selected && available ? 'text-white/75' : 'text-muted-foreground'}`}>
                              {available ? liveOption?.notes || 'Live details will appear here.' : unavailableLabel}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="small-caps ml-1">Priority</label>
                  <div className="flex gap-3">
                    {(['cheapest', 'fastest', 'comfortable'] as TransportPriority[]).map(p => (
                      <button key={p} type="button" onClick={() => update({ transportPriority: p })}
                        className={`flex-1 py-4 rounded-2xl border text-xs uppercase tracking-[0.12em] font-bold transition-all duration-200 ${data.transportPriority === p ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                        {p}
                        {data.transportPriority === p && <Check className="w-3 h-3 ml-1 inline" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 px-6 rounded-3xl border border-dashed border-border text-center">
                <p className="text-sm text-muted-foreground/60">Transport not included in this trip</p>
              </div>
            )}
          </div>
        );

      // Step 7 — Your Vibe
      case 6:
        return (
          <div className="space-y-8">
            <div className="text-center py-6 px-6 rounded-3xl bg-muted border border-border">
              <div className="flex items-center justify-center gap-3 mb-3">
                <Compass className="w-6 h-6 text-foreground" />
                <span className="text-lg font-bold text-foreground">What's Your Vibe?</span>
              </div>
              <p className="text-xs text-muted-foreground/60">Select the experiences you're looking for. Choose as many as you like.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {VIBE_OPTIONS.map(v => {
                const selected = data.vibes.includes(v.id);
                return (
                  <button key={v.id} type="button"
                    onClick={() => update({
                      vibes: selected
                        ? data.vibes.filter(x => x !== v.id)
                        : [...data.vibes, v.id]
                    })}
                    className={`flex items-center gap-3 py-4 px-5 rounded-2xl border text-left transition-all duration-200 ${selected ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                    <span className="text-xl">{v.emoji}</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider">{v.label}</span>
                    {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
            <div className="space-y-4 rounded-3xl border border-border bg-muted p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-foreground">States in {countryCitiesLabel}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground/70">
                    Select one or more regions you would consider visiting.
                  </p>
                </div>
                {citiesLoading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
              </div>

              {!countryCitiesLookup && (
                <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                  Select your destination from the Step 1 airport suggestions so we can load cities automatically.
                </div>
              )}

              {citiesLoading && (
                <div className="flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-4 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading states from {countryCitiesLabel}
                </div>
              )}

              {citiesError && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-500">
                  {citiesError}
                </div>
              )}

              {!citiesLoading && countryCitiesLookup && !citiesError && countryStateOptions.length === 0 && cityFetchKeyRef.current && (
                <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-3 text-xs text-muted-foreground">
                  No state options came back for {countryCitiesLabel}.
                </div>
              )}

              {!citiesLoading && countryStateOptions.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {countryStateOptions.map(stateName => {
                    const selected = data.destinationStates.includes(stateName);
                    return (
                      <button
                        key={stateName}
                        type="button"
                        onClick={() => update({
                          destinationStates: selected
                            ? data.destinationStates.filter(state => state !== stateName)
                            : [...data.destinationStates, stateName]
                        })}
                        className={`min-h-[76px] rounded-2xl border px-4 py-3 text-left transition-all ${
                          selected
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                            : 'border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5" />
                          <span className="text-[11px] font-black uppercase tracking-[0.12em]">{stateName}</span>
                          {selected && <Check className="ml-auto h-3.5 w-3.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {data.vibes.length === 0 && (
              <p className="text-center text-[10px] text-muted-foreground/40 uppercase tracking-wider">No vibe selected — we'll show a general mix of top attractions</p>
            )}
          </div>
        );

      // Step 9 — Review
      case 8:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Route', value: `${data.origin} → ${data.destination}`, sub: data.tripType.replace('_', ' ') },
                { label: 'Dates', value: data.departureDate, sub: data.returnDate ? `Return: ${data.returnDate}` : 'One way' },
                { label: 'Travelers', value: `${data.adults} Adult${data.adults > 1 ? 's' : ''}`, sub: data.children > 0 ? `${data.children} Child${data.children > 1 ? 'ren' : ''}` : 'No children' },
                { label: 'Flight', value: data.includeFlight ? data.cabinClass.replace('_', ' ') : 'Not included', sub: data.includeFlight ? (data.includeBaggage ? `${data.baggageCount} bag${data.baggageCount > 1 ? 's' : ''}` : 'No baggage') : '—' },
                { label: 'Budget', value: data.budgetMode === 'total' ? `$${data.totalBudget.toLocaleString()}` : `$${(data.flightBudget + data.hotelBudget + data.transportBudget + data.dailyExpenseBudget).toLocaleString()}`, sub: data.budgetMode === 'total' ? 'AI-allocated' : 'Per category' },
                { label: 'Hotel', value: data.includeHotel ? `${data.hotelStars}-Star` : 'Not included', sub: data.includeHotel ? `${data.hotelRooms} room${data.hotelRooms > 1 ? 's' : ''} • ${data.hotelBeds} bed${data.hotelBeds > 1 ? 's' : ''} • ${data.hotelAmenities.length} amenities` : '—' },
                { label: 'Transport', value: data.includeTransport ? data.transportTypes.map(t => t.replace('_', ' ')).join(', ') : 'Not included', sub: data.includeTransport ? data.transportPriority : '—' },
                { label: 'Vibe', value: data.vibes.length > 0 ? data.vibes.map(v => VIBE_OPTIONS.find(vo => vo.id === v)?.emoji || '').join(' ') : 'General mix', sub: data.vibes.length > 0 ? data.vibes.map(v => VIBE_OPTIONS.find(vo => vo.id === v)?.label || '').join(', ') : 'All attractions' },
                { label: 'Regions', value: data.destinationStates.length > 0 ? `${data.destinationStates.length} selected` : 'Not limited', sub: data.destinationStates.length > 0 ? data.destinationStates.join(', ') : data.destinationCountry || data.destinationCountryCode || 'Destination country' },
              ].map((item, i) => (
                <div key={i} className="py-4 px-5 rounded-2xl bg-muted border border-border">
                  <div className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40 mb-1">{item.label}</div>
                  <div className="text-sm font-bold text-foreground capitalize">{item.value}</div>
                  <div className="text-[10px] text-muted-foreground capitalize mt-0.5">{item.sub}</div>
                </div>
              ))}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Progress Bar */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40">
            {Math.round(progress)}%
          </div>
        </div>
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-foreground rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      {/* Step Header */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`header-${step}`}
          initial={{ opacity: 0, y: direction * 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: direction * -20 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <h2 className="text-5xl title-text text-foreground mb-2">{STEPS[step].title}</h2>
          <p className="text-muted-foreground text-sm font-light">{STEPS[step].subtitle}</p>
        </motion.div>
      </AnimatePresence>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`step-${step}`}
          initial={{ opacity: 0, x: direction * 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -60 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="min-h-[320px]"
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-12 pt-8 border-t border-border">
        <button type="button" onClick={prev} disabled={step === 0}
          className={`flex items-center gap-2 px-6 py-3 rounded-full border text-xs uppercase tracking-[0.15em] font-bold transition-all ${step === 0 ? 'opacity-0 pointer-events-none' : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}>
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {step === STEPS.length - 1 ? (
          <button type="button" onClick={() => onComplete(data)} disabled={isLoading}
            className="btn-primary flex items-center gap-3 px-10 py-4 group disabled:opacity-50">
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-background/20 border-t-background rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span className="text-[11px] uppercase tracking-[0.2em] font-black">Generate My Trip Plan</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        ) : (
          <button type="button" onClick={next} disabled={!canProceed()}
            className="btn-primary flex items-center gap-2 px-8 py-3 disabled:opacity-30 group">
            <span className="text-[11px] uppercase tracking-[0.2em] font-black">Continue</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
}

