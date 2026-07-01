import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Slider } from '@miblanchard/react-native-slider';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { API } from '@/constants/api';
import { useDataSource, type DataSource } from '@/context/DataSourceContext';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

const STEP_TITLES = ['Where To', 'When', 'Who', 'Your Vibe', 'Budget', 'Review'] as const;
const TRIP_TYPES = ['Round Trip', 'One Way'] as const;
const INTERESTS = ['Adventure', 'Culture', 'Food & Drink', 'Nature', 'Nightlife', 'Shopping', 'Relaxation', 'History', 'Art', 'Sports', 'Family-friendly', 'Photography'] as const;
const LOADING_MESSAGES = [
  'Matching flights to your travel style…',
  'Finding stays that fit your wish list…',
  'Mapping memorable stops along the way…',
  'Balancing your plan with your budget…',
] as const;

type TripType = (typeof TRIP_TYPES)[number];

interface WizardData {
  tripType: TripType;
  origin: string;
  destination: string;
  destinationCity?: string;
  destinationCountry?: string;
  destinationCountryCode?: string;
  departureDate: Date;
  returnDate: Date;
  passengers: number;
  adults: number;
  children: number;
  interests: string[];
  budget: number;
}

interface AirportSuggestion {
  id: string;
  name: string;
  iata_code: string;
  city_name: string;
  country_name: string;
  country_code?: string;
  countryCode?: string;
}

type AirportSuggestionResponse =
  | AirportSuggestion[]
  | { airports?: AirportSuggestion[] }
  | null;

interface PillSelectorProps<T extends string> {
  options: readonly T[];
  selected: T | readonly T[];
  onSelect: (value: T) => void;
  multiselect?: boolean;
}

