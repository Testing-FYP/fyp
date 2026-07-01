import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  raw?: unknown;
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

interface AiSummaryResult {
  title: string;
  description: string;
}

interface ParsedTripResult {
  flights: FlightResult[];
  hotels: HotelResult[];
  transport: TransportResult[];
  places: PlaceResult[];
  aiSummary: AiSummaryResult | null;
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
    if (Array.isArray(value) && value.length > 0) {
      return value;
    }
    if (asRecord(value)) {
      return [value];
    }
  }
  return [];
}

function readMoney(record: UnknownRecord, keys: readonly string[], fallback: string) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `$${value}`;
    }
    if (typeof value === 'string' && value.trim()) {
      const price = value.trim();
      return price.startsWith('$') ? price : `$${price}`;
    }
  }
  return fallback;
}

function readPositivePrice(
  record: UnknownRecord,
  keys: readonly string[],
  fallback: string,
  rejectZeroString = false,
) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return `$${value}`;
    }
    if (typeof value === 'string' && value.trim()) {
      const price = value.trim();
      if (rejectZeroString && price === '0') {
        continue;
      }
      return price.startsWith('$') ? price : `$${price}`;
    }
  }
  return fallback;
}

function getRecordArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getFlightSlices(raw: unknown) {
  const flight = asRecord(raw);
  return getRecordArray(flight?.['slices']);
}

function getSliceSegments(slice: unknown) {
  const sliceRecord = asRecord(slice);
  return getRecordArray(sliceRecord?.['segments']);
}

function getAirportCode(airport: unknown, fallback: string) {
  const airportRecord = asRecord(airport) ?? {};
  return readValue(airportRecord, ['iata_code', 'iataCode', 'code'], fallback);
}

function getSliceRouteCodes(slice: unknown) {
  const segments = getSliceSegments(slice);
  const firstSegment = asRecord(segments[0]);
  if (!firstSegment) {
    return 'Route unavailable';
  }

  const codes = [getAirportCode(firstSegment['origin'], 'Origin')];
  for (const segment of segments) {
    const segmentRecord = asRecord(segment);
    if (segmentRecord) {
      codes.push(getAirportCode(segmentRecord['destination'], 'Destination'));
    }
  }
  return codes.join(' → ');
}

function formatDuration(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Duration unavailable';
  }

  const duration = value.trim();
  const match = duration.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+(?:\.\d+)?S)?)?$/i,
  );
  if (!match) {
    return duration;
  }

  const totalHours = Number(match[1] ?? 0) * 24 + Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const parts = [];
  if (totalHours > 0) {
    parts.push(`${totalHours}h`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes}m`);
  }
  return parts.join(' ');
}

function formatTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Time TBA';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return 'Date not provided';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${months[date.getMonth()]} ${date.getDate()}, ${hours}:${minutes}`;
}

function formatReadableLabel(value: string) {
  const label = value.replace(/_/g, ' ').trim().toLowerCase();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : value;
}

function formatStopCount(segmentCount: number) {
  const stops = Math.max(0, segmentCount - 1);
  if (stops === 0) {
    return 'Nonstop';
  }
  return stops === 1 ? '1 stop' : `${stops} stops`;
}

