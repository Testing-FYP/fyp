'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin, Calendar as CalendarIcon, Users, Plane, DollarSign, Hotel, Bus, Star,
  ChevronRight, ChevronLeft, Check, Minus, Plus, Sparkles,
  Wifi, Coffee, UtensilsCrossed, Dumbbell, CarFront, Train, ArrowRight, BedDouble,
  Compass, AlertTriangle, Lightbulb, Pencil, Loader2, X
} from 'lucide-react';
import AirportAutocomplete from './AirportAutocomplete';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { formatFromUSD, useCurrency } from '@/context/CurrencyContext';
import { useTranslations } from 'next-intl';

type TripType = 'one_way' | 'round_trip' | 'multi_city';
type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';
type BudgetFlightCabinClass = 'economy' | 'business';
type BudgetMode = 'total' | 'per_category';
type TransportType = 'metro_subway' | 'train' | 'public_bus' | 'taxi' | 'rideshare_uber' | 'rental_car';
type TransportPriority = 'cheapest' | 'fastest' | 'comfortable';
type BudgetCategoryKey = 'flightBudget' | 'hotelBudget' | 'transportBudget' | 'dailyExpenseBudget';

type AiBudgetGuide = Record<BudgetCategoryKey, number> & {
  totalBudget: number;
};

type BudgetWarning = {
  key: string;
  kind: 'total-over' | 'category-over' | 'category-under';
  label: string;
  guideAmount: number;
  selectedAmount: number;
  selectedTotal: number;
  categoryKey?: BudgetCategoryKey;
};

type BudgetEstimateCacheEntry = {
  savedAt: number;
  plannerPatch: Partial<PlannerData>;
  aiBudgetGuide: AiBudgetGuide;
  budgetFlightAverages: Record<BudgetFlightCabinClass, number>;
  budgetFlightSamplesByCabin: Partial<Record<BudgetFlightCabinClass, BudgetFlightSample[]>>;
  selectedBudgetFlightCabins: BudgetFlightCabinClass[];
  budgetHotelAveragesByStars: Record<string, number> | null;
  selectedBudgetHotelStars: number[];
  note: string;
};

type BudgetFlightSample = {
  index: number;
  price: number;
  airline: string;
  cabin: string;
  route?: string;
  stops?: number;
  duration?: number | string | null;
  type?: string;
};

type DailyCategory = {
  key: string;
  label: string;
  estimatedCost: number;
  suggestedPlace?: string;
  suggestedPlaces?: { name: string; estimatedCost?: number; detail?: string }[];
  detail?: string;
  selected?: boolean;
};

type TransportBudgetSelection = {
  selected: boolean;
  quantity: number;
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
  directOnly: boolean;
  // Step 5
  includeHotel: boolean;
  hotelStars: number;
  hotelRooms: number;
  hotelRoomsPerApartment: number;
  hotelBeds: number;
  hotelAmenities: string[];
  nearAirport: boolean;
  nights: number;
  // Step 6 - Transport
  includeTransport: boolean;
  transportTypes: TransportType[];
  transportPriority: TransportPriority;
  transportOptions?: TransportOption[];
  transportDataSource?: string;
  // Step 7 - Vibe
  vibes: string[];
  // Step 8 - Budget
  budgetMode: BudgetMode;
  budgetMin: number;
  budgetMax: number;
  totalBudget: number;
  flightBudget: number;
  hotelBudget: number;
  transportBudget: number;
  dailyExpenseBudget: number;
  budgetFlightCabins: BudgetFlightCabinClass[];
  budgetHotelStars: number[];
  budgetHotelAveragesByStars?: Record<string, number>;
  includePlaceVisits: boolean;
  dailyCategories?: DailyCategory[];
  transportBudgetSelections?: Partial<Record<TransportType, TransportBudgetSelection>>;

}

