import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { API } from '@/constants/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

interface FlightResult {
  origin: string;
  destination: string;
  departure: string;
  price: string;
  airline: string;
}

interface HotelResult {
  name: string;
  stars: string;
  pricePerNight: string;
  amenities: string[];
}

interface TransportResult {
  type: string;
  estimatedCost: string;
}

interface PlaceResult {
  name: string;
  description: string;
}

interface ParsedTripResult {
  flights: FlightResult[];
  hotels: HotelResult[];
  transport: TransportResult[];
  places: PlaceResult[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readValue(record: UnknownRecord, keys: readonly string[], fallback: string) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
    if (typeof value === 'number') {
      return String(value);
    }
  }
  return fallback;
}

function readArray(record: UnknownRecord, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (asRecord(value)) {
      return [value];
    }
  }
  return [];
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function unwrapResult(raw: unknown) {
  let current = asRecord(raw);
  for (const key of ['data', 'result', 'trip', 'itinerary']) {
    const nested = current ? asRecord(current[key]) : null;
    if (nested) {
      current = nested;
    }
  }
  return current ?? {};
}

function parseTripResult(raw: unknown): ParsedTripResult {
  const result = unwrapResult(raw);
  const flights = readArray(result, ['flights', 'flight_options', 'flight']).map((item) => {
    const flight = asRecord(item) ?? {};
    return {
      origin: readValue(flight, ['origin', 'from', 'departure_airport'], 'Origin not provided'),
      destination: readValue(flight, ['destination', 'to', 'arrival_airport'], 'Destination not provided'),
      departure: readValue(flight, ['departure', 'departure_date', 'date', 'departure_time'], 'Date not provided'),
      price: readValue(flight, ['price', 'total_price', 'cost'], 'Price unavailable'),
      airline: readValue(flight, ['airline', 'carrier'], 'Airline not provided'),
    };
  });
  const hotels = readArray(result, ['hotels', 'hotel_options', 'hotel']).map((item) => {
    const hotel = asRecord(item) ?? {};
    return {
      name: readValue(hotel, ['name', 'hotel_name'], 'Hotel name unavailable'),
      stars: readValue(hotel, ['stars', 'rating', 'star_rating'], 'Not rated'),
      pricePerNight: readValue(hotel, ['price_per_night', 'nightly_price', 'price'], 'Price unavailable'),
      amenities: readStringArray(hotel.amenities),
    };
  });
  const transport = readArray(result, ['transport', 'transportation', 'transports']).map((item) => {
    const option = asRecord(item) ?? {};
    return {
      type: readValue(option, ['type', 'name', 'transport_type'], 'Transport option'),
      estimatedCost: readValue(option, ['estimated_cost', 'cost', 'price'], 'Cost unavailable'),
    };
  });
  const places = readArray(result, ['places_to_visit', 'places', 'attractions', 'recommendations']).map((item) => {
    if (typeof item === 'string') {
      return { name: item, description: '' };
    }
    const place = asRecord(item) ?? {};
    return {
      name: readValue(place, ['name', 'title', 'place'], 'Recommended stop'),
      description: readValue(place, ['description', 'details', 'reason'], ''),
    };
  });

  return { flights, hotels, transport, places };
}

function parseParam(value: string | string[] | undefined) {
  const serialized = Array.isArray(value) ? value[0] : value;
  if (!serialized) {
    return null;
  }
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string; error?: string }>(error)) {
    return error.response?.data?.message ?? error.response?.data?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  const { theme } = useTheme();
  return (
    <View style={styles.sectionTitleRow}>
      <View style={[styles.sectionIcon, { backgroundColor: theme.inputBg }]}>
        <Ionicons color={theme.primary} name={icon} size={20} />
      </View>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
    </View>
  );
}

function EmptySection({ message }: { message: string }) {
  const { theme } = useTheme();
  return <Text style={[styles.emptySection, { color: theme.textSecondary }]}>{message}</Text>;
}

