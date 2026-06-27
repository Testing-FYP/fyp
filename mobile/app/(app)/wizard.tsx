import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Slider } from '@miblanchard/react-native-slider';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StepIndicator } from '@/components/ui/StepIndicator';
import { API } from '@/constants/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

const STEP_TITLES = ['Where To', 'When', 'Who', 'Flight Style', 'Stay', 'Transport', 'Vibe', 'Budget', 'Review'] as const;
const TRIP_TYPES = ['Round Trip', 'One Way', 'Multi-city'] as const;
const TRAVELER_TYPES = ['Adults', 'Family', 'Solo', 'Group'] as const;
const CABIN_CLASSES = ['Economy', 'Business', 'First'] as const;
const AMENITIES = ['Pool', 'Gym', 'Spa', 'Breakfast', 'Pet-friendly', 'Airport shuttle'] as const;
const TRANSPORT_TYPES = ['Rental Car', 'Public Transit', 'Taxi', 'None'] as const;
const PRIORITIES = ['Cost', 'Comfort', 'Speed'] as const;
const INTERESTS = ['Adventure', 'Culture', 'Food & Drink', 'Nature', 'Nightlife', 'Shopping', 'Relaxation', 'History', 'Art', 'Sports', 'Family-friendly', 'Photography'] as const;
const BUDGET_TYPES = ['Fixed', 'Detailed breakdown'] as const;
const LOADING_MESSAGES = [
  'Matching flights to your travel style…',
  'Finding stays that fit your wish list…',
  'Mapping memorable stops along the way…',
  'Balancing your plan with your budget…',
] as const;

type TripType = (typeof TRIP_TYPES)[number];
type TravelerType = (typeof TRAVELER_TYPES)[number];
type CabinClass = (typeof CABIN_CLASSES)[number];
type TransportType = (typeof TRANSPORT_TYPES)[number];
type Priority = (typeof PRIORITIES)[number];
type BudgetType = (typeof BUDGET_TYPES)[number];

interface WizardData {
  tripType: TripType;
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate: Date;
  passengers: number;
  travelerType: TravelerType;
  cabinClass: CabinClass;
  checkedBag: boolean;
  directOnly: boolean;
  hotelStars: number;
  rooms: number;
  amenities: string[];
  transportType: TransportType;
  priority: Priority;
  interests: string[];
  budget: number;
  budgetType: BudgetType;
}

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

interface ToggleRowProps {
  label: string;
  helper?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

function ToggleRow({ label, helper, value, onChange }: ToggleRowProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.toggleRow, { borderBottomColor: theme.border }]}>
      <View style={styles.toggleCopy}>
        <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
        {helper ? <Text style={[styles.toggleHelper, { color: theme.textSecondary }]}>{helper}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onChange}
        thumbColor={theme.surface}
        trackColor={{ false: theme.border, true: theme.primary }}
        value={value}
      />
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