function getLayoverText(segment: UnknownRecord, nextSegment: UnknownRecord) {
  const destination = asRecord(segment['destination']) ?? {};
  const code = getAirportCode(destination, 'transfer airport');
  const name = readValue(destination, ['name', 'city_name'], '');
  const location = name && name !== code ? `${code} (${name})` : code;
  const base = `Transfer at ${location}`;
  const arrivingAt = readValue(segment, ['arriving_at'], '');
  const departingAt = readValue(nextSegment, ['departing_at'], '');
  const arrivalTime = new Date(arrivingAt).getTime();
  const departureTime = new Date(departingAt).getTime();
  if (
    Number.isNaN(arrivalTime) ||
    Number.isNaN(departureTime) ||
    departureTime <= arrivalTime
  ) {
    return base;
  }

  const totalMinutes = Math.round((departureTime - arrivalTime) / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration = [hours > 0 ? `${hours}h` : '', minutes > 0 ? `${minutes}m` : '']
    .filter(Boolean)
    .join(' ');
  return duration ? `${base} · ${duration} layover` : base;
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
  const rawRecord = asRecord(raw) ?? {};
  const bso = asRecord(result['budgetSourceOptions']);
  const rootFlights = readArray(result, ['flights', 'flight_options', 'flight']);
  const flightItems = rootFlights.length
    ? rootFlights
    : readArray(bso ?? {}, ['flights']);
  const flights = flightItems.map((item) => {
    const flight = asRecord(item) ?? {};
    const slices = Array.isArray(flight['slices']) ? flight['slices'] : [];
    const firstSlice = asRecord(slices[0]);
    const segments =
      firstSlice && Array.isArray(firstSlice['segments'])
        ? firstSlice['segments']
        : [];
    const firstSegment = asRecord(segments[0]) ?? {};
    const lastSegment = asRecord(segments[segments.length - 1]) ?? firstSegment;
    const segmentOrigin = asRecord(firstSegment['origin']) ?? {};
    const segmentDestination = asRecord(lastSegment['destination']) ?? {};
    const segmentMarketingCarrier =
      asRecord(firstSegment['marketing_carrier']) ?? {};
    const owner = asRecord(flight['owner']) ?? {};
    const departure =
      readValue(firstSegment, ['departing_at'], '') ||
      readValue(
        flight,
        ['departure', 'departure_date', 'date', 'departure_time', 'departureTime'],
        'Date not provided',
      );

    return {
      origin:
        readValue(segmentOrigin, ['iata_code', 'city_name', 'name'], '') ||
        readValue(flight, ['origin', 'from', 'departure_airport'], 'Origin not provided'),
      destination:
        readValue(segmentDestination, ['iata_code', 'city_name', 'name'], '') ||
        readValue(flight, ['destination', 'to', 'arrival_airport'], 'Destination not provided'),
      departure: formatDateTime(departure),
      price: readPositivePrice(
        flight,
        ['total_amount', 'display_price', 'price', 'total_price', 'cost'],
        'Price unavailable',
        true,
      ),
      airline:
        readValue(segmentMarketingCarrier, ['name'], '') ||
        readValue(owner, ['name'], '') ||
        readValue(
          flight,
          ['airline', 'carrier', 'marketing_carrier', 'operatingCarrier'],
          'Airline not provided',
        ),
      raw: item,
    };
  });
  const sourceHotels = readArray(bso ?? {}, ['hotels']);
  const hotelItems = sourceHotels.length
    ? sourceHotels
    : readArray(result, ['hotels', 'hotel_options', 'hotel']);
  const hotels = hotelItems.map((item) => {
    const hotel = asRecord(item) ?? {};
    return {
      name: readValue(hotel, ['name', 'hotel_name'], 'Hotel name unavailable'),
      stars: readValue(hotel, ['rating', 'stars', 'star_rating', 'hotelClass'], 'Not rated'),
      pricePerNight: readPositivePrice(
        hotel,
        ['price', 'price_per_night', 'nightly_price'],
        'Price unavailable',
      ),
      amenities: readStringArray(hotel.amenities),
    };
  });
  const transport = readArray(result, ['transport', 'transportation', 'transports']).map((item) => {
    const option = asRecord(item) ?? {};
    const type = readValue(
      option,
      ['transportType', 'type', 'name', 'transport_type'],
      'Transport option',
    );
    return {
      type: formatReadableLabel(type),
      estimatedCost: readMoney(
        option,
        ['estimatedCost', 'estimated_cost', 'cost', 'price'],
        'Cost unavailable',
      ),
    };
  });
  const rootPlaces = readArray(result, [
    'places_to_visit',
    'places',
    'attractions',
    'recommendations',
    'placesToVisit',
  ]);
  const placeItems = rootPlaces.length
    ? rootPlaces
    : readArray(bso ?? {}, ['placesToVisit']);
  const places = placeItems.map((item) => {
    if (typeof item === 'string') {
      return { name: item, description: '' };
    }
    const place = asRecord(item) ?? {};
    return {
      name: readValue(place, ['name', 'title', 'place'], 'Recommended stop'),
      description: readValue(place, ['description', 'details', 'reason'], ''),
    };
  });

  const aiSummaryRecord =
    asRecord(result.aiSummary) ?? asRecord(rawRecord.aiSummary);
  const aiSummaryTitle = aiSummaryRecord
    ? readValue(aiSummaryRecord, ['title'], '')
    : '';
  const aiSummary = aiSummaryTitle
    ? {
        title: aiSummaryTitle,
        description: readValue(aiSummaryRecord ?? {}, ['description'], ''),
      }
    : null;

  return { flights, hotels, transport, places, aiSummary };
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

function ExpandedFlightDetails({ flight }: { flight: FlightResult }) {
  const { theme } = useTheme();
  const slices = getFlightSlices(flight.raw);

  if (slices.length === 0) {
    return null;
  }

  return (
    <View style={[styles.expandedFlightBox, { borderTopColor: theme.border }]}>
      {slices.map((slice, sliceIndex) => {
        const sliceRecord = asRecord(slice) ?? {};
        const segments = getSliceSegments(slice);
        const sliceLabel =
          sliceIndex === 0
            ? 'Outbound'
            : sliceIndex === 1
              ? 'Return'
              : `Slice ${sliceIndex + 1}`;
        const stopLabel = segments.length
          ? formatStopCount(segments.length)
          : 'Stops unavailable';

        return (
          <View
            key={readValue(sliceRecord, ['id'], `slice-${sliceIndex}`)}
            style={[
              styles.flightSliceBox,
              sliceIndex > 0 && {
                borderTopColor: theme.border,
                borderTopWidth: 1,
              },
            ]}
          >
            <Text style={[styles.itemTitle, { color: theme.text }]}>{sliceLabel}</Text>
            <Text style={[styles.routePathText, { color: theme.primary }]}>
              {getSliceRouteCodes(slice)}
            </Text>
            <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
              {formatDuration(sliceRecord['duration'])} · {stopLabel}
            </Text>

            {segments.map((segment, segmentIndex) => {
              const segmentRecord = asRecord(segment) ?? {};
              const origin = asRecord(segmentRecord['origin']) ?? {};
              const destination = asRecord(segmentRecord['destination']) ?? {};
              const originCode = getAirportCode(origin, 'Origin');
              const destinationCode = getAirportCode(destination, 'Destination');
              const marketingCarrier =
                asRecord(segmentRecord['marketing_carrier']) ?? {};
              const airline =
                readValue(marketingCarrier, ['name'], '') ||
                readValue(segmentRecord, ['marketing_carrier_name'], '') ||
                flight.airline;
              const flightNumber = readValue(
                segmentRecord,
                ['marketing_carrier_flight_number'],
                '',
              );
              const aircraft = readValue(
                segmentRecord,
                ['aircraft_name'],
                'Aircraft TBA',
              );
              const cabin = formatReadableLabel(
                readValue(segmentRecord, ['cabin_class'], 'Economy'),
              );
              const legroom = readValue(segmentRecord, ['legroom'], 'Legroom TBA');
              const amenities = getRecordArray(segmentRecord['amenities']).filter(
                (amenity): amenity is string =>
                  typeof amenity === 'string' && Boolean(amenity.trim()),
              );
              const nextSegment = asRecord(segments[segmentIndex + 1]);

              return (
                <View
                  key={readValue(segmentRecord, ['id'], `segment-${segmentIndex}`)}
                >
                  <View
                    style={[
                      styles.flightSegmentBox,
                      { backgroundColor: theme.inputBg },
                    ]}
                  >
                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                      {segments.length === 1
                        ? 'Flight details'
                        : `Segment ${segmentIndex + 1}`}
                    </Text>
                    <Text style={[styles.itemTitle, { color: theme.text }]}>
                      {originCode} → {destinationCode}
                    </Text>
                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                      {[airline, flightNumber].filter(Boolean).join(' · ')}
                    </Text>

                    <View style={styles.flightSummaryRow}>
                      <View style={styles.itemHeadingText}>
                        <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>Depart</Text>
                        <Text style={[styles.itemTitle, { color: theme.text }]}>
                          {formatTime(segmentRecord['departing_at'])} · {originCode}
                        </Text>
                      </View>
                      <View style={styles.itemHeadingText}>
                        <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>Arrive</Text>
                        <Text style={[styles.itemTitle, { color: theme.text }]}>
                          {formatTime(segmentRecord['arriving_at'])} · {destinationCode}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                      {formatDuration(segmentRecord['duration'])} · {aircraft}
                    </Text>
                    <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                      {cabin} · {legroom}
                    </Text>
                    {amenities.length > 0 ? (
                      <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                        {amenities.join(' · ')}
                      </Text>
                    ) : null}
                  </View>

                  {nextSegment ? (
                    <Text style={[styles.layoverText, { color: theme.textSecondary }]}>
                      {getLayoverText(segmentRecord, nextSegment)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

export default function ResultsScreen() {
  const params = useLocalSearchParams<{ data?: string | string[]; request?: string | string[] }>();
  const router = useRouter();
  const { token } = useAuth();
  const { theme } = useTheme();
  const rawResult = useMemo(() => parseParam(params.data), [params.data]);
  const requestData = useMemo(() => parseParam(params.request), [params.request]);
  const trip = useMemo(() => parseTripResult(rawResult), [rawResult]);
  const [expandedFlightIndex, setExpandedFlightIndex] = useState<number | null>(null);
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

        {trip.aiSummary ? (
          <Card style={styles.aiSummaryCard}>
            <Text style={[styles.aiSummaryTitle, { color: theme.text }]}>
              {trip.aiSummary.title}
            </Text>
            {trip.aiSummary.description ? (
              <Text style={[styles.aiSummaryDescription, { color: theme.textSecondary }]}>
                {trip.aiSummary.description}
              </Text>
            ) : null}
          </Card>
        ) : null}

        <Card style={styles.sectionCard}>
          <SectionTitle icon="airplane-outline" title="Flights" />
          {trip.flights.length ? trip.flights.map((flight, index) => {
            const isExpanded = expandedFlightIndex === index;
            const slices = getFlightSlices(flight.raw);
            const outboundSlice = asRecord(slices[0]);
            const outboundSegments = getSliceSegments(slices[0]);
            const durationValue = outboundSlice?.['duration'];
            const duration =
              typeof durationValue === 'string' && durationValue.trim()
                ? formatDuration(durationValue)
                : '';
            const stopLabel = outboundSegments.length
              ? formatStopCount(outboundSegments.length)
              : '';
            const summaryDetails = [duration, stopLabel].filter(Boolean).join(' · ');
            const canExpand = slices.length > 0;

            return (
              <View
                key={`${flight.airline}-${index}`}
                style={[
                  styles.resultItem,
                  index > 0 && { borderTopColor: theme.border, borderTopWidth: 1 },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isExpanded }}
                  onPress={() => {
                    if (canExpand) {
                      setExpandedFlightIndex(isExpanded ? null : index);
                    }
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                >
                  <View style={styles.flightHeaderRow}>
                    <Text
                      style={[
                        styles.itemTitle,
                        styles.itemHeadingText,
                        { color: theme.text },
                      ]}
                    >
                      {flight.origin} → {flight.destination}
                    </Text>
                    {canExpand ? (
                      <Ionicons
                        color={theme.textSecondary}
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={19}
                      />
                    ) : null}
                  </View>
                  <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                    {flight.airline} · {flight.departure}
                  </Text>
                  <View style={styles.flightSummaryRow}>
                    <Text style={[styles.price, { color: theme.primary }]}>
                      {flight.price}
                    </Text>
                    {summaryDetails ? (
                      <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                        {summaryDetails}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>

                {isExpanded ? <ExpandedFlightDetails flight={flight} /> : null}
              </View>
            );
          }) : <EmptySection message="No flight details were returned." />}
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
  aiSummaryCard: { marginBottom: 14 },
  aiSummaryTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.25 },
  aiSummaryDescription: { fontSize: 14, lineHeight: 21, marginTop: 7 },
  sectionCard: { marginBottom: 14 },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 11 },
  sectionIcon: { alignItems: 'center', borderRadius: 11, height: 38, justifyContent: 'center', marginRight: 11, width: 38 },
  sectionTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.25 },
  resultItem: { paddingVertical: 12 },
  flightHeaderRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  flightSummaryRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  expandedFlightBox: { borderTopWidth: 1, marginTop: 14, paddingTop: 4 },
  flightSliceBox: { paddingVertical: 12 },
  flightSegmentBox: { borderRadius: 12, marginTop: 10, padding: 13 },
  routePathText: { fontSize: 16, fontWeight: '900', lineHeight: 22, marginTop: 5 },
  layoverText: { fontSize: 12, fontWeight: '700', lineHeight: 18, paddingVertical: 10, textAlign: 'center' },
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