export default function ResultsScreen() {
  const params = useLocalSearchParams<{ data?: string | string[]; request?: string | string[] }>();
  const router = useRouter();
  const { token } = useAuth();
  const { theme } = useTheme();
  const rawResult = useMemo(() => parseParam(params.data), [params.data]);
  const requestData = useMemo(() => parseParam(params.request), [params.request]);
  const trip = useMemo(() => parseTripResult(rawResult), [rawResult]);
  const [saving, setSaving] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function saveTrip() {
    if (!token || rawResult === null) {
      setError('This trip cannot be saved because its data or session is missing.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await axios.post(
        API.trips,
        { trip: rawResult, preferences: requestData },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setNotice('Trip saved to your account.');
    } catch (saveError) {
      setError(apiErrorMessage(saveError, 'Unable to save this trip. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  async function bookTrip() {
    if (!token || rawResult === null) {
      setError('This trip cannot be booked because its data or session is missing.');
      return;
    }
    setBooking(true);
    setError('');
    setNotice('');
    try {
      await axios.post(
        API.reservations,
        { trip: rawResult, preferences: requestData },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setNotice('Reservation created. You can review it in My Reservations.');
    } catch (bookError) {
      setError(apiErrorMessage(bookError, 'Unable to create the reservation. Please try again.'));
    } finally {
      setBooking(false);
    }
  }

  if (rawResult === null) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safeArea, styles.missingState, { backgroundColor: theme.background }]}>
        <Ionicons color={theme.textSecondary} name="map-outline" size={48} />
        <Text style={[styles.missingTitle, { color: theme.text }]}>No itinerary found</Text>
        <Text style={[styles.missingBody, { color: theme.textSecondary }]}>Create a new plan and your results will appear here.</Text>
        <Button onPress={() => router.replace('/(app)/wizard')} title="Plan a Trip" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.kicker, { color: theme.primary }]}>BUILT AROUND YOU</Text>
        <Text style={[styles.title, { color: theme.text }]}>Your trip is ready</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Review the details, then save the plan or turn it into a reservation.</Text>

        <Card style={styles.sectionCard}>
          <SectionTitle icon="airplane-outline" title="Flights" />
          {trip.flights.length ? trip.flights.map((flight, index) => (
            <View key={`${flight.airline}-${index}`} style={[styles.resultItem, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
              <Text style={[styles.itemTitle, { color: theme.text }]}>{flight.origin} → {flight.destination}</Text>
              <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>{flight.airline} · {flight.departure}</Text>
              <Text style={[styles.price, { color: theme.primary }]}>{flight.price}</Text>
            </View>
          )) : <EmptySection message="No flight details were returned." />}
        </Card>

        <Card style={styles.sectionCard}>
          <SectionTitle icon="bed-outline" title="Hotels" />
          {trip.hotels.length ? trip.hotels.map((hotel, index) => (
            <View key={`${hotel.name}-${index}`} style={[styles.resultItem, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
              <View style={styles.itemHeadingRow}>
                <Text style={[styles.itemTitle, styles.itemHeadingText, { color: theme.text }]}>{hotel.name}</Text>
                <View style={[styles.ratingBadge, { backgroundColor: theme.inputBg }]}>
                  <Ionicons color={theme.accent} name="star" size={13} />
                  <Text style={[styles.ratingText, { color: theme.text }]}>{hotel.stars}</Text>
                </View>
              </View>
              <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>{hotel.amenities.length ? hotel.amenities.join(' · ') : 'Amenities not provided'}</Text>
              <Text style={[styles.price, { color: theme.primary }]}>{hotel.pricePerNight} / night</Text>
            </View>
          )) : <EmptySection message="No hotel details were returned." />}
        </Card>

        <Card style={styles.sectionCard}>
          <SectionTitle icon="car-outline" title="Transport" />
          {trip.transport.length ? trip.transport.map((transport, index) => (
            <View key={`${transport.type}-${index}`} style={[styles.transportRow, index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
              <Text style={[styles.itemTitle, { color: theme.text }]}>{transport.type}</Text>
              <Text style={[styles.transportCost, { color: theme.primary }]}>{transport.estimatedCost}</Text>
            </View>
          )) : <EmptySection message="No transport details were returned." />}
        </Card>

        <Card style={styles.sectionCard}>
          <SectionTitle icon="location-outline" title="Places to Visit" />
          {trip.places.length ? trip.places.map((place, index) => (
            <View key={`${place.name}-${index}`} style={styles.placeRow}>
              <View style={[styles.placeNumber, { backgroundColor: theme.primary }]}>
                <Text style={[styles.placeNumberText, { color: theme.surface }]}>{index + 1}</Text>
              </View>
              <View style={styles.placeCopy}>
                <Text style={[styles.itemTitle, { color: theme.text }]}>{place.name}</Text>
                {place.description ? <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>{place.description}</Text> : null}
              </View>
            </View>
          )) : <EmptySection message="No attraction recommendations were returned." />}
        </Card>

        {error ? <Text accessibilityRole="alert" style={[styles.feedback, { color: theme.error }]}>{error}</Text> : null}
        {notice ? <Text style={[styles.feedback, { color: theme.success }]}>{notice}</Text> : null}

        <View style={styles.actions}>
          <Button loading={saving} onPress={() => { void saveTrip(); }} title="Save Trip" variant="outline" />
          <Button loading={booking} onPress={() => { void bookTrip(); }} title="Book Now" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: 36, paddingHorizontal: 20, paddingTop: 12 },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.25, marginBottom: 5 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.7 },
  subtitle: { fontSize: 15, lineHeight: 23, marginBottom: 25, marginTop: 8 },
  sectionCard: { marginBottom: 14 },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 11 },
  sectionIcon: { alignItems: 'center', borderRadius: 11, height: 38, justifyContent: 'center', marginRight: 11, width: 38 },
  sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.25 },
  resultItem: { paddingVertical: 12 },
  itemHeadingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  itemHeadingText: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '800', lineHeight: 21 },
  itemMeta: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  price: { fontSize: 14, fontWeight: '800', marginTop: 7 },
  ratingBadge: { alignItems: 'center', borderRadius: 9, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  ratingText: { fontSize: 12, fontWeight: '800' },
  transportRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 13 },
  transportCost: { fontSize: 14, fontWeight: '800' },
  placeRow: { alignItems: 'flex-start', flexDirection: 'row', paddingVertical: 10 },
  placeNumber: { alignItems: 'center', borderRadius: 10, height: 30, justifyContent: 'center', marginRight: 11, width: 30 },
  placeNumberText: { fontSize: 12, fontWeight: '900' },
  placeCopy: { flex: 1 },
  emptySection: { fontSize: 14, lineHeight: 21, paddingBottom: 8, paddingTop: 5 },
  feedback: { fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 15, textAlign: 'center' },
  actions: { gap: 11, marginTop: 4 },
  missingState: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  missingTitle: { fontSize: 24, fontWeight: '900', marginTop: 16 },
  missingBody: { fontSize: 15, lineHeight: 22, marginBottom: 24, marginTop: 7, textAlign: 'center' },
});