function serializeWizard(data: WizardData) {
  return {
    trip_type: data.tripType,
    origin: data.origin.trim(),
    destination: data.destination.trim(),
    departure_date: data.departureDate.toISOString(),
    return_date: data.tripType === 'One Way' ? null : data.returnDate.toISOString(),
    passengers: data.passengers,
    traveler_type: data.travelerType,
    cabin_class: data.cabinClass,
    baggage: data.checkedBag ? 'Checked bag' : 'Carry-on only',
    direct_flights_only: data.directOnly,
    hotel_stars: data.hotelStars,
    rooms: data.rooms,
    amenities: data.amenities,
    transport_type: data.transportType,
    transport_priority: data.priority,
    interests: data.interests,
    budget: data.budget,
    budget_type: data.budgetType,
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
  const { theme } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [error, setError] = useState('');
  const [showDeparturePicker, setShowDeparturePicker] = useState(false);
  const [showReturnPicker, setShowReturnPicker] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [data, setData] = useState<WizardData>(() => {
    const tomorrow = addDays(new Date(), 1);
    return {
      tripType: 'Round Trip',
      origin: '',
      destination: '',
      departureDate: tomorrow,
      returnDate: addDays(tomorrow, 7),
      passengers: 1,
      travelerType: 'Adults',
      cabinClass: 'Economy',
      checkedBag: false,
      directOnly: false,
      hotelStars: 4,
      rooms: 1,
      amenities: [],
      transportType: 'Rental Car',
      priority: 'Cost',
      interests: [],
      budget: 5000,
      budgetType: 'Fixed',
    };
  });

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
    if (currentStep === 7 && data.interests.length === 0) {
      return 'Choose at least one interest so we can personalize your trip.';
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
    if (!token) {
      setError('Your session has expired. Sign in and try again.');
      return;
    }
    setGenerating(true);
    setError('');
    const requestData = serializeWizard(data);
    try {
      const response = await axios.post<unknown>(API.generate, requestData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      router.replace({
        pathname: '/(app)/results',
        params: {
          data: JSON.stringify(response.data),
          request: JSON.stringify(requestData),
        },
      });
    } catch (generateError) {
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
            <View style={styles.inputStack}>
              <Input autoCapitalize="words" label="Flying from" onChangeText={(value) => updateData('origin', value)} placeholder="City or airport" value={data.origin} />
              <View style={[styles.routeConnector, { backgroundColor: theme.border }]} />
              <Input autoCapitalize="words" label="Flying to" onChangeText={(value) => updateData('destination', value)} placeholder="City or airport" value={data.destination} />
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
            <Counter label="Passengers" max={9} min={1} onChange={(value) => updateData('passengers', value)} value={data.passengers} />
            <FieldHeading>Who are you traveling with?</FieldHeading>
            <PillSelector options={TRAVELER_TYPES} selected={data.travelerType} onSelect={(value) => updateData('travelerType', value)} />
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContent}>
            <FieldHeading>Cabin class</FieldHeading>
            <PillSelector options={CABIN_CLASSES} selected={data.cabinClass} onSelect={(value) => updateData('cabinClass', value)} />
            <View style={styles.toggleGroup}>
              <ToggleRow helper="Include one checked bag per traveler" label={data.checkedBag ? 'Checked bag' : 'Carry-on only'} onChange={(value) => updateData('checkedBag', value)} value={data.checkedBag} />
              <ToggleRow helper="Skip itineraries with connections" label="Direct flights only" onChange={(value) => updateData('directOnly', value)} value={data.directOnly} />
            </View>
          </View>
        );
      case 5:
        return (
          <View style={styles.stepContent}>
            <FieldHeading>Hotel rating</FieldHeading>
            <View style={styles.starRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Pressable key={star} accessibilityLabel={`${star} star hotel`} accessibilityRole="button" onPress={() => updateData('hotelStars', star)} style={[styles.starButton, { backgroundColor: star <= data.hotelStars ? theme.primary : theme.inputBg, borderColor: star <= data.hotelStars ? theme.primary : theme.border }]}>
                  <Ionicons color={star <= data.hotelStars ? theme.surface : theme.textSecondary} name="star" size={19} />
                  <Text style={[styles.starNumber, { color: star <= data.hotelStars ? theme.surface : theme.text }]}>{star}</Text>
                </Pressable>
              ))}
            </View>
            <Counter label="Rooms" max={9} min={1} onChange={(value) => updateData('rooms', value)} value={data.rooms} />
            <FieldHeading>Amenities</FieldHeading>
            <PillSelector multiselect onSelect={(value) => updateData('amenities', toggleValue(data.amenities, value))} options={AMENITIES} selected={data.amenities} />
          </View>
        );
      case 6:
        return (
          <View style={styles.stepContent}>
            <FieldHeading>Getting around</FieldHeading>
            <PillSelector options={TRANSPORT_TYPES} selected={data.transportType} onSelect={(value) => updateData('transportType', value)} />
            <FieldHeading>What matters most?</FieldHeading>
            <PillSelector options={PRIORITIES} selected={data.priority} onSelect={(value) => updateData('priority', value)} />
          </View>
        );
      case 7:
        return (
          <View style={styles.stepContent}>
            <Text style={[styles.stepPrompt, { color: theme.textSecondary }]}>Choose everything that sounds like your kind of trip.</Text>
            <PillSelector multiselect onSelect={(value) => updateData('interests', toggleValue(data.interests, value))} options={INTERESTS} selected={data.interests} />
          </View>
        );
      case 8:
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
            <FieldHeading>Budget style</FieldHeading>
            <PillSelector options={BUDGET_TYPES} selected={data.budgetType} onSelect={(value) => updateData('budgetType', value)} />
          </View>
        );
      case 9:
        return (
          <View style={styles.stepContent}>
            <Card style={styles.reviewCard}>
              <ReviewRow label="Route" value={`${data.origin.trim()} → ${data.destination.trim()}`} />
              <ReviewRow label="Trip" value={`${data.tripType} · ${data.passengers} traveler${data.passengers === 1 ? '' : 's'}`} />
              <ReviewRow label="Dates" value={data.tripType === 'One Way' ? formatDate(data.departureDate) : `${formatDate(data.departureDate)} – ${formatDate(data.returnDate)}`} />
              <ReviewRow label="Flight" value={`${data.cabinClass} · ${data.checkedBag ? 'Checked bag' : 'Carry-on'}${data.directOnly ? ' · Direct only' : ''}`} />
              <ReviewRow label="Stay" value={`${data.hotelStars}-star · ${data.rooms} room${data.rooms === 1 ? '' : 's'}${data.amenities.length ? ` · ${data.amenities.join(', ')}` : ''}`} />
              <ReviewRow label="Transport" value={`${data.transportType} · ${data.priority} first`} />
              <ReviewRow label="Vibe" value={data.interests.join(', ')} />
              <ReviewRow label="Budget" value={`$${data.budget.toLocaleString()} · ${data.budgetType}`} />
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
        <Animated.View key={currentStep} entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(160)}>
          {renderStep()}
        </Animated.View>

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
  scrollContent: { paddingBottom: 36, paddingHorizontal: 20, paddingTop: 26 },
  stepContent: { gap: 18 },
  fieldHeading: { fontSize: 15, fontWeight: '800', marginBottom: -7, marginTop: 4 },
  fieldLabel: { fontSize: 16, fontWeight: '800' },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  pill: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 43, paddingHorizontal: 15, paddingVertical: 9 },
  pillText: { fontSize: 14, fontWeight: '700' },
  inputStack: { gap: 16, marginTop: 4, position: 'relative' },
  routeConnector: { height: 16, left: 21, position: 'absolute', top: 80, width: 2 },
  dateButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', minHeight: 54, paddingHorizontal: 16 },
  dateText: { flex: 1, fontSize: 16, fontWeight: '700', marginLeft: 12 },
  infoRow: { alignItems: 'center', borderRadius: 13, flexDirection: 'row', gap: 10, padding: 14 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  counterRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  counter: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row' },
  counterButton: { alignItems: 'center', height: 46, justifyContent: 'center', width: 46 },
  counterValue: { fontSize: 17, fontWeight: '800', minWidth: 32, textAlign: 'center' },
  toggleGroup: { marginTop: 4 },
  toggleRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16 },
  toggleCopy: { flex: 1, paddingRight: 20 },
  toggleLabel: { fontSize: 15, fontWeight: '800' },
  toggleHelper: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  starRow: { flexDirection: 'row', gap: 7 },
  starButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flex: 1, gap: 3, justifyContent: 'center', minHeight: 58 },
  starNumber: { fontSize: 12, fontWeight: '800' },
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