function PillSelector<T extends string>({ options, selected, onSelect, multiselect = false }: PillSelectorProps<T>) {
  const { theme } = useTheme();
  const selectedValues: readonly T[] = Array.isArray(selected) ? selected : [selected as T];

  return (
    <View style={styles.pillGrid}>
      {options.map((option) => {
        const isSelected = selectedValues.includes(option);
        return (
          <Pressable
            key={option}
            accessibilityRole={multiselect ? 'checkbox' : 'radio'}
            accessibilityState={multiselect ? { checked: isSelected } : { selected: isSelected }}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.pill,
              {
                backgroundColor: isSelected ? theme.primary : theme.inputBg,
                borderColor: isSelected ? theme.primary : theme.border,
                opacity: pressed ? 0.78 : 1,
              },
            ]}
          >
            {multiselect && isSelected ? <Ionicons color={theme.surface} name="checkmark" size={15} /> : null}
            <Text style={[styles.pillText, { color: isSelected ? theme.surface : theme.text }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

interface CounterProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function Counter({ label, value, min, max, onChange }: CounterProps) {
  const { theme } = useTheme();
  return (
    <View style={styles.counterRow}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <View style={[styles.counter, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
        <Pressable
          accessibilityLabel={`Decrease ${label}`}
          accessibilityRole="button"
          disabled={value <= min}
          onPress={() => onChange(Math.max(min, value - 1))}
          style={styles.counterButton}
        >
          <Ionicons color={value <= min ? theme.textSecondary : theme.primary} name="remove" size={20} />
        </Pressable>
        <Text style={[styles.counterValue, { color: theme.text }]}>{value}</Text>
        <Pressable
          accessibilityLabel={`Increase ${label}`}
          accessibilityRole="button"
          disabled={value >= max}
          onPress={() => onChange(Math.min(max, value + 1))}
          style={styles.counterButton}
        >
          <Ionicons color={value >= max ? theme.textSecondary : theme.primary} name="add" size={20} />
        </Pressable>
      </View>
    </View>
  );
}

function FieldHeading({ children }: { children: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.fieldHeading, { color: theme.text }]}>{children}</Text>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.reviewRow, { borderBottomColor: theme.border }]}>
      <Text style={[styles.reviewLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function serializeWizard(data: WizardData, dataSource: DataSource) {
  const nights = data.tripType === 'One Way'
    ? 1
    : Math.max(
        1,
        Math.round(
          (data.returnDate.getTime() - data.departureDate.getTime()) /
            (1000 * 60 * 60 * 24),
        ),
      );

  return {
    tripType: data.tripType === 'Round Trip' ? 'round_trip' : 'one_way',
    origin: data.origin.trim(),
    destination: data.destination.trim(),
    destinationCity: data.destinationCity,
    destinationCountry: data.destinationCountry,
    destinationCountryCode: data.destinationCountryCode ?? '',
    departureDate: data.departureDate.toISOString().slice(0, 10),
    returnDate:
      data.tripType === 'One Way'
        ? null
        : data.returnDate.toISOString().slice(0, 10),
    adults: data.adults,
    children: data.children,
    vibes: data.interests,
    includeFlight: true,
    includeHotel: true,
    includeTransport: true,
    includePlaceVisits: true,
    budgetMode: 'total',
    totalBudget: data.budget,
    budgetMin: 0,
    budgetMax: data.budget,
    flightBudget: 0,
    hotelBudget: 0,
    transportBudget: 0,
    dailyExpenseBudget: 0,
    budgetFlightCabins: [],
    budgetHotelStars: [],
    dailyCategories: [],
    transportBudgetSelections: {},
    hotelStars: 4,
    hotelRooms: 1,
    hotelRoomsPerApartment: 1,
    transportTypes: [
      'metro_subway',
      'train',
      'public_bus',
      'taxi',
      'rideshare_uber',
      'rental_car',
    ],
    nights,
    mockSource: dataSource,
  };
}

function apiErrorMessage(error: unknown) {
  if (axios.isAxiosError<{ message?: string; error?: string }>(error)) {
    return error.response?.data?.message ?? error.response?.data?.error ?? 'We could not generate your trip.';
  }
  return error instanceof Error ? error.message : 'We could not generate your trip.';
}

export default function WizardScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const {
    autocompleteProvider,
    setAutocompleteProvider,
    dataSource,
  } = useDataSource();
  const { theme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const originDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destinationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepTransition = useRef(new Animated.Value(0)).current;
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [originSuggestions, setOriginSuggestions] = useState<AirportSuggestion[]>([]);
  const [destinationSuggestions, setDestinationSuggestions] =
    useState<AirportSuggestion[]>([]);
  const [originDisplay, setOriginDisplay] = useState('');
  const [destinationDisplay, setDestinationDisplay] = useState('');
  const [data, setData] = useState<WizardData>(() => {
    const tomorrow = addDays(new Date(), 1);
    return {
      tripType: 'Round Trip',
      origin: '',
      destination: '',
      destinationCity: undefined,
      destinationCountry: undefined,
      destinationCountryCode: undefined,
      departureDate: tomorrow,
      returnDate: addDays(tomorrow, 7),
      passengers: 1,
      adults: 1,
      children: 0,
      interests: [],
      budget: 5000,
    };
  });

  useEffect(() => {
    stepTransition.setValue(0);
    const animation = Animated.timing(stepTransition, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [currentStep, stepTransition]);

  useEffect(() => {
    if (!generating) {
      setLoadingMessageIndex(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    return () => {
      if (originDebounceRef.current) {
        clearTimeout(originDebounceRef.current);
      }
      if (destinationDebounceRef.current) {
        clearTimeout(destinationDebounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (originDebounceRef.current) {
      clearTimeout(originDebounceRef.current);
    }
    if (destinationDebounceRef.current) {
      clearTimeout(destinationDebounceRef.current);
    }
    setOriginSuggestions([]);
    setDestinationSuggestions([]);
  }, [autocompleteProvider]);

  async function fetchCitySuggestions(
    query: string,
    setSuggestions: (suggestions: AirportSuggestion[]) => void,
  ) {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }

    try {
      const autocompleteUrl =
        autocompleteProvider === 'duffel'
          ? API.autocompleteDuffel
          : API.autocompleteSerpApi;
      const response = await fetch(
        `${autocompleteUrl}?query=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'TravelEliteApp/1.0' } },
      );
      const data = (await response.json()) as AirportSuggestionResponse;
      const airports = Array.isArray(data) ? data : data?.airports ?? [];
      setSuggestions(
        airports.filter((airport) => {
          const name = airport.name?.trim();
          const cityName = airport.city_name?.trim();
          if (!name || !cityName) {
            return false;
          }
          return (
            /^[A-Z]{3}$/.test(airport.iata_code) &&
            name.toLowerCase() !== 'none' &&
            cityName.toLowerCase() !== 'none'
          );
        }),
      );
    } catch {
      setSuggestions([]);
    }
  }

  function handleOriginChange(value: string) {
    setOriginDisplay(value);
    updateData('origin', '');
    setOriginSuggestions([]);
    if (originDebounceRef.current) {
      clearTimeout(originDebounceRef.current);
    }
    originDebounceRef.current = setTimeout(() => {
      void fetchCitySuggestions(value, setOriginSuggestions);
    }, 400);
  }

  function handleDestinationChange(value: string) {
    setDestinationDisplay(value);
    updateData('destination', '');
    updateData('destinationCity', undefined);
    updateData('destinationCountry', undefined);
    updateData('destinationCountryCode', undefined);
    setDestinationSuggestions([]);
    if (destinationDebounceRef.current) {
      clearTimeout(destinationDebounceRef.current);
    }
    destinationDebounceRef.current = setTimeout(() => {
      void fetchCitySuggestions(value, setDestinationSuggestions);
    }, 400);
  }

  function updateData<K extends keyof WizardData>(key: K, value: WizardData[K]) {
    setData((current) => ({ ...current, [key]: value }));
    setError('');
  }

  function validateStep() {
    if (currentStep === 1) {
      if (!data.origin.trim() || !data.destination.trim()) {
        return 'Add both your departure city and destination.';
      }
      if (data.origin.trim().toLowerCase() === data.destination.trim().toLowerCase()) {
        return 'Your departure city and destination need to be different.';
      }
    }
    if (currentStep === 2 && data.tripType !== 'One Way' && data.returnDate <= data.departureDate) {
      return 'Choose a return date after your departure date.';
    }
    return '';
  }

  function goToStep(step: number) {
    setCurrentStep(step);
    setError('');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function handleNext() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    goToStep(Math.min(STEP_TITLES.length, currentStep + 1));
  }

  function handleDepartureChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS !== 'ios') {
      setShowDeparturePicker(false);
    }
    if (event.type === 'dismissed' || !selectedDate) {
      return;
    }
    updateData('departureDate', selectedDate);
    if (data.returnDate <= selectedDate) {
      updateData('returnDate', addDays(selectedDate, 1));
    }
  }

  function handleReturnChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS !== 'ios') {
      setShowReturnPicker(false);
    }
    if (event.type !== 'dismissed' && selectedDate) {
      updateData('returnDate', selectedDate);
    }
  }

async function handleGenerate() {
  setGenerating(true);
  setError('');

  const requestData = serializeWizard(data, dataSource);

  try {
    console.log('[Generate] requestData:', JSON.stringify(requestData, null, 2));

    const response = await axios.post<unknown>(
      API.generate,
      requestData,
      token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );

    console.log('[Generate] raw response.data:', JSON.stringify(response.data, null, 2));

    const responseData =
      response.data && typeof response.data === 'object' && !Array.isArray(response.data)
        ? (response.data as Record<string, unknown>)
        : null;

    console.log(
      '[Generate] quick check:',
      JSON.stringify(
        {
          sentDataSource: requestData.mockSource,
          sentTotalBudget: requestData.totalBudget,
          returnedTotalBudget:
            responseData?.budgetBreakdown &&
            typeof responseData.budgetBreakdown === 'object' &&
            !Array.isArray(responseData.budgetBreakdown)
              ? (responseData.budgetBreakdown as Record<string, unknown>).totalBudget
              : undefined,
          flightsCount: Array.isArray(responseData?.flights) ? responseData.flights.length : 0,
          hotelsCount: Array.isArray(responseData?.hotels) ? responseData.hotels.length : 0,
          transportCount: Array.isArray(responseData?.transport) ? responseData.transport.length : 0,
          rootPlacesCount: Array.isArray(responseData?.placesToVisit)
            ? responseData.placesToVisit.length
            : 0,
          budgetSourcePlacesCount:
            responseData?.budgetSourceOptions &&
            typeof responseData.budgetSourceOptions === 'object' &&
            !Array.isArray(responseData.budgetSourceOptions) &&
            Array.isArray(
              (responseData.budgetSourceOptions as Record<string, unknown>).placesToVisit,
            )
              ? ((responseData.budgetSourceOptions as Record<string, unknown>)
                  .placesToVisit as unknown[]).length
              : 0,
          debug: responseData?._debug,
        },
        null,
        2,
      ),
    );

    router.replace({
      pathname: '/(app)/results',
      params: {
        data: JSON.stringify(response.data),
        request: JSON.stringify(requestData),
      },
    });
  } catch (generateError) {
    console.error('[Generate] error:', generateError);
    setError(apiErrorMessage(generateError));
  } finally {
    setGenerating(false);
  }
}

  function renderStep() {
    switch (currentStep) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <FieldHeading>Trip type</FieldHeading>
            <PillSelector options={TRIP_TYPES} selected={data.tripType} onSelect={(value) => updateData('tripType', value)} />
            <View style={styles.autocompleteProviderRow}>
              {([
                { id: 'serpapi', label: '📡 SerpAPI' },
                { id: 'duffel', label: '✈️ Duffel' },
              ] as const).map((option) => {
                const isSelected = autocompleteProvider === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setAutocompleteProvider(option.id)}
                    style={({ pressed }) => [
                      styles.autocompleteProviderButton,
                      {
                        backgroundColor: isSelected ? theme.primary : theme.inputBg,
                        borderColor: isSelected ? theme.primary : theme.border,
                        opacity: pressed ? 0.78 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.autocompleteProviderText,
                        { color: isSelected ? theme.surface : theme.text },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.inputStack}>
              <View>
                <Input autoCapitalize="words" label="Flying from" onChangeText={handleOriginChange} placeholder="City or airport" value={originDisplay} />
                {originSuggestions.length > 0 ? (
                  <View style={[styles.suggestionList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {originSuggestions.map((suggestion, index) => (
                      <Pressable
                        key={`${suggestion.id}-${suggestion.iata_code}`}
                        accessibilityRole="button"
                        onPress={() => {
                          updateData('origin', suggestion.iata_code);
                          setOriginDisplay(`${suggestion.city_name}, ${suggestion.country_name} (${suggestion.iata_code})`);
                          setOriginSuggestions([]);
                        }}
                        style={[styles.suggestionItem, index < originSuggestions.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                      >
                        <View style={styles.suggestionCopy}>
                          <Text numberOfLines={1} style={[styles.suggestionCity, { color: theme.text }]}>{suggestion.city_name}</Text>
                          <Text numberOfLines={1} style={[styles.suggestionCountry, { color: theme.textSecondary }]}>{suggestion.country_name}</Text>
                        </View>
                        <View style={[styles.iataBadge, { backgroundColor: theme.inputBg }]}>
                          <Text style={[styles.iataText, { color: theme.primary }]}>{suggestion.iata_code}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
              <View>
                <Input autoCapitalize="words" label="Flying to" onChangeText={handleDestinationChange} placeholder="City or airport" value={destinationDisplay} />
                {destinationSuggestions.length > 0 ? (
                  <View style={[styles.suggestionList, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {destinationSuggestions.map((suggestion, index) => (
                      <Pressable
                        key={`${suggestion.id}-${suggestion.iata_code}`}
                        accessibilityRole="button"
                        onPress={() => {
                          updateData('destination', suggestion.iata_code);
                          updateData('destinationCity', suggestion.city_name);
                          updateData('destinationCountry', suggestion.country_name);
                          updateData(
                            'destinationCountryCode',
                            suggestion.country_code ?? suggestion.countryCode,
                          );
                          setDestinationDisplay(`${suggestion.city_name}, ${suggestion.country_name} (${suggestion.iata_code})`);
                          setDestinationSuggestions([]);
                        }}
                        style={[styles.suggestionItem, index < destinationSuggestions.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: 1 }]}
                      >
                        <View style={styles.suggestionCopy}>
                          <Text numberOfLines={1} style={[styles.suggestionCity, { color: theme.text }]}>{suggestion.city_name}</Text>
                          <Text numberOfLines={1} style={[styles.suggestionCountry, { color: theme.textSecondary }]}>{suggestion.country_name}</Text>
                        </View>
                        <View style={[styles.iataBadge, { backgroundColor: theme.inputBg }]}>
                          <Text style={[styles.iataText, { color: theme.primary }]}>{suggestion.iata_code}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <FieldHeading>Departure</FieldHeading>
            <Pressable onPress={() => setShowDeparturePicker((current) => !current)} style={[styles.dateButton, { backgroundColor: theme.inputBg, borderColor: showDeparturePicker ? theme.primary : theme.border }]}>
              <Ionicons color={theme.primary} name="calendar-outline" size={21} />
              <Text style={[styles.dateText, { color: theme.text }]}>{formatDate(data.departureDate)}</Text>
              <Ionicons color={theme.textSecondary} name="chevron-down" size={18} />
            </Pressable>
            {showDeparturePicker ? (
              <DateTimePicker display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={new Date()} mode="date" onChange={handleDepartureChange} value={data.departureDate} />
            ) : null}

            {data.tripType !== 'One Way' ? (
              <>
                <FieldHeading>Return</FieldHeading>
                <Pressable onPress={() => setShowReturnPicker((current) => !current)} style={[styles.dateButton, { backgroundColor: theme.inputBg, borderColor: showReturnPicker ? theme.primary : theme.border }]}>
                  <Ionicons color={theme.primary} name="calendar-outline" size={21} />
                  <Text style={[styles.dateText, { color: theme.text }]}>{formatDate(data.returnDate)}</Text>
                  <Ionicons color={theme.textSecondary} name="chevron-down" size={18} />
                </Pressable>
                {showReturnPicker ? (
                  <DateTimePicker display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={data.departureDate} mode="date" onChange={handleReturnChange} value={data.returnDate} />
                ) : null}
              </>
            ) : (
              <View style={[styles.infoRow, { backgroundColor: theme.inputBg }]}>
                <Ionicons color={theme.primary} name="information-circle-outline" size={20} />
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>One-way trip selected. No return date needed.</Text>
              </View>
            )}
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Counter label="Adults" max={9} min={1} onChange={(value) => updateData('adults', value)} value={data.adults} />
            <Counter label="Children" max={9} min={0} onChange={(value) => updateData('children', value)} value={data.children} />
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepPrompt, { color: theme.textSecondary }]}>Choose everything that sounds like your kind of trip.</Text>
            <PillSelector multiselect onSelect={(value) => updateData('interests', toggleValue(data.interests, value))} options={INTERESTS} selected={data.interests} />
            {data.interests.length === 0 ? (
              <View style={[styles.infoRow, { backgroundColor: theme.inputBg }]}>
                <Ionicons color={theme.primary} name="information-circle-outline" size={20} />
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>No vibe selected — we'll show a general mix of top attractions.</Text>
              </View>
            ) : null}
          </View>
        );
      case 5:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.budgetAmount, { color: theme.text }]}>${data.budget.toLocaleString()}</Text>
            <Text style={[styles.budgetCaption, { color: theme.textSecondary }]}>Estimated total trip budget</Text>
            <Slider
              animateTransitions
              maximumTrackTintColor={theme.border}
              maximumValue={50000}
              minimumTrackTintColor={theme.primary}
              minimumValue={500}
              onValueChange={(values) => updateData('budget', Math.round((values[0] ?? 500) / 100) * 100)}
              step={100}
              thumbTintColor={theme.primary}
              value={[data.budget]}
            />
            <View style={styles.budgetRange}>
              <Text style={[styles.rangeText, { color: theme.textSecondary }]}>$500</Text>
              <Text style={[styles.rangeText, { color: theme.textSecondary }]}>$50,000</Text>
            </View>
          </View>
        );
      case 6:
        return (
          <View style={styles.stepContent}>
            <Card style={styles.reviewCard}>
              <ReviewRow label="Route" value={`${data.origin} → ${data.destination}`} />
              <ReviewRow label="Trip" value={`${data.tripType} · ${data.adults + data.children} traveler(s)`} />
              <ReviewRow label="Dates" value={data.tripType === 'One Way' ? formatDate(data.departureDate) : `${formatDate(data.departureDate)} – ${formatDate(data.returnDate)}`} />
              <ReviewRow label="Who" value={`${data.adults} adult${data.adults !== 1 ? 's' : ''}${data.children > 0 ? `, ${data.children} child${data.children !== 1 ? 'ren' : ''}` : ''}`} />
              <ReviewRow label="Vibe" value={data.interests.join(', ') || 'General mix'} />
              <ReviewRow label="Budget" value={`$${data.budget.toLocaleString()}`} />
            </Card>
            {generating ? <LoadingSpinner message={LOADING_MESSAGES[loadingMessageIndex]} /> : null}
            <Button loading={generating} onPress={() => { void handleGenerate(); }} title="Generate My Trip" />
          </View>
        );
      default:
        return null;
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <LinearGradient colors={[theme.gradientStart, theme.gradientEnd]} end={{ x: 1, y: 0.8 }} style={styles.wizardHeader}>
        <View style={styles.wizardHeaderRow}>
          <Pressable accessibilityLabel="Close trip planner" accessibilityRole="button" onPress={() => router.back()} style={[styles.closeButton, { backgroundColor: theme.surface }]}>
            <Ionicons color={theme.text} name="close" size={22} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={[styles.headerEyebrow, { color: theme.text }]}>TRAVELELITE PLANNER</Text>
            <Text style={[styles.headerTitle, { color: theme.text }]}>Shape your trip</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={[styles.progressCard, { backgroundColor: theme.card, borderColor: theme.border, shadowColor: theme.text }]}>
        <StepIndicator currentStep={currentStep} title={STEP_TITLES[currentStep - 1] ?? ''} totalSteps={STEP_TITLES.length} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.stepLayout}>
          <Animated.View
            key={currentStep}
            style={{
              opacity: stepTransition,
              transform: [
                {
                  translateX: stepTransition.interpolate({
                    inputRange: [0, 1],
                    outputRange: [18, 0],
                  }),
                },
              ],
            }}
          >
            {renderStep()}
          </Animated.View>

          <View>
            {error ? (
              <View style={[styles.errorBanner, { backgroundColor: theme.inputBg, borderColor: theme.error }]}>
                <Ionicons color={theme.error} name="alert-circle-outline" size={20} />
                <Text accessibilityRole="alert" style={[styles.errorText, { color: theme.error }]}>{error}</Text>
              </View>
            ) : null}

            {currentStep < STEP_TITLES.length ? (
              <View style={styles.navigationRow}>
                {currentStep > 1 ? <Button onPress={() => goToStep(currentStep - 1)} style={styles.navigationButton} title="Back" variant="outline" /> : null}
                <Button onPress={handleNext} style={styles.navigationButton} title="Continue" />
              </View>
            ) : currentStep > 1 && !generating ? (
              <Button onPress={() => goToStep(currentStep - 1)} title="Edit previous step" variant="outline" />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  wizardHeader: { paddingBottom: 42, paddingHorizontal: 20, paddingTop: 10 },
  wizardHeaderRow: { alignItems: 'center', flexDirection: 'row' },
  closeButton: { alignItems: 'center', borderRadius: 12, height: 42, justifyContent: 'center', marginRight: 13, opacity: 0.94, width: 42 },
  headerTitleWrap: { flex: 1 },
  headerEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.25, marginBottom: 2 },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  progressCard: { borderRadius: 18, borderWidth: 1, elevation: 4, marginHorizontal: 16, marginTop: -28, padding: 17, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20 },
  scrollContent: { flexGrow: 1, paddingBottom: 36, paddingHorizontal: 20, paddingTop: 26 },
  stepLayout: { flex: 1, justifyContent: 'space-between' },
  stepContent: { flex: 1, gap: 18 },
  fieldHeading: { fontSize: 15, fontWeight: '800', marginBottom: -7, marginTop: 4 },
  fieldLabel: { fontSize: 16, fontWeight: '800' },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  pill: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 43, paddingHorizontal: 15, paddingVertical: 9 },
  pillText: { fontSize: 14, fontWeight: '700' },
  autocompleteProviderRow: { flexDirection: 'row', gap: 8 },
  autocompleteProviderButton: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  autocompleteProviderText: { fontSize: 12, fontWeight: '700' },
  inputStack: { gap: 16, marginTop: 4, position: 'relative' },
  routeConnector: { height: 16, left: 21, position: 'absolute', top: 80, width: 2 },
  suggestionList: { borderRadius: 10, borderWidth: 1, elevation: 4, marginTop: 6, overflow: 'hidden' },
  suggestionItem: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 11 },
  suggestionCopy: { flex: 1, paddingRight: 12 },
  suggestionCity: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  suggestionCountry: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  iataBadge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  iataText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  dateButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', minHeight: 54, paddingHorizontal: 16 },
  dateText: { flex: 1, fontSize: 16, fontWeight: '700', marginLeft: 12 },
  infoRow: { alignItems: 'center', borderRadius: 13, flexDirection: 'row', gap: 10, padding: 14 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  counterRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  counter: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row' },
  counterButton: { alignItems: 'center', height: 46, justifyContent: 'center', width: 46 },
  counterValue: { fontSize: 17, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  stepPrompt: { fontSize: 15, lineHeight: 22 },
  budgetAmount: { fontSize: 42, fontWeight: '900', letterSpacing: -1.2, marginTop: 12, textAlign: 'center' },
  budgetCaption: { fontSize: 14, marginBottom: 8, textAlign: 'center' },
  budgetRange: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -13 },
  rangeText: { fontSize: 12, fontWeight: '700' },
  reviewCard: { paddingBottom: 6, paddingTop: 6 },
  reviewRow: { borderBottomWidth: 1, paddingVertical: 13 },
  reviewLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' },
  reviewValue: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  errorBanner: { alignItems: 'flex-start', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 9, marginTop: 22, padding: 13 },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20 },
  navigationRow: { flexDirection: 'row', gap: 11, marginTop: 26 },
  navigationButton: { flex: 1, width: undefined },
});