interface TripPlannerWizardProps {
  onComplete: (data: PlannerData) => void;
  isLoading: boolean;
  initialStep?: number;
  initialData?: Partial<PlannerData>;
  onBudgetOverviewChange?: (overview: {
    flights: number;
    hotel: number;
    transport: number;
    places: number;
    total: number;
    remaining: number;
    isOverBudget: boolean;
    isDetailedMode: boolean;
  }) => void;
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

const VIBE_TRANSLATION_KEYS: Record<string, string> = {
  food_drink: 'foodDrink',
  nature_outdoors: 'nature',
  culture_history: 'cultureHistory',
  shopping_exploring: 'shoppingExploring',
  nightlife_entertainment: 'nightlife',
  relaxation_wellness: 'relaxation',
  art_architecture: 'art',
  family_friendly: 'family',
};

const TRANSPORT_OPTIONS: { value: TransportType; label: string; icon: any }[] = [
  { value: 'metro_subway', label: 'Metro / Subway', icon: Train },
  { value: 'train', label: 'Train', icon: Train },
  { value: 'public_bus', label: 'Public Bus', icon: Bus },
  { value: 'taxi', label: 'Taxi', icon: CarFront },
  { value: 'rideshare_uber', label: 'Rideshare / Uber', icon: CarFront },
  { value: 'rental_car', label: 'Rental Car', icon: CarFront },
];

const ALL_TRANSPORT_TYPES = TRANSPORT_OPTIONS.map(option => option.value);
const BUDGET_FLIGHT_CABIN_CLASSES: BudgetFlightCabinClass[] = ['economy', 'business'];
const BUDGET_FLIGHT_CABIN_LABELS: Record<BudgetFlightCabinClass, string> = {
  economy: 'Economy',
  business: 'Business',
};
const BUDGET_HOTEL_STAR_OPTIONS = [1, 2, 3, 4, 5];
const BUDGET_AUTO_ALLOCATE_DELAY_MS = 6600;

const STEPS = [
  { titleKey: 'step1' },
  { titleKey: 'step2' },
  { titleKey: 'step3' },
  { titleKey: 'step4' },
  { titleKey: 'step5' },
  { titleKey: 'step6' },
] as const;

const STEP_CONTENT_IDS = [0, 1, 2, 9, 6, 8] as const;

function formatTransportUsdPrice(option?: TransportOption) {
  if (!option) return { price: 'Manual', detail: '' };

  const source = [
    option.priceLabel,
    option.singleTicketPrice,
    option.dayPassPrice,
    option.priceRange,
    (option as any).estimatedFareRange,
    (option as any).pricePerDay,
  ].filter(Boolean).join(' ');
  const usdMatch = source.match(/~?\$(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?/i);
  const formatAmount = (value: string) => {
    const parsed = Number(value.replace(/,/g, ''));
    if (!Number.isFinite(parsed)) return value;
    return parsed.toFixed(2);
  };
  const price = usdMatch
    ? usdMatch[2]
      ? `$${formatAmount(usdMatch[1])}-${formatAmount(usdMatch[2])}`
      : `$${formatAmount(usdMatch[1])}`
    : typeof option.estimatedPrice === 'number'
      ? `$${option.estimatedPrice.toFixed(2)}`
      : 'Manual';

  const lowerLabel = String(option.priceLabel || '').toLowerCase();
  const detail = option.id === 'rental_car'
    ? 'per day'
    : lowerLabel.includes('day')
      ? 'day pass'
      : lowerLabel.includes('city ride') || option.id === 'taxi' || option.id === 'rideshare_uber'
        ? 'typical city ride'
        : 'single ride';

  return { price, detail };
}

function getTransportMode(option?: TransportOption): TransportType | null {
  const mode = option?.id || option?.transportType || option?.type;
  return mode || null;
}

function isVehicleTransport(type: TransportType) {
  return type === 'taxi' || type === 'rideshare_uber' || type === 'rental_car';
}

function getTransportDailyUnitPrice(option?: TransportOption) {
  if (!option || option.available === false || typeof option.estimatedPrice !== 'number') return 0;
  const type = getTransportMode(option);
  if (type === 'rental_car') return option.estimatedPrice;
  if (type === 'taxi' || type === 'rideshare_uber') return option.estimatedPrice;
  if (type === 'train') return option.estimatedPrice;
  return option.estimatedPrice;
}

function getDefaultTransportQuantity(type: TransportType, travelerCount: number) {
  return isVehicleTransport(type) ? Math.max(1, Math.ceil(travelerCount / 4)) : Math.max(1, travelerCount);
}

function buildDefaultTransportSelections(options: TransportOption[], travelerCount: number) {
  const selections: Partial<Record<TransportType, TransportBudgetSelection>> = {};
  const pricedOptions = options
    .filter(option => option.available !== false)
    .map(option => {
      const type = getTransportMode(option);
      if (!type) return null;
      const quantity = getDefaultTransportQuantity(type, travelerCount);
      const dailyTotal = getTransportDailyUnitPrice(option) * quantity;
      selections[type] = { selected: false, quantity };
      return dailyTotal > 0 ? { type, dailyTotal } : null;
    })
    .filter((option): option is { type: TransportType; dailyTotal: number } => !!option);

  const cheapest = pricedOptions.sort((a, b) => a.dailyTotal - b.dailyTotal)[0];
  if (cheapest && selections[cheapest.type]) {
    selections[cheapest.type] = { ...selections[cheapest.type]!, selected: true };
  }
  return selections;
}

function calculateTransportBudgetFromSelections(
  options: TransportOption[] | undefined,
  selections: Partial<Record<TransportType, TransportBudgetSelection>> | undefined,
  nights: number
) {
  if (!options?.length || !selections) return 0;
  return options.reduce((sum, option) => {
    const type = getTransportMode(option);
    if (!type || !selections[type]?.selected) return sum;
    return sum + getTransportDailyUnitPrice(option) * Math.max(1, Number(selections[type]?.quantity || 1)) * nights;
  }, 0);
}

function getDailyCategoryIcon(category: DailyCategory) {
  const text = `${category.key} ${category.label}`.toLowerCase();
  if (text.includes('coffee') || text.includes('drink')) return Coffee;
  if (text.includes('shopping') || text.includes('shop')) return DollarSign;
  if (text.includes('breakfast') || text.includes('lunch') || text.includes('dinner') || text.includes('snack') || text.includes('meal')) return UtensilsCrossed;
  if (text.includes('zoo') || text.includes('ticket') || text.includes('museum') || text.includes('tour') || text.includes('attraction') || text.includes('activity')) return Compass;
  return Star;
}

function normalizeDailyCategorySelection(categories: any[]): DailyCategory[] {
  return categories.map((category, index) => ({
    key: String(category?.key || category?.label || `daily_item_${index + 1}`),
    label: String(category?.label || category?.key || `Daily item ${index + 1}`),
    estimatedCost: Math.max(0, Math.round(Number(category?.estimatedCost || 0))),
    suggestedPlace: category?.suggestedPlace || category?.place || category?.where ? String(category?.suggestedPlace || category?.place || category?.where) : undefined,
    suggestedPlaces: Array.isArray(category?.suggestedPlaces) ? category.suggestedPlaces : undefined,
    detail: category?.detail ? String(category.detail) : undefined,
    selected: category?.selected !== false,
  }));
}

function formatDailyCategoryLabel(label: string) {
  return label.replace(/\s*\/\s*/g, ' / ');
}

export default function TripPlannerWizard({ onComplete, isLoading, initialStep = 0, initialData, onBudgetOverviewChange }: TripPlannerWizardProps) {
  const t = useTranslations('wizard');
  const t1 = useTranslations('wizardStep1');
  const t2 = useTranslations('wizardStep2');
  const t3 = useTranslations('wizardStep3');
  const t4 = useTranslations('wizardStep4');
  const t5 = useTranslations('wizardStep5');
  const t6 = useTranslations('wizardStep6');
  useCurrency();
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), STEPS.length - 1));
  const [direction, setDirection] = useState(1);
  const [autocompleteSource, setAutocompleteSource] = useState<'serpapi' | 'duffel'>('serpapi');
  const [hasMounted, setHasMounted] = useState(false);
  // 'range' = initial picking (click from, then to), 'idle' = both set,
  // 'editDeparture' = picking departure only, 'editReturn' = picking return only
  const [datePickMode, setDatePickMode] = useState<'range' | 'idle' | 'editDeparture' | 'editReturn'>('range');

  const [data, setData] = useState<PlannerData>(() => {
    const defaults: PlannerData = {
      origin: '',
      destination: '',
      tripType: 'round_trip',
      departureDate: '',
      returnDate: '',
      adults: 1,
      children: 0,
      includeFlight: true,
      cabinClass: 'economy',
      includeBaggage: true,
      directOnly: false,
      budgetMode: 'total',
      budgetMin: 0,
      budgetMax: 5000,
      totalBudget: 5000,
      flightBudget: 0,
      hotelBudget: 0,
      transportBudget: 0,
      dailyExpenseBudget: 0,
      budgetFlightCabins: [],
      budgetHotelStars: [],
      budgetHotelAveragesByStars: {},
      includePlaceVisits: true,
      dailyCategories: [],
      includeHotel: true,
      hotelStars: 4,
      hotelRooms: 1,
      hotelRoomsPerApartment: 1,
      hotelBeds: 2,
      hotelAmenities: ['wifi', 'breakfast'],
      nearAirport: false,
      nights: 1,
      includeTransport: true,
      transportTypes: ['public_bus'],
      transportPriority: 'cheapest',
      transportBudgetSelections: {},
      vibes: [],
    };
    const merged = { ...defaults, ...initialData };
    const budgetMax = Number(initialData?.budgetMax ?? initialData?.totalBudget ?? defaults.budgetMax);
    return {
      ...merged,
      budgetMin: Number(initialData?.budgetMin ?? defaults.budgetMin),
      budgetMax,
      totalBudget: budgetMax,
    };
  });

  const update = (partial: Partial<PlannerData>) => setData(prev => {
    const next = { ...prev, ...partial };
    if (partial.budgetMax !== undefined) {
      next.totalBudget = partial.budgetMax;
    } else if (partial.totalBudget !== undefined) {
      next.budgetMax = partial.totalBudget;
    }
    return next;
  });
  const [transportLoading, setTransportLoading] = useState(false);
  const [budgetEstimateLoading, setBudgetEstimateLoading] = useState(false);
  const [budgetEstimateError, setBudgetEstimateError] = useState('');
  const [budgetEstimateNote, setBudgetEstimateNote] = useState('');
  const [budgetAutoAllocated, setBudgetAutoAllocated] = useState(false);
  const [budgetAutoDelayPending, setBudgetAutoDelayPending] = useState(false);
  const [budgetWarningsEnabled, setBudgetWarningsEnabled] = useState(false);
  const budgetAutoAllocatedKeyRef = useRef('');
  const budgetAutoRequestedKeyRef = useRef('');
  const budgetEstimateEntryRef = useRef<BudgetEstimateCacheEntry | null>(null);
  const budgetEstimateEntryKeyRef = useRef('');
  const budgetEstimateEntryFromCacheRef = useRef(false);
  const budgetEstimatePromiseRef = useRef<Promise<BudgetEstimateCacheEntry> | null>(null);
  const budgetEstimatePromiseKeyRef = useRef('');
  const [selectedBudgetFlightCabins, setSelectedBudgetFlightCabins] = useState<BudgetFlightCabinClass[]>([]);
  const [budgetFlightAverages, setBudgetFlightAverages] = useState<Record<BudgetFlightCabinClass, number> | null>(null);
  const [budgetFlightSamplesByCabin, setBudgetFlightSamplesByCabin] = useState<Partial<Record<BudgetFlightCabinClass, BudgetFlightSample[]>>>({});
  const [selectedBudgetHotelStars, setSelectedBudgetHotelStars] = useState<number[]>([]);
  const [budgetHotelAveragesByStars, setBudgetHotelAveragesByStars] = useState<Record<string, number> | null>(null);
  const [includePlaceVisits, setIncludePlaceVisits] = useState(true);
  const [aiBudgetGuide, setAiBudgetGuide] = useState<AiBudgetGuide>(() => ({
    totalBudget: data.totalBudget,
    flightBudget: data.flightBudget,
    hotelBudget: data.hotelBudget,
    transportBudget: data.transportBudget,
    dailyExpenseBudget: data.dailyExpenseBudget,
  }));
  const [budgetWarning, setBudgetWarning] = useState<BudgetWarning | null>(null);
  const [dismissedBudgetWarningKeys, setDismissedBudgetWarningKeys] = useState<string[]>([]);

  const getBudgetAutoAllocateKey = (current: PlannerData, placesEnabled: boolean) => [
    current.origin,
    current.destination,
    current.destinationCity || '',
    current.destinationCountry || '',
    current.destinationCountryCode || '',
    current.tripType,
    current.departureDate,
    current.returnDate,
    current.nights,
    current.adults,
    current.children,
    current.includeFlight,
    current.includeHotel,
    current.hotelRooms,
    current.hotelRoomsPerApartment,
    current.includeTransport,
    placesEnabled,
    (current.vibes || []).join(','),
  ].join('|');

  const getBudgetEstimateCacheKey = (budgetAutoKey: string) => `travel-lite:budget-estimates:v8:${budgetAutoKey}`;

  const applyBudgetEstimateCacheEntry = (entry: BudgetEstimateCacheEntry, budgetAutoKey: string, fromCache = false) => {
    update(entry.plannerPatch);
    setAiBudgetGuide(entry.aiBudgetGuide);
    setDismissedBudgetWarningKeys([]);
    setBudgetFlightAverages(entry.budgetFlightAverages);
    setBudgetFlightSamplesByCabin(entry.budgetFlightSamplesByCabin || {});
    setSelectedBudgetFlightCabins(entry.selectedBudgetFlightCabins);
    setBudgetHotelAveragesByStars(entry.budgetHotelAveragesByStars);
    setSelectedBudgetHotelStars(entry.selectedBudgetHotelStars);
    setBudgetAutoAllocated(true);
    setBudgetWarningsEnabled(true);
    budgetAutoAllocatedKeyRef.current = budgetAutoKey;
    setBudgetEstimateNote(fromCache ? 'Cached live estimates applied. Same search, no API call needed.' : entry.note);
  };

  const readBudgetEstimateCache = (budgetAutoKey: string): BudgetEstimateCacheEntry | null => {
    if (typeof window === 'undefined') return null;

    try {
      const raw = window.localStorage.getItem(getBudgetEstimateCacheKey(budgetAutoKey));
      if (!raw) return null;
      const entry = JSON.parse(raw) as BudgetEstimateCacheEntry;
      if (!entry?.plannerPatch || !entry?.aiBudgetGuide) return null;
      return entry;
    } catch (error) {
      console.warn('[Budget auto allocate] Cache read failed', error);
      return null;
    }
  };

  const writeBudgetEstimateCache = (budgetAutoKey: string, entry: BudgetEstimateCacheEntry) => {
    if (typeof window === 'undefined') return;

    try {
      window.localStorage.setItem(getBudgetEstimateCacheKey(budgetAutoKey), JSON.stringify(entry));
    } catch (error) {
      console.warn('[Budget auto allocate] Cache write failed', error);
    }
  };

  const delayBudgetAutoApply = () => new Promise(resolve => {
    window.setTimeout(resolve, BUDGET_AUTO_ALLOCATE_DELAY_MS);
  });

  const fetchBudgetEstimates = async (): Promise<BudgetEstimateCacheEntry> => {
    const budgetAutoKey = getBudgetAutoAllocateKey(data, includePlaceVisits);
    setBudgetEstimateLoading(true);
    setBudgetEstimateError('');
    setBudgetEstimateNote('');
    const cachedEntry = readBudgetEstimateCache(budgetAutoKey);
    if (cachedEntry) {
      budgetEstimateEntryRef.current = cachedEntry;
      budgetEstimateEntryKeyRef.current = budgetAutoKey;
      budgetEstimateEntryFromCacheRef.current = true;
      setBudgetEstimateLoading(false);
      return cachedEntry;
    }
    console.log('[Budget auto allocate] Requesting live averages', {
      origin: data.origin,
      destination: data.destination,
      departureDate: data.departureDate,
      returnDate: data.returnDate,
      totalBudget: data.totalBudget,
    });
    try {
      const budgetEstimatePayload = {
        origin: data.origin,
        destination: data.destination,
        destinationCity: data.destinationCity || data.destination,
        destinationCountry: data.destinationCountry || '',
        destinationCountryCode: data.destinationCountryCode || '',
        tripType: data.tripType,
        departureDate: data.departureDate,
        returnDate: data.returnDate,
        nights: data.nights,
        adults: data.adults,
        children: data.children,
        includeFlight: data.includeFlight,
        cabinClasses: BUDGET_FLIGHT_CABIN_CLASSES,
        includeBaggage: data.includeBaggage,
        directOnly: data.directOnly,
        includeHotel: data.includeHotel,
        hotelRooms: data.hotelRooms,
        hotelRoomsPerApartment: data.hotelRoomsPerApartment,
        includeTransport: data.includeTransport,
        transportTypes: ALL_TRANSPORT_TYPES,
        transportPriority: data.transportPriority,
        vibes: data.vibes,
        includePlaceVisits,
        allowTransportLookup: step === 3,
        stepContext: step === 3 ? 'budget' : 'other',
      };

      const response = await fetch('/api/budget-estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(budgetEstimatePayload),
      });
      const json = await response.json();
      if (!response.ok || json?.error) throw new Error(json?.error || 'Could not estimate budget.');

      const travelerCount = Math.max(1, data.adults + data.children);
      const safeNights = Math.max(1, data.nights);
      const flightAverages = {
        economy: Math.round(Number(json.flightAverages?.economy ?? json.flightPerPerson) || 0),
        business: Math.round(Number(json.flightAverages?.business ?? json.flightPerPerson) || 0),
      };
      const flightSamplesByCabin = {
        economy: Array.isArray(json.flightSamplesByCabin?.economy) ? json.flightSamplesByCabin.economy : [],
        business: Array.isArray(json.flightSamplesByCabin?.business) ? json.flightSamplesByCabin.business : [],
      } as Partial<Record<BudgetFlightCabinClass, BudgetFlightSample[]>>;
      const defaultFlightCabin: BudgetFlightCabinClass = data.cabinClass === 'business' ? 'business' : 'economy';
      const defaultHotelStar = Math.max(1, Math.min(5, Math.round(Number(data.hotelStars) || 3)));
      const hotelAveragesByStars = Object.fromEntries(
        Object.entries(json.hotelAveragesByStars || {})
          .map(([star, value]) => [star, Math.round(Number(value) || 0)])
          .filter(([, value]) => Number(value) > 0)
      ) as Record<string, number>;
      const nextTransportOptions = Array.isArray(json.transportOptions) ? json.transportOptions : data.transportOptions || [];
      const nextTransportBudgetSelections = buildDefaultTransportSelections(nextTransportOptions, travelerCount);
      const flightPerPerson = data.includeFlight ? Math.round(Number(flightAverages[defaultFlightCabin]) || 0) : 0;
      const transportPerPersonPerDay = Math.round(Number(json.transportPerPersonPerDay ?? json.transportPerPerson) || 0);
      const nextDailyCategories = Array.isArray(json.dailyCategories) ? normalizeDailyCategorySelection(json.dailyCategories) : data.dailyCategories || [];
      const selectedDailyCategoryTotal = nextDailyCategories
        .filter(category => category.selected !== false)
        .reduce((sum, category) => sum + Number(category.estimatedCost || 0), 0);
      const placeVisitCostPerDay = Math.round(selectedDailyCategoryTotal || Number(json.placeVisitCostPerDay ?? json.placeVisitCost) || 0);
      const flightBudget = data.includeFlight ? flightPerPerson * travelerCount : 0;
      const hotelNightlyAverage = data.includeHotel ? Math.round(Number(hotelAveragesByStars[String(defaultHotelStar)]) || 0) : 0;
      const hotelBudget = data.includeHotel ? hotelNightlyAverage * Math.max(1, data.hotelRooms) * safeNights : 0;
      const selectedTransportBudget = calculateTransportBudgetFromSelections(nextTransportOptions, nextTransportBudgetSelections, safeNights);
      const transportBudget = data.includeTransport ? (selectedTransportBudget || transportPerPersonPerDay * travelerCount * safeNights) : 0;
      const dailyExpenseBudget = includePlaceVisits ? placeVisitCostPerDay * travelerCount * safeNights : 0;
      const allocatedTotalBudget = flightBudget + hotelBudget + transportBudget + dailyExpenseBudget;
      console.log('[Budget auto allocate] Applying selected live values', {
        totalBudget: allocatedTotalBudget,
        flightBudget,
        hotelBudget,
        transportBudget,
        dailyExpenseBudget,
        rawEstimates: json,
      });

      const plannerPatch: Partial<PlannerData> = {
        budgetMode: 'per_category',
        budgetMax: allocatedTotalBudget,
        totalBudget: allocatedTotalBudget,
        flightBudget,
        hotelBudget,
        transportBudget,
        transportOptions: nextTransportOptions,
        transportDataSource: json.sources?.transport || data.transportDataSource,
        transportBudgetSelections: nextTransportBudgetSelections,
        dailyExpenseBudget,
        dailyCategories: nextDailyCategories,
        budgetFlightCabins: data.includeFlight ? [defaultFlightCabin] : [],
        budgetHotelStars: data.includeHotel ? [defaultHotelStar] : [],
        budgetHotelAveragesByStars: hotelAveragesByStars,
      };
      const nextAiBudgetGuide: AiBudgetGuide = {
        totalBudget: allocatedTotalBudget,
        flightBudget,
        hotelBudget,
        transportBudget,
        dailyExpenseBudget,
      };
      const sources = json.sources
        ? [json.sources.flight, json.sources.hotel, json.sources.transport, json.sources.daily].filter(Boolean).join(' / ')
        : '';
      const note = [json.currencyNote, sources ? 'Live estimates applied as selected slider values.' : 'Live estimates applied.']
        .filter(Boolean)
        .join(' - ');
      const cacheEntry: BudgetEstimateCacheEntry = {
        savedAt: Date.now(),
        plannerPatch,
        aiBudgetGuide: nextAiBudgetGuide,
        budgetFlightAverages: flightAverages,
        budgetFlightSamplesByCabin: flightSamplesByCabin,
        selectedBudgetFlightCabins: data.includeFlight ? [defaultFlightCabin] : [],
        budgetHotelAveragesByStars: Object.keys(hotelAveragesByStars).length ? hotelAveragesByStars : null,
        selectedBudgetHotelStars: data.includeHotel ? [defaultHotelStar] : [],
        note,
      };

      writeBudgetEstimateCache(budgetAutoKey, cacheEntry);
      budgetEstimateEntryRef.current = cacheEntry;
      budgetEstimateEntryKeyRef.current = budgetAutoKey;
      budgetEstimateEntryFromCacheRef.current = false;
      return cacheEntry;
    } catch (error: any) {
      console.error('[Budget auto allocate] Failed', error?.message || error);
      setBudgetEstimateError(error?.message || 'Could not estimate budget.');
      throw error;
    } finally {
      setBudgetEstimateLoading(false);
      if (budgetEstimatePromiseKeyRef.current === budgetAutoKey) {
        budgetEstimatePromiseRef.current = null;
        budgetEstimatePromiseKeyRef.current = '';
      }
    }
  };

  const prepareBudgetEstimates = () => {
    if (budgetEstimateEntryRef.current && budgetEstimateEntryKeyRef.current === budgetAutoAllocateKey) {
      return Promise.resolve(budgetEstimateEntryRef.current);
    }
    if (budgetEstimatePromiseRef.current && budgetEstimatePromiseKeyRef.current === budgetAutoAllocateKey) {
      return budgetEstimatePromiseRef.current;
    }
    const promise = fetchBudgetEstimates();
    budgetEstimatePromiseRef.current = promise;
    budgetEstimatePromiseKeyRef.current = budgetAutoAllocateKey;
    return promise;
  };

  const runBudgetEstimatesNow = async () => {
    if (budgetAutoAllocated || budgetAutoDelayPending) return;

    setBudgetAutoDelayPending(true);
    setBudgetEstimateError('');
    setBudgetEstimateNote(
      budgetEstimateEntryRef.current && budgetEstimateEntryKeyRef.current === budgetAutoAllocateKey
        ? 'Live estimates ready. Applying after the short wait...'
        : 'Waiting for live estimates, then applying after the short wait...'
    );

    try {
      const entry = await prepareBudgetEstimates();
      await delayBudgetAutoApply();
      applyBudgetEstimateCacheEntry(entry, budgetAutoAllocateKey, budgetEstimateEntryFromCacheRef.current);
    } catch (error: any) {
      setBudgetEstimateError(error?.message || 'Could not estimate budget.');
    } finally {
      setBudgetAutoDelayPending(false);
    }
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setDirection(1);
      setStep(s => s + 1);
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

  const activeContentStep: number = STEP_CONTENT_IDS[step] ?? 0;
  const fixedBudgetMode = data.budgetMode === 'total';
  const selectedCategoryBudgetTotal =
    (data.includeFlight ? data.flightBudget : 0) +
    (data.includeHotel ? data.hotelBudget : 0) +
    (data.includeTransport ? data.transportBudget : 0) +
    (includePlaceVisits ? data.dailyExpenseBudget : 0);
  const aiBudgetGuideTotal = aiBudgetGuide.totalBudget || data.totalBudget;
  const selectedCategoryBudgetDelta = aiBudgetGuideTotal - selectedCategoryBudgetTotal;
  const selectedCategoriesFitBudget = selectedCategoryBudgetDelta >= 0;
  const totalOverBudgetWarningKey = `total-over:${selectedCategoryBudgetTotal}:${aiBudgetGuideTotal}`;

  const canProceed = () => {
    if (step === 0) return data.origin && data.destination;
    if (step === 1) return data.departureDate && (data.tripType !== 'round_trip' || data.returnDate);
    return true;
  };

  const budgetCategoryLabels: Record<BudgetCategoryKey, string> = {
    flightBudget: 'Flights',
    hotelBudget: 'Hotels',
    transportBudget: 'Transportation',
    dailyExpenseBudget: 'Places and daily spending',
  };

  const isBudgetCategoryEnabled = (categoryKey: BudgetCategoryKey) => {
    if (categoryKey === 'flightBudget') return data.includeFlight;
    if (categoryKey === 'hotelBudget') return data.includeHotel;
    if (categoryKey === 'transportBudget') return data.includeTransport;
    return includePlaceVisits;
  };

  const getSelectedTotalWithCategory = (categoryKey: BudgetCategoryKey, nextAmount: number) => {
    const currentActiveAmount = isBudgetCategoryEnabled(categoryKey) ? Number(data[categoryKey] || 0) : 0;
    const nextActiveAmount = isBudgetCategoryEnabled(categoryKey) ? nextAmount : 0;
    return selectedCategoryBudgetTotal - currentActiveAmount + nextActiveAmount;
  };

  const maybeOpenCategoryBudgetWarning = (categoryKey: BudgetCategoryKey, nextAmount: number, nextSelectedTotal?: number) => {
    if (!budgetWarningsEnabled) return;
    if (activeContentStep !== 9 || fixedBudgetMode || !isBudgetCategoryEnabled(categoryKey)) return;

    const guideAmount = Number(aiBudgetGuide[categoryKey] || 0);
    if (guideAmount <= 0 || nextAmount === guideAmount) return;

    const kind: BudgetWarning['kind'] = nextAmount > guideAmount ? 'category-over' : 'category-under';
    const key = `${kind}:${categoryKey}:${nextAmount}:${guideAmount}`;
    if (dismissedBudgetWarningKeys.includes(key) || budgetWarning?.key === key) return;

    setBudgetWarning({
      key,
      kind,
      label: budgetCategoryLabels[categoryKey],
      guideAmount,
      selectedAmount: nextAmount,
      selectedTotal: nextSelectedTotal ?? getSelectedTotalWithCategory(categoryKey, nextAmount),
      categoryKey,
    });
  };

  const dismissBudgetWarning = () => {
    if (budgetWarning) {
      setDismissedBudgetWarningKeys(prev => prev.includes(budgetWarning.key) ? prev : [...prev, budgetWarning.key]);
    }
    setBudgetWarning(null);
  };

  const confirmBudgetWarning = () => {
    if (!budgetWarning) return;

    const nextGuide: AiBudgetGuide = {
      ...aiBudgetGuide,
      totalBudget: budgetWarning.kind === 'total-over' ? budgetWarning.selectedTotal : aiBudgetGuide.totalBudget,
    };

    setAiBudgetGuide(nextGuide);
    if (budgetWarning.kind === 'total-over') {
      update({
        budgetMax: budgetWarning.selectedTotal,
        totalBudget: budgetWarning.selectedTotal,
      });
    }
    setDismissedBudgetWarningKeys(prev => prev.includes(budgetWarning.key) ? prev : [...prev, budgetWarning.key]);
    setBudgetWarning(null);
  };

  const budgetAutoAllocateKey = getBudgetAutoAllocateKey(data, includePlaceVisits);

  useEffect(() => {
    if (!onBudgetOverviewChange) return;
    if (activeContentStep !== 9) {
      onBudgetOverviewChange({
        flights: 0,
        hotel: 0,
        transport: 0,
        places: 0,
        total: 0,
        remaining: 0,
        isOverBudget: false,
        isDetailedMode: false,
      });
      return;
    }
    const flights = data.includeFlight ? data.flightBudget : 0;
    const hotel = data.includeHotel ? data.hotelBudget : 0;
    const transport = data.includeTransport ? data.transportBudget : 0;
    const places = includePlaceVisits ? data.dailyExpenseBudget : 0;
    const total = flights + hotel + transport + places;
    const remaining = data.totalBudget - total;
    onBudgetOverviewChange({
      flights,
      hotel,
      transport,
      places,
      total,
      remaining,
      isOverBudget: remaining < 0,
      isDetailedMode: !fixedBudgetMode,
    });
  }, [
    data.flightBudget, data.hotelBudget, data.transportBudget, data.dailyExpenseBudget,
    data.totalBudget, data.includeFlight, data.includeHotel, data.includeTransport,
    includePlaceVisits, fixedBudgetMode, activeContentStep
  ]);

  useEffect(() => {
    if (!budgetWarningsEnabled) return;
    if (activeContentStep !== 9 || fixedBudgetMode) return;
    if (selectedCategoryBudgetTotal <= aiBudgetGuideTotal) return;
    if (dismissedBudgetWarningKeys.includes(totalOverBudgetWarningKey)) return;
    if (budgetWarning) return;

    setBudgetWarning({
      key: totalOverBudgetWarningKey,
      kind: 'total-over',
      label: 'Total selected categories',
      guideAmount: aiBudgetGuideTotal,
      selectedAmount: selectedCategoryBudgetTotal,
      selectedTotal: selectedCategoryBudgetTotal,
    });
  }, [
    activeContentStep,
    fixedBudgetMode,
    budgetWarningsEnabled,
    selectedCategoryBudgetTotal,
    aiBudgetGuideTotal,
    dismissedBudgetWarningKeys,
    totalOverBudgetWarningKey,
    budgetWarning?.key,
  ]);

  useEffect(() => {
    if (!budgetAutoAllocated) return;
    if (budgetAutoAllocatedKeyRef.current && budgetAutoAllocatedKeyRef.current !== budgetAutoAllocateKey) {
      setBudgetAutoAllocated(false);
      setBudgetAutoDelayPending(false);
      setBudgetWarningsEnabled(false);
      setBudgetWarning(null);
      budgetEstimateEntryRef.current = null;
      budgetEstimateEntryKeyRef.current = '';
      budgetEstimateEntryFromCacheRef.current = false;
      setBudgetFlightAverages(null);
      setBudgetFlightSamplesByCabin({});
      setSelectedBudgetFlightCabins([]);
      setBudgetHotelAveragesByStars(null);
      setSelectedBudgetHotelStars([]);
      setBudgetEstimateNote('');
      setBudgetEstimateError('');
    }
  }, [budgetAutoAllocated, budgetAutoAllocateKey]);

  useEffect(() => {
    if (activeContentStep !== 9 || fixedBudgetMode) return;
    if (budgetAutoAllocated) return;
    if (!data.origin || !data.destination || !data.departureDate) return;
    if (budgetAutoRequestedKeyRef.current === budgetAutoAllocateKey) return;

    budgetAutoRequestedKeyRef.current = budgetAutoAllocateKey;
    prepareBudgetEstimates()
      .then(() => undefined)
      .catch(() => undefined);
  }, [
    activeContentStep,
    fixedBudgetMode,
    budgetAutoAllocated,
    data.origin,
    data.destination,
    data.departureDate,
    budgetAutoAllocateKey,
  ]);

  const progress = ((step + 1) / STEPS.length) * 100;

  useEffect(() => {
    setHasMounted(true);
    if (!initialData?.departureDate && data.tripType === 'one_way' && !data.departureDate) {
      update({ departureDate: new Date().toISOString().split('T')[0] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const HOTEL_NIGHTLY: Record<number, number> = { 1: 60, 2: 100, 3: 160, 4: 280, 5: 450 };
  const CABIN_FALLBACK: Record<string, number> = { economy: 300, premium_economy: 600, business: 1500, first: 3000 };

  // Use the user-editable nights from wizard state (no hardcoded fallback)
  const nights = data.nights;

  const totalTravelers = data.adults + data.children;

  // Derive the destination city name from the IATA code for display
  const destinationCity = data.destination || '';

  const estimatedFlightPrice = (CABIN_FALLBACK[data.cabinClass] || 300) * totalTravelers;
  const costLoading = false;
  const costEstimates = {
    dailyMeals: 50,
    dailyTransport: 20,
    dailyMiscellaneous: 15,
    currencyNote: '',
  };

  const suggestedBudget = useMemo(() => {
    // Only calculate and log in an active browser session on/after Step 8 (step === 7)
    if (!hasMounted || step < 7) {
      return null;
    }

    const flightCost = estimatedFlightPrice;
    const hotelApartmentCount = Math.max(1, data.hotelRooms);
    const hotelCost = (HOTEL_NIGHTLY[data.hotelStars] || 160) * nights * hotelApartmentCount;
    const meals = 50;
    const transport = 20;
    const misc = 15;
    const dailyCostPerPerson = meals + transport + misc;
    const totalDailyCost = dailyCostPerPerson * totalTravelers * nights;
    const total = flightCost + hotelCost + totalDailyCost;
    const rounded = Math.ceil(total / 100) * 100;
    console.log('💰 BUDGET BREAKDOWN:');
    console.log('   ✈️ Flights:', flightCost);
    console.log('   🏨 Hotels:', hotelCost, `($${HOTEL_NIGHTLY[data.hotelStars] || 160}/night × ${nights} nights × ${hotelApartmentCount} apartments)`);
    console.log('   🍽️ Daily meals:', meals * totalTravelers * nights, `($${meals}/person × ${totalTravelers} × ${nights} nights)`);
    console.log('   🚌 Daily transport:', transport * totalTravelers * nights, `($${transport}/person × ${totalTravelers} × ${nights} nights)`);
    console.log('   🛍️ Daily misc:', misc * totalTravelers * nights, `($${misc}/person × ${totalTravelers} × ${nights} nights)`);
    console.log('   💰 Total suggestion:', rounded);
    return rounded;
  }, [hasMounted, estimatedFlightPrice, data.hotelStars, data.hotelRooms, data.hotelRoomsPerApartment, nights, totalTravelers, step]);

  const cabinLabel = ({ economy: 'Economy', premium_economy: 'Premium Economy', business: 'Business', first: 'First Class' } as Record<string, string>)[data.cabinClass] || data.cabinClass;

  const currentBudgetTotal = data.budgetMode === 'total'
    ? data.totalBudget
    : data.flightBudget + data.hotelBudget + data.transportBudget + data.dailyExpenseBudget;

  const isBelowSuggestion = suggestedBudget !== null && currentBudgetTotal < suggestedBudget;

  // Auto-fill budget when suggestion first becomes available or changes
  useEffect(() => {
    if (step !== 7 || suggestedBudget === null) return;
    if (autoFilledRef.current === null || data.totalBudget === autoFilledRef.current) {
      const flightBudget = Math.round(suggestedBudget * 0.45);
      const hotelBudget = Math.round(suggestedBudget * 0.30);
      const transportBudget = Math.round(suggestedBudget * 0.10);
      const dailyExpenseBudget = Math.round(suggestedBudget * 0.15);
      setData(prev => ({
        ...prev,
        budgetMax: suggestedBudget,
        totalBudget: suggestedBudget,
        flightBudget,
        hotelBudget,
        transportBudget,
        dailyExpenseBudget,
      }));
      setAiBudgetGuide({
        totalBudget: suggestedBudget,
        flightBudget,
        hotelBudget,
        transportBudget,
        dailyExpenseBudget,
      });
      setDismissedBudgetWarningKeys([]);
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

  const renderStep = () => {
    switch (activeContentStep) {
      // Step 1 - Destination
      case 0:
        return (
          <div className="space-y-8">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/60 px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t1('autocomplete')}</span>
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
              <label className="small-caps ml-1">{t1('tripType')}</label>
              <div className="flex gap-3">
                {(['one_way', 'round_trip'] as TripType[]).map(type => (
                  <button key={type} type="button" onClick={() => update({ tripType: type })}
                    className={`flex-1 py-4 rounded-2xl border text-xs uppercase tracking-[0.15em] font-bold transition-all ${data.tripType === type ? 'bg-foreground text-background border-foreground shadow-lg shadow-foreground/10' : 'bg-background border-border text-muted-foreground hover:border-foreground/30'}`}>
                    {type === 'one_way' ? t1('oneWay') : t1('roundTrip')}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3 relative z-30">
              <label className="small-caps ml-1">{t1('from')}</label>
              <AirportAutocomplete value={data.origin} onSelect={(v) => update({ origin: v })} placeholder={t1('departureCity')} source={autocompleteSource} />
            </div>
            <div className="space-y-3 relative z-20">
              <label className="small-caps ml-1">{t1('to')}</label>
              <AirportAutocomplete
                value={data.destination}
                onSelect={(v) => update({ destination: v, destinationCity: undefined, destinationCountry: undefined, destinationCountryCode: undefined, transportOptions: undefined, transportDataSource: undefined, transportBudgetSelections: {} })}
                onSelectSuggestion={(suggestion) => update({
                  destination: suggestion.iata_code,
                  destinationCity: suggestion.city_name,
                  destinationCountry: suggestion.country_name,
                  destinationCountryCode: suggestion.country_code || suggestion.iata_country_code,
                  transportOptions: undefined,
                  transportDataSource: undefined,
                  transportBudgetSelections: {},
                })}
                placeholder={t1('arrivalCity')}
                source={autocompleteSource}
              />
            </div>
          </div>
        );

      // Step 2 - Dates
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
                    <p className="text-[0.65rem] small-caps tracking-widest text-muted-foreground">{t('departure')}</p>
                    <p className="text-sm font-medium">
                      {rangeValue.from
                        ? rangeValue.from.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-muted-foreground">{t2('pickADate')}</span>}
                    </p>
                  </div>
                  {effectiveMode === 'idle' && (
                    <button
                      type="button"
                      onClick={() => setDatePickMode('editDeparture')}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-foreground/5 transition-all flex-shrink-0"
                      title={t2('changeDeparture')}
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
                    <p className="text-[0.65rem] small-caps tracking-widest text-muted-foreground">{t('return')}</p>
                    <p className="text-sm font-medium">
                      {rangeValue.to
                        ? rangeValue.to.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : <span className="text-muted-foreground">{t2('pickADate')}</span>}
                    </p>
                  </div>
                  {effectiveMode === 'idle' && (
                    <button
                      type="button"
                      onClick={() => setDatePickMode('editReturn')}
                      className="p-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-foreground/5 transition-all flex-shrink-0"
                      title={t2('changeReturn')}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Editing hint */}
              {(effectiveMode === 'editDeparture' || effectiveMode === 'editReturn') && (
                <p className="text-xs text-center text-muted-foreground">
                  {effectiveMode === 'editDeparture' ? t2('selectNewDeparture') : t2('selectNewReturn')}
                </p>
              )}

              <div className="hidden">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Selected dates</div>
                <div className="mt-1 text-sm font-bold text-foreground">
                  {selectedDateCount > 0 ? `${selectedDateCount} ${selectedDateCount === 1 ? t2('day') : t2('days')}` : t2('noDatesSelected')}
                  {selectedNights > 0 ? ` - ${selectedNights} ${selectedNights === 1 ? t2('night') : t2('nights')}` : ''}
                </div>
              </div>

              {/* Calendar */}
              <div className="flex justify-center">
                {(effectiveMode === 'range' || effectiveMode === 'idle') ? (
                  /* Range mode or idle - show range calendar */
                  <div className="relative overflow-visible">
                    {selectedNights > 0 && (
                      <div
                        className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-[9999] -translate-y-1/2 whitespace-nowrap rounded-lg border border-foreground bg-foreground px-3 py-1 text-xs font-black text-background shadow-2xl"
                        style={{ top: durationBadgeTop }}
                      >
                        {selectedDateCount} {selectedDateCount === 1 ? t2('day') : t2('days')}
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
                  /* Edit single date mode - show single-pick calendar */
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

        return (
          <div className="space-y-6">
            {/* Date label */}
            <div className="bg-muted border border-border rounded-2xl py-4 px-5 flex items-center gap-3">
              <CalendarIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-[0.65rem] small-caps tracking-widest text-muted-foreground">{t('departure')}</p>
                <p className="text-sm font-medium">
                  {selectedDate
                    ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : <span className="text-muted-foreground">{t2('pickADate')}</span>}
                </p>
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

      // Step 3 - Travelers
      case 2:
        return (
          <div className="space-y-5">
            <Counter label={t('adults')} sublabel={t3('adultsAge')} value={data.adults} min={1} onChange={v => update({ adults: v })} />
            <Counter label={t('children')} sublabel={t3('childrenAge')} value={data.children} min={0} onChange={v => update({ children: v })} />
          </div>
        );

      // Step 4 - Flight Preferences
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
                  <div className="grid grid-cols-2 items-start gap-3">
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

      // Step 8 - Budget
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
                  onChange={e => { const totalBudget = parseInt(e.target.value); update({ budgetMax: totalBudget, totalBudget }); autoFilledRef.current = null; }}
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
                      <span className="text-xs text-muted-foreground flex items-center gap-2">🏨 Hotels ({nights} night{nights !== 1 ? 's' : ''} × {data.hotelRooms} apartment{data.hotelRooms !== 1 ? 's' : ''}, {data.hotelRoomsPerApartment || 1} room{(data.hotelRoomsPerApartment || 1) !== 1 ? 's' : ''} inside each)</span>
                      <span className="text-xs font-bold text-foreground font-mono">${((HOTEL_NIGHTLY[data.hotelStars] || 160) * nights * Math.max(1, data.hotelRooms)).toLocaleString()}/total</span>
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
                  Suggested: ${suggestedBudget.toLocaleString()} - estimated based on your cabin class, hotel rating, and destination costs
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
                    We&apos;ll show the best available options within your budget.
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

      // Step 5 - Stay
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

                <Counter label="Apartments" sublabel="How many separate units, like room 102 and 103" value={data.hotelRooms} min={1} onChange={v => update({ hotelRooms: v })} />

                <Counter label="Rooms inside each apartment" sublabel="Bedrooms/rooms inside every selected unit" value={data.hotelRoomsPerApartment || 1} min={1} onChange={v => update({ hotelRoomsPerApartment: v })} />

                {/* Nights counter */}
                <div className="space-y-2">
                  <Counter label={t('nights')} sublabel="How many nights to stay" value={data.nights} min={1} onChange={v => { nightsAutoSet.current = true; update({ nights: Math.min(30, v) }); }} />
                  <div className="px-6 space-y-1">
                    <div className="text-xs text-muted-foreground font-mono">
                      {data.nights} night{data.nights !== 1 ? 's' : ''} × {data.hotelRooms} apartment{data.hotelRooms !== 1 ? 's' : ''} with {data.hotelRoomsPerApartment || 1} room{(data.hotelRoomsPerApartment || 1) !== 1 ? 's' : ''} inside each × {formatFromUSD(HOTEL_NIGHTLY[data.hotelStars] || 160)}/night = {formatFromUSD((HOTEL_NIGHTLY[data.hotelStars] || 160) * data.nights * Math.max(1, data.hotelRooms))}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50">
                      Adjust if you won&apos;t need a hotel for the full duration.
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

      // Step 6 - Transport
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
                          className={`transition-all duration-200 ${
                            !available
                              ? 'flex items-center gap-2 rounded-xl border border-border/60 bg-muted/35 px-3 py-2 text-left text-muted-foreground/60'
                              : selected
                                ? 'flex min-h-[104px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                                : 'flex min-h-[104px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 text-left bg-background border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          }`}>
                          {!available ? (
                            <>
                              <span className="text-sm font-black leading-none">×</span>
                              <span className="min-w-0 text-[10px] font-black uppercase tracking-[0.1em] text-gray-500">{t.label}</span>
                              <span className="ml-auto min-w-0 truncate text-[10px] font-semibold normal-case tracking-normal text-gray-500">{unavailableLabel}</span>
                            </>
                          ) : (
                            <>
                              <div className="flex w-full items-center gap-2">
                                <t.icon className="h-4 w-4 shrink-0" />
                                <span className="text-[11px] font-black uppercase tracking-[0.12em]">{t.label}</span>
                                {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                              </div>
                              <div className="space-y-1">
                                <div className={`text-sm font-black ${selected ? 'text-white' : 'text-foreground'}`}>
                                  {liveOption?.priceLabel || 'Price pending'}
                                </div>
                                <div className={`text-[10px] font-semibold leading-relaxed ${selected ? 'text-white/75' : 'text-muted-foreground'}`}>
                                  {liveOption?.notes || 'Live details will appear here.'}
                                </div>
                              </div>
                            </>
                          )}
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

      // Step 7 - Your Vibe
      // Step 5 - Budget
      case 9: {
        const travelerCount = Math.max(1, data.adults + data.children);
        const safeNights = Math.max(1, data.nights);
        const placesEnabled = includePlaceVisits;
        const fixedBudgetMode = data.budgetMode === 'total';
        const pendingAutoText = budgetAutoAllocated ? 'Customize manually if needed' : 'Run Auto allocate or customize manually';
        const perPersonFlightBudget = data.includeFlight ? Math.round(data.flightBudget / travelerCount) : 0;
        const perPersonTransportBudget = data.includeTransport ? Math.round(data.transportBudget / travelerCount) : 0;
        const perPersonPlaceBudget = placesEnabled ? Math.round(data.dailyExpenseBudget / travelerCount) : 0;
        const hotelApartmentCount = Math.max(1, data.hotelRooms);
        const hotelRoomsPerApartment = Math.max(1, data.hotelRoomsPerApartment || 1);
        const perHotelApartmentNightBudget = data.includeHotel ? Math.round(data.hotelBudget / hotelApartmentCount / safeNights) : 0;
        const perPersonTransportDayBudget = data.includeTransport ? Math.round(perPersonTransportBudget / safeNights) : 0;
        const placeVisitDayBudget = placesEnabled ? Math.round(perPersonPlaceBudget / safeNights) : 0;
        const travelerText = `${travelerCount} traveler${travelerCount !== 1 ? 's' : ''}`;
        const savedBudgetHotelAveragesByStars = data.budgetHotelAveragesByStars && Object.keys(data.budgetHotelAveragesByStars).length
          ? data.budgetHotelAveragesByStars
          : null;
        const appliedBudgetHotelAveragesByStars = budgetHotelAveragesByStars || savedBudgetHotelAveragesByStars;
        const unlockBudgetAutoAllocate = () => {
          if (!budgetAutoAllocated) return;
          setBudgetAutoAllocated(false);
          budgetAutoAllocatedKeyRef.current = '';
        };
        const applyBudgetFlightCabinClass = (nextCabinClass: BudgetFlightCabinClass) => {
          unlockBudgetAutoAllocate();
          const nextSelection = selectedBudgetFlightCabins.includes(nextCabinClass)
            ? selectedBudgetFlightCabins.filter(cabinClass => cabinClass !== nextCabinClass)
            : [...selectedBudgetFlightCabins, nextCabinClass];

          setSelectedBudgetFlightCabins(nextSelection);
          if (!budgetFlightAverages || !data.includeFlight) {
            setBudgetEstimateNote(
              nextSelection.length
                ? `Manual flight budget marked for ${nextSelection.map(cabinClass => BUDGET_FLIGHT_CABIN_LABELS[cabinClass]).join(' + ')}.`
                : 'No flight cabin selected for manual budget.'
            );
            return;
          }

          const selectedAverages = nextSelection
            .map(cabinClass => budgetFlightAverages[cabinClass])
            .filter(value => Number.isFinite(value) && value > 0);
          const flightPerPerson = selectedAverages.length
            ? Math.max(...selectedAverages)
            : 0;

          const nextFlightBudget = flightPerPerson * travelerCount;
          maybeOpenCategoryBudgetWarning('flightBudget', nextFlightBudget);
          update({
            budgetMode: 'per_category',
            flightBudget: nextFlightBudget,
            budgetFlightCabins: nextSelection,
          });
          setBudgetEstimateNote(
            nextSelection.length
              ? `${nextSelection.map(cabinClass => BUDGET_FLIGHT_CABIN_LABELS[cabinClass]).join(' + ')} selected. Highest average applied to flight budget.`
              : 'No flight cabin average selected.'
          );
        };
        const applyBudgetHotelStar = (nextStar: number) => {
          unlockBudgetAutoAllocate();
          const nextSelection = selectedBudgetHotelStars.includes(nextStar)
            ? selectedBudgetHotelStars.filter(star => star !== nextStar)
            : [...selectedBudgetHotelStars, nextStar];
          const highestSelectedStar = nextSelection.length ? Math.max(...nextSelection) : null;
          setSelectedBudgetHotelStars(nextSelection);

          if (!appliedBudgetHotelAveragesByStars || !data.includeHotel) {
            setBudgetEstimateNote(
              highestSelectedStar
                ? `Manual hotel budget marked up to ${highestSelectedStar}-star apartments.`
                : 'No hotel star categories selected for manual budget.'
            );
            return;
          }

          const nightlyAverage = highestSelectedStar ? Number(appliedBudgetHotelAveragesByStars[String(highestSelectedStar)] || 0) : 0;
          const nextHotelBudget = nightlyAverage > 0 ? nightlyAverage * hotelApartmentCount * safeNights : 0;
          maybeOpenCategoryBudgetWarning('hotelBudget', nextHotelBudget);
          update({
            budgetMode: 'per_category',
            hotelBudget: nextHotelBudget,
            budgetHotelStars: nextSelection,
          });
          setBudgetEstimateNote(
            highestSelectedStar
              ? `${highestSelectedStar}-star apartment average applied because it is the highest selected hotel category.`
              : 'No hotel star average selected.'
          );
        };
        const updateHotelBudgetStructure = (nextValues: { hotelRooms?: number; hotelRoomsPerApartment?: number }) => {
          unlockBudgetAutoAllocate();
          setBudgetEstimateNote('');
          update({
            ...nextValues,
            budgetMode: 'per_category',
          });
        };
        const HotelBudgetCounter = ({ label, value, onChange, max }: { label: string; value: number; onChange: (value: number) => void; max: number }) => (
          <div className="rounded-2xl border border-border bg-muted px-4 py-3">
            <div className="mb-3 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/60">{label}</div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onChange(Math.max(1, value - 1))}
                disabled={value <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background text-foreground transition hover:bg-foreground hover:text-background disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-8 text-center font-mono text-xl font-black text-foreground">{value}</span>
              <button
                type="button"
                onClick={() => onChange(Math.min(max, value + 1))}
                disabled={value >= max}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-foreground bg-foreground text-background transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
        const budgetRows = [
          {
            key: 'flight',
            label: t4('flightsFor'),
            detail: data.includeFlight ? (data.flightBudget > 0 ? `$${perPersonFlightBudget.toLocaleString()} ${t4('perTraveler')} × ${travelerText}` : pendingAutoText) : t4('flightsOff'),
            icon: Plane,
            value: data.flightBudget,
            max: 50000,
            step: 50,
            enabled: data.includeFlight,
            toggle: () => {
              const includeFlight = !data.includeFlight;
              unlockBudgetAutoAllocate();
              setBudgetEstimateNote('');
              update({ includeFlight });
            },
            onChange: (value: number) => {
              unlockBudgetAutoAllocate();
              maybeOpenCategoryBudgetWarning('flightBudget', value);
              update({ flightBudget: value, budgetMode: 'per_category' });
            },
          },
          {
            key: 'hotel',
            label: t4('hotelFor'),
            detail: data.includeHotel ? (data.hotelBudget > 0 ? `$${perHotelApartmentNightBudget.toLocaleString()} ${t4('perApartmentNight')} × ${hotelApartmentCount} ${t4('apartment')}${hotelApartmentCount !== 1 ? 's' : ''} × ${safeNights} ${safeNights === 1 ? t2('day') : t2('days')}. Searching ${hotelRoomsPerApartment}-room ${t4('apartment')}${hotelRoomsPerApartment !== 1 ? 's' : ''}.` : pendingAutoText) : t4('hotelOff'),
            icon: Hotel,
            value: data.hotelBudget,
            max: 50000,
            step: 25,
            enabled: data.includeHotel,
            toggle: () => {
              const includeHotel = !data.includeHotel;
              unlockBudgetAutoAllocate();
              setBudgetEstimateNote('');
              update({ includeHotel });
            },
            onChange: (value: number) => {
              unlockBudgetAutoAllocate();
              maybeOpenCategoryBudgetWarning('hotelBudget', value);
              update({ hotelBudget: value, budgetMode: 'per_category' });
            },
          },
          {
            key: 'transport',
            label: t4('transportFor'),
            detail: data.includeTransport ? (data.transportBudget > 0 ? `$${Math.round(data.transportBudget / safeNights).toLocaleString()} ${t4('perDay')} × ${safeNights} ${safeNights === 1 ? t2('day') : t2('days')}` : pendingAutoText) : t4('transportOff'),
            icon: Bus,
            value: data.transportBudget,
            max: 30000,
            step: 25,
            enabled: data.includeTransport,
            toggle: () => {
              const includeTransport = !data.includeTransport;
              unlockBudgetAutoAllocate();
              setBudgetEstimateNote('');
              update({ includeTransport });
            },
            onChange: (value: number) => {
              unlockBudgetAutoAllocate();
              maybeOpenCategoryBudgetWarning('transportBudget', value);
              update({ transportBudget: value, budgetMode: 'per_category' });
            },
          },
          {
            key: 'places',
            label: t4('placesFor'),
            detail: placesEnabled ? (data.dailyExpenseBudget > 0 ? `$${placeVisitDayBudget.toLocaleString()} ${t4('perTravelerDay')} × ${safeNights} ${safeNights === 1 ? t2('day') : t2('days')} × ${travelerText}` : pendingAutoText) : t4('placesOff'),
            icon: Compass,
            value: data.dailyExpenseBudget,
            max: 30000,
            step: 25,
            enabled: placesEnabled,
            toggle: () => {
              const includePlaces = !placesEnabled;
              unlockBudgetAutoAllocate();
              setBudgetEstimateNote('');
              setIncludePlaceVisits(includePlaces);
            },
            onChange: (value: number) => {
              unlockBudgetAutoAllocate();
              maybeOpenCategoryBudgetWarning('dailyExpenseBudget', value);
              update({ dailyExpenseBudget: value, budgetMode: 'per_category' });
            },
          },
        ];
        const consumedBudget = selectedCategoryBudgetTotal;
        const budgetDelta = selectedCategoryBudgetDelta;
        const budgetFits = selectedCategoriesFitBudget;
        const transportBudgetPreviewTypes: TransportType[] = ['public_bus', 'taxi', 'rideshare_uber', 'metro_subway', 'rental_car'];
        const selectedTransportDailyTotal = data.transportOptions?.length
          ? calculateTransportBudgetFromSelections(data.transportOptions, data.transportBudgetSelections, 1)
          : 0;
        const updateTransportSelections = (nextSelections: Partial<Record<TransportType, TransportBudgetSelection>>) => {
          const nextBudget = calculateTransportBudgetFromSelections(data.transportOptions, nextSelections, safeNights);
          maybeOpenCategoryBudgetWarning('transportBudget', nextBudget);
          update({
            transportBudgetSelections: nextSelections,
            transportBudget: nextBudget,
            budgetMode: 'per_category',
          });
        };
        const toggleTransportBudgetType = (type: TransportType) => {
          const current = data.transportBudgetSelections?.[type];
          const nextSelections = {
            ...(data.transportBudgetSelections || {}),
            [type]: {
              selected: current?.selected !== true,
              quantity: Math.max(1, Number(current?.quantity || getDefaultTransportQuantity(type, travelerCount))),
            },
          };
          updateTransportSelections(nextSelections);
        };
        const changeTransportQuantity = (type: TransportType, delta: number) => {
          const current = data.transportBudgetSelections?.[type];
          const nextQuantity = Math.max(1, Number(current?.quantity || getDefaultTransportQuantity(type, travelerCount)) + delta);
          const nextSelections = {
            ...(data.transportBudgetSelections || {}),
            [type]: {
              selected: true,
              quantity: nextQuantity,
            },
          };
          updateTransportSelections(nextSelections);
        };
        const dailyCategoryPreview = (data.dailyCategories || []).slice(0, 10);
        const selectedDailyCategorySum = dailyCategoryPreview
          .filter(category => category.selected !== false)
          .reduce((sum, category) => sum + Number(category.estimatedCost || 0), 0);
        const toggleDailyCategory = (categoryKey: string) => {
          const nextCategories = (data.dailyCategories || []).map(category =>
            category.key === categoryKey ? { ...category, selected: category.selected === false } : category
          );
          const nextDailyTotal = nextCategories
            .filter(category => category.selected !== false)
            .reduce((sum, category) => sum + Number(category.estimatedCost || 0), 0);
          const nextDailyBudget = nextDailyTotal * travelerCount * safeNights;
          maybeOpenCategoryBudgetWarning('dailyExpenseBudget', nextDailyBudget);
          update({
            dailyCategories: nextCategories,
            dailyExpenseBudget: nextDailyBudget,
            budgetMode: 'per_category',
          });
        };
        const switchBudgetMode = (budgetMode: BudgetMode) => {
          unlockBudgetAutoAllocate();
          if (budgetMode === 'total') {
            setBudgetEstimateNote('');
            setBudgetEstimateError('');
            setBudgetWarningsEnabled(false);
            setBudgetWarning(null);
            setBudgetFlightAverages(null);
            setSelectedBudgetFlightCabins([]);
            setBudgetHotelAveragesByStars(null);
            setSelectedBudgetHotelStars([]);
            update({ budgetMode });
            return;
          }
          update({ budgetMode });
        };

        return (
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { value: 'total' as BudgetMode, label: t4('fixedBudget'), sub: t4('fixedBudgetSub') },
                  { value: 'per_category' as BudgetMode, label: t4('detailed'), sub: t4('detailedSub') },
                ]).map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => switchBudgetMode(option.value)}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${data.budgetMode === option.value ? 'border-foreground bg-foreground text-background shadow-lg shadow-foreground/10' : 'border-border bg-background text-foreground hover:border-foreground/30'}`}
                  >
                    <div className="text-xs font-black uppercase tracking-[0.14em]">{option.label}</div>
                    <div className={`mt-1 text-[11px] ${data.budgetMode === option.value ? 'text-background/70' : 'text-muted-foreground'}`}>{option.sub}</div>
                  </button>
                ))}
              </div>
              {fixedBudgetMode ? (
                <div className="rounded-3xl border border-border bg-muted px-6 py-7">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-11 w-11 rounded-2xl border border-border bg-background flex items-center justify-center">
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t4('fixedBudget')}</div>
                      <div className="mt-1 text-xs text-muted-foreground/60">{t4('setMinMax')}</div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="rounded-2xl border border-border bg-background px-4 py-3">
                      <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50">{t4('minBudget')}</span>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-2xl title-text text-muted-foreground">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={data.budgetMin.toLocaleString()}
                          onChange={event => {
                            const nextMin = Math.max(0, Number(event.target.value.replace(/[^0-9]/g, '') || 0));
                            update({ budgetMin: Math.min(nextMin, data.budgetMax) });
                          }}
                          className="w-full bg-transparent text-3xl font-bold text-foreground outline-none title-text"
                        />
                      </div>
                    </label>
                    <label className="rounded-2xl border border-border bg-background px-4 py-3">
                      <span className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50">{t4('maxBudget')}</span>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-2xl title-text text-muted-foreground">$</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={data.budgetMax.toLocaleString()}
                          onChange={event => {
                            const nextMax = Math.max(0, Number(event.target.value.replace(/[^0-9]/g, '') || 0));
                            update({ budgetMax: Math.max(nextMax, data.budgetMin), totalBudget: Math.max(nextMax, data.budgetMin) });
                          }}
                          className="w-full bg-transparent text-3xl font-bold text-foreground outline-none title-text"
                        />
                      </div>
                    </label>
                  </div>
                  <div className="mt-4 text-xs text-muted-foreground/60">
                    {t4('defaultRange')}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="py-7 px-6 rounded-3xl bg-muted border border-border">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-11 w-11 rounded-2xl border border-border bg-background flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">{t4('aiBudgetGuide')}</div>
                    </div>
                    {budgetAutoAllocated ? (
                      <div className="text-5xl font-bold text-foreground title-text">
                        ${data.budgetMax.toLocaleString()}
                      </div>
                    ) : (
                      <label className="block">
                        <span className="sr-only">Main budget</span>
                        <div className="flex items-center gap-2">
                          <span className="text-5xl font-bold text-muted-foreground title-text">$</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={data.budgetMax.toLocaleString()}
                            onChange={event => {
                              const nextBudget = Math.max(0, Number(event.target.value.replace(/[^0-9]/g, '') || 0));
                              update({ budgetMax: nextBudget, totalBudget: nextBudget });
                              setAiBudgetGuide(prev => ({ ...prev, totalBudget: nextBudget }));
                            }}
                            className="min-w-0 flex-1 bg-transparent text-5xl font-bold text-foreground outline-none title-text"
                          />
                        </div>
                      </label>
                    )}
                    <div className="text-xs text-muted-foreground/60 mt-2">
                      ~${Math.round(data.budgetMax / (data.adults || 1)).toLocaleString()} {t4('perPerson')}
                    </div>
                    <div className="text-xs text-muted-foreground/60 mt-2">
                      {t4('aiEstimate')}
                    </div>
                  </div>
                  <div className={`py-7 px-6 rounded-3xl border ${budgetFits ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`h-11 w-11 rounded-2xl border flex items-center justify-center ${budgetFits ? 'border-emerald-500/25 bg-emerald-500/10' : 'border-red-500/25 bg-red-500/10'}`}>
                        <DollarSign className={`h-5 w-5 ${budgetFits ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`} />
                      </div>
                      <div className={`text-[10px] uppercase tracking-[0.2em] font-bold ${budgetFits ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>{t4('selectedCategories')}</div>
                    </div>
                    <div className={`text-5xl font-bold title-text ${budgetFits ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}`}>
                      {formatFromUSD(consumedBudget)}
                    </div>
                    <div className={`text-xs mt-2 ${budgetFits ? 'text-emerald-700/70 dark:text-emerald-300/70' : 'text-red-600/70 dark:text-red-300/70'}`}>
                      {t4('categorySum')}
                    </div>
                    <div className={`text-xs mt-1 ${budgetFits ? 'text-emerald-700/70 dark:text-emerald-300/70' : 'text-red-600/70 dark:text-red-300/70'}`}>
                      {budgetFits ? `${formatFromUSD(budgetDelta)} ${t4('belowCeiling')}` : `${formatFromUSD(Math.abs(budgetDelta))} ${t4('aboveCeiling')}`}
                    </div>
                  </div>
                </div>
              )}
              <div className="rounded-3xl border border-border bg-muted p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-bold text-foreground">
                      {data.tripType === 'round_trip' ? 'Stay length from return date' : 'Days staying in this country'}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{t4('people')}</span>
                        <span className="font-mono text-sm font-black text-foreground">{travelerCount}</span>
                      </div>
                      <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">{t4('days')}</span>
                        <span className="font-mono text-sm font-black text-foreground">{safeNights}</span>
                      </div>
                    </div>
                  </div>
                  {data.tripType === 'one_way' ? (
                    <div className="shrink-0">
                      <Counter
                        label={t4('days')}
                        sublabel="Stay length"
                        value={safeNights}
                        min={1}
                        onChange={value => {
                          const nextNights = Math.min(60, value);
                          const scaleByStayLength = (amount: number) => Math.round((amount / safeNights) * nextNights);
                          unlockBudgetAutoAllocate();
                          nightsAutoSet.current = true;
                          update({
                            nights: nextNights,
                            hotelBudget: data.includeHotel ? scaleByStayLength(data.hotelBudget) : data.hotelBudget,
                            transportBudget: data.includeTransport ? scaleByStayLength(data.transportBudget) : data.transportBudget,
                            dailyExpenseBudget: placesEnabled ? scaleByStayLength(data.dailyExpenseBudget) : data.dailyExpenseBudget,
                          });
                        }}
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-background px-5 py-3 text-right">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50">Trip Days</div>
                      
                    </div>
                  )}
                </div>
              </div>
              {!fixedBudgetMode && (
                <>
                  <button
                    type="button"
                    onClick={runBudgetEstimatesNow}
                    disabled={budgetAutoAllocated || budgetAutoDelayPending || !data.origin || !data.destination || !data.departureDate}
                    className="w-full rounded-2xl border border-border bg-background px-5 py-4 text-[11px] font-black uppercase tracking-[0.16em] text-foreground transition hover:border-foreground/30 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {budgetAutoAllocated
                      ? t4('autoAllocateApplied')
                      : budgetAutoDelayPending
                        ? t4('autoAllocateApplying')
                        : budgetEstimateLoading
                          ? 'Auto allocate when ready'
                          : t4('autoAllocateEnabled')}
                  </button>
                  {budgetEstimateError && (
                    <div className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-600 dark:text-red-300">
                      {budgetEstimateError}
                    </div>
                  )}
                </>
              )}
            </div>

            {!fixedBudgetMode && (
              <>
                <div className="space-y-4">
                  {budgetRows.map(item => (
                    <div key={item.key} className={`rounded-3xl border p-5 transition ${item.enabled ? 'bg-muted border-border' : 'bg-muted/40 border-border/70 opacity-75'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background border border-border">
                          <item.icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="text-base font-bold text-foreground">{item.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
                        </div>
                      </div>
                      {item.toggle && (
                        <button
                          type="button"
                          onClick={item.toggle}
                          className={`w-16 h-9 rounded-full transition-all duration-300 relative shadow-inner ${item.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/20'}`}
                          aria-label={`${item.enabled ? 'Disable' : 'Enable'} ${item.label}`}
                          title={`${item.enabled ? 'Disable' : 'Enable'} ${item.label}`}
                        >
                          <div className={`w-7 h-7 rounded-full shadow-lg absolute top-1 transition-all duration-300 flex items-center justify-center ${item.enabled ? 'left-8 bg-white' : 'left-1 bg-white'}`}>
                            {item.enabled && <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />}
                          </div>
                        </button>
                      )}
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground/50">
                          {item.key === 'places' ? t4('neededPerDay') : t4('selectedValue')}
                        </div>
                        <div className="mt-1 text-xl font-bold text-foreground font-mono">
                          {formatFromUSD(item.value)}
                        </div>
                        {!item.enabled && item.value > 0 && (
                          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                            {t4('savedWhileOff')}
                          </div>
                        )}
                      </div>
                    </div>
                    {item.key === 'transport' && item.enabled && (
                      <div className="mt-4 rounded-2xl border border-border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                            Transport options from auto allocate
                          </span>
                          {data.transportOptions?.length ? (
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                              {formatFromUSD(selectedTransportDailyTotal)} {t4('perDay')}
                            </span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {transportBudgetPreviewTypes.map(type => {
                            const optionMeta = TRANSPORT_OPTIONS.find(option => option.value === type);
                            const liveOption = getTransportOption(type);
                            const available = liveOption?.available !== false;
                            const Icon = optionMeta?.icon || Bus;
                            const transportPrice = formatTransportUsdPrice(liveOption);
                            const selection = data.transportBudgetSelections?.[type];
                            const selected = selection?.selected === true;
                            const quantity = Math.max(1, Number(selection?.quantity || getDefaultTransportQuantity(type, travelerCount)));
                            const unitLabel = isVehicleTransport(type) ? (quantity === 1 ? 'car' : 'cars') : (quantity === 1 ? 'ticket' : 'tickets');
                            return (
                              <div
                                key={`budget-${type}`}
                                className={`rounded-xl border px-3 py-3 text-left transition ${
                                  selected
                                    ? 'border-emerald-500 bg-background text-foreground shadow-sm'
                                    : available
                                      ? 'border-border bg-background text-foreground'
                                      : 'border-border/70 bg-muted/50 text-muted-foreground/60'
                                }`}
                              >
                                <button
                                  type="button"
                                  disabled={!available}
                                  onClick={() => toggleTransportBudgetType(type)}
                                  className="w-full text-left disabled:cursor-not-allowed"
                                  aria-pressed={selected}
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0 text-[11px] font-black uppercase leading-snug tracking-[0.14em] text-foreground">
                                      {type === 'rideshare_uber' ? t4('uber') : type === 'rental_car' ? t4('rentCar') : optionMeta?.label || liveOption?.displayName || type}
                                    </div>
                                    {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                                  </div>
                                  <div className="mt-3">
                                    <div className="font-mono text-sm font-black text-foreground">
                                      {available ? transportPrice.price : t4('unavailable')}
                                    </div>
                                    {available && transportPrice.detail && (
                                      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">
                                        {transportPrice.detail}
                                      </div>
                                    )}
                                  </div>
                                </button>
                                {selected && (
                                  <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-muted px-2 py-2">
                                    <span className="min-w-0 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                                      {quantity} {unitLabel}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => changeTransportQuantity(type, -1)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-foreground disabled:opacity-40"
                                        disabled={quantity <= 1}
                                        aria-label={`Decrease ${optionMeta?.label || type} quantity`}
                                      >
                                        <Minus className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => changeTransportQuantity(type, 1)}
                                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-background text-foreground"
                                        aria-label={`Increase ${optionMeta?.label || type} quantity`}
                                      >
                                        <Plus className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {selected && liveOption && (
                                  <div className="mt-2 rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700 dark:text-emerald-300">
                                    ${(getTransportDailyUnitPrice(liveOption) * quantity).toFixed(2)} {t4('perDay')} total
                                  </div>
                                )}
                                {liveOption?.notes && (
                                  <div className="mt-2 text-[10px] leading-relaxed text-muted-foreground break-words">
                                    {liveOption.notes}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {item.key === 'places' && item.enabled && (
                      <div className="mt-4 rounded-2xl border border-border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                            Daily places and activity estimate
                          </span>
                          {dailyCategoryPreview.length ? (
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                              {formatFromUSD(selectedDailyCategorySum)} {t4('perTravelerDay')}
                            </span>
                          ) : null}
                        </div>
                        {dailyCategoryPreview.length ? (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {dailyCategoryPreview.map(category => {
                              const CategoryIcon = getDailyCategoryIcon(category);
                              const selected = category.selected !== false;
                              return (
                                <button
                                  key={category.key}
                                  type="button"
                                  onClick={() => toggleDailyCategory(category.key)}
                                  className={`min-w-0 rounded-xl border px-3 py-3 text-left transition ${
                                    selected
                                      ? 'border-emerald-500 bg-background text-foreground shadow-sm'
                                      : 'border-border bg-muted/50 text-muted-foreground opacity-70'
                                  }`}
                                  aria-pressed={selected}
                                >
                                  <div className="flex min-w-0 items-start gap-2">
                                    <CategoryIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${selected ? 'text-muted-foreground' : 'text-muted-foreground/60'}`} />
                                    <div className="min-w-0 text-[11px] font-black uppercase leading-snug tracking-[0.1em] text-foreground break-normal">
                                      {formatDailyCategoryLabel(category.label)}
                                    </div>
                                    {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                                  </div>
                                  <div className="mt-2 font-mono text-sm font-black text-foreground">
                                    {formatFromUSD(Number(category.estimatedCost || 0))}
                                  </div>
                                  {category.detail && (
                                    <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground break-words">
                                      {category.detail}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-border bg-muted px-3 py-3 text-xs text-muted-foreground">
                            Auto allocation will show breakfast, lunch, dinner, coffee, shopping, and activity estimates.
                          </div>
                        )}
                      </div>
                    )}
                    {item.key === 'flight' && item.enabled && (
                      <div className="mt-4 rounded-2xl border border-border bg-background p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                            Flight average to apply
                          </span>
                          {budgetFlightAverages && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                              Per traveler
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {BUDGET_FLIGHT_CABIN_CLASSES.map(cabinClass => {
                            const selected = selectedBudgetFlightCabins.includes(cabinClass);
                            const averagePrice = budgetFlightAverages?.[cabinClass];
                            return (
                              <button
                                key={cabinClass}
                                type="button"
                                onClick={() => applyBudgetFlightCabinClass(cabinClass)}
                                className={`rounded-xl border px-3 py-3 text-left transition ${selected ? 'border-foreground bg-foreground text-background shadow-lg shadow-foreground/10' : 'border-border bg-muted text-foreground hover:border-foreground/30'}`}
                              >
                                <div className="text-[11px] font-black uppercase tracking-[0.14em]">
                                  {BUDGET_FLIGHT_CABIN_LABELS[cabinClass]}
                                </div>
                                <div className={`mt-1 font-mono text-sm font-black ${selected ? 'text-background' : 'text-foreground'}`}>
                                  {averagePrice ? formatFromUSD(averagePrice) : 'Manual'}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {item.key === 'hotel' && item.enabled && (
                      <div className="mt-4 rounded-2xl border border-border bg-background p-4">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                              {t4('hotelRoomSetup')}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {t4('hotelRoomSetupSub')}
                            </div>
                          </div>
                          <div className="text-right font-mono text-xs font-black text-foreground">
                            {hotelApartmentCount} room{hotelApartmentCount !== 1 ? 's' : ''} needed
                            <div className="text-[10px] text-muted-foreground/60">
                              {hotelApartmentCount * hotelRoomsPerApartment} total bed{hotelApartmentCount * hotelRoomsPerApartment !== 1 ? 's' : ''} requested
                            </div>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <HotelBudgetCounter
                            label="Rooms"
                            value={hotelApartmentCount}
                            onChange={value => updateHotelBudgetStructure({ hotelRooms: value })}
                            max={10}
                          />
                          <HotelBudgetCounter
                            label="Beds"
                            value={hotelRoomsPerApartment}
                            onChange={value => updateHotelBudgetStructure({ hotelRoomsPerApartment: value })}
                            max={6}
                          />
                        </div>
                        <div className="mt-4 rounded-2xl border border-border bg-muted p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                              Hotel star average to apply
                            </span>
                            {appliedBudgetHotelAveragesByStars && (
                              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/50">
                                {t4('perApartmentNight')}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                            {BUDGET_HOTEL_STAR_OPTIONS.map(star => {
                              const selected = selectedBudgetHotelStars.includes(star);
                              const averagePrice = appliedBudgetHotelAveragesByStars?.[String(star)];
                              return (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={() => applyBudgetHotelStar(star)}
                                  className={`rounded-xl border px-3 py-3 text-left transition ${selected ? 'border-foreground bg-foreground text-background shadow-lg shadow-foreground/10' : 'border-border bg-background text-foreground hover:border-foreground/30'}`}
                                >
                                  <div className="text-[11px] font-black uppercase tracking-[0.14em]">
                                    {star} Star
                                  </div>
                                  <div className={`mt-1 font-mono text-sm font-black ${selected ? 'text-background' : 'text-foreground'}`}>
                                    {averagePrice ? formatFromUSD(averagePrice) : 'Manual'}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                          {selectedBudgetHotelStars.length > 0 && (
                            <div className="mt-3 rounded-xl border border-border bg-background px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                              Applying {Math.max(...selectedBudgetHotelStars)}-star because it is the highest selected category.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <input
                      type="range"
                      min="0"
                      max={item.max}
                      step={item.step}
                      value={item.value}
                      disabled={!item.enabled}
                      onChange={event => item.onChange(Number(event.target.value))}
                      className="mt-3 w-full h-1.5 bg-background rounded-lg appearance-none cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    />
                    <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/40 font-bold uppercase tracking-wider">
                      <span>$0</span><span>${item.max.toLocaleString()}</span>
                    </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      }

      case 6:
        return (
          <div className="space-y-8">
            <div className="text-center py-6 px-6 rounded-3xl bg-muted border border-border">
              <div className="flex items-center justify-center gap-3 mb-3">
                <Compass className="w-6 h-6 text-foreground" />
                <span className="text-lg font-bold text-foreground">{t5('vibeTitle')}</span>
              </div>
              <p className="text-xs text-muted-foreground/60">{t5('vibeSub')}</p>
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
                    <span className="text-[11px] font-bold uppercase tracking-wider">{t5(VIBE_TRANSLATION_KEYS[v.id])}</span>
                    {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                  </button>
                );
              })}
            </div>
            {data.vibes.length === 0 && (
              <p className="text-center text-[10px] text-muted-foreground/40 uppercase tracking-wider">{t5('noVibe')}</p>
            )}
          </div>
        );

      // Step 9 - Review
      case 8:
        const reviewBudgetCeiling = Number(data.budgetMax || data.totalBudget || 0);
        const reviewBudgetRange = data.budgetMin > 0
          ? `${t4('selectedValue')} $${data.budgetMin.toLocaleString()} - $${reviewBudgetCeiling.toLocaleString()}`
          : t4('aiBudgetGuide');
        const reviewBudgetBreakdown = [
          data.includeFlight ? `Flight $${data.flightBudget.toLocaleString()}` : null,
          data.includeHotel ? `Hotel $${data.hotelBudget.toLocaleString()}` : null,
          data.includeTransport ? `Transport $${data.transportBudget.toLocaleString()}` : null,
          includePlaceVisits ? `Places $${data.dailyExpenseBudget.toLocaleString()}` : null,
        ].filter(Boolean).join(' - ');
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: t6('route'), value: `${data.origin} → ${data.destination}`, sub: data.tripType === 'one_way' ? t6('oneWay') : t1('roundTrip') },
                { label: t6('dates'), value: data.departureDate, sub: data.returnDate ? `${t6('return')}: ${data.returnDate}` : t6('oneWay') },
                { label: t6('travelers'), value: `${data.adults} ${data.adults === 1 ? t6('adult') : t6('adults')}`, sub: data.children > 0 ? `${data.children} ${data.children === 1 ? t6('child') : t6('children')}` : t6('noChildren') },
                {
                  label: t6('budget'),
                  value: `$${reviewBudgetCeiling.toLocaleString()}`,
                  sub: data.budgetMode === 'total'
                    ? `${reviewBudgetRange} - ${t6('aiLimit')}`
                    : `${reviewBudgetRange}${reviewBudgetBreakdown ? ` - ${t6('allocation')}: ${reviewBudgetBreakdown}` : ''}`,
                },
                { label: t6('vibe'), value: data.vibes.length > 0 ? data.vibes.map(v => VIBE_OPTIONS.find(vo => vo.id === v)?.emoji || '').join(' ') : t6('generalMix'), sub: data.vibes.length > 0 ? data.vibes.map(v => t5(VIBE_TRANSLATION_KEYS[v] || 'foodDrink')).join(', ') : t6('allAttractions') },
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
      <AnimatePresence>
        {budgetWarning && (
          <motion.div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/70 px-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="over-budget-title"
              className="w-full max-w-md rounded-3xl border border-red-500/25 bg-background p-6 shadow-[0_32px_90px_rgba(0,0,0,0.45)]"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/25 bg-red-500/10">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-300" />
                  </div>
                  <div>
                    <div id="over-budget-title" className="text-lg font-black text-foreground">
                      {budgetWarning.kind === 'category-under'
                        ? t4('underBudgetTitle')
                        : t4('overBudgetTitle')}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {budgetWarning.kind === 'category-under'
                        ? t4('underBudgetBody', {
                            label: budgetWarning.label,
                            selected: budgetWarning.selectedAmount.toLocaleString(),
                            guide: budgetWarning.guideAmount.toLocaleString(),
                          })
                        : budgetWarning.kind === 'category-over'
                          ? t4('categoryOverBody', {
                              label: budgetWarning.label,
                              selected: budgetWarning.selectedAmount.toLocaleString(),
                              guide: budgetWarning.guideAmount.toLocaleString(),
                            })
                          : t4('totalOverBody', {
                              selected: budgetWarning.selectedAmount.toLocaleString(),
                              guide: budgetWarning.guideAmount.toLocaleString(),
                            })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissBudgetWarning}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition hover:text-foreground"
                  aria-label={t4('close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={dismissBudgetWarning}
                  className="rounded-2xl border border-border bg-background px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                >
                  {t4('close')}
                </button>
                <button
                  type="button"
                  onClick={confirmBudgetWarning}
                  className="rounded-2xl bg-foreground px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-background transition hover:opacity-85"
                >
                  {budgetWarning.kind === 'category-under' ? t4('yesLower') : t4('yesIncrease')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Bar */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
            {t4('stepOf', { current: step + 1, total: STEPS.length })}
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
          <h2 className="text-5xl title-text text-foreground mb-2">{t(STEPS[step].titleKey)}</h2>
          <p className="text-muted-foreground text-sm font-light">
            {step === 0 ? t1('subtitle') : step === 1 ? t2('subtitle') : step === 2 ? t3('subtitle') : step === 3 ? t4('subtitle') : step === 4 ? t5('subtitle') : t6('subtitle')}
          </p>
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
          {t('back')}
        </button>

        {step === STEPS.length - 1 ? (
          <button type="button" onClick={() => onComplete({
            ...data,
            budgetFlightCabins: selectedBudgetFlightCabins.length ? selectedBudgetFlightCabins : data.budgetFlightCabins,
            budgetHotelStars: selectedBudgetHotelStars.length ? selectedBudgetHotelStars : data.budgetHotelStars,
            includePlaceVisits,
          })} disabled={isLoading}
            className="btn-primary flex items-center gap-3 px-10 py-4 group disabled:opacity-50">
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-background/20 border-t-background rounded-full animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span className="text-[11px] uppercase tracking-[0.2em] font-black">{t('generate')}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        ) : (
          <button type="button" onClick={next} disabled={!canProceed()}
            className="btn-primary flex items-center gap-2 px-8 py-3 disabled:opacity-30 group">
            <span className="text-[11px] uppercase tracking-[0.2em] font-black">{t('next')}</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        )}
      </div>
    </div>
  );
}

