import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { API } from '@/constants/api';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';

type ReservationStatus = 'confirmed' | 'cancelled' | 'pending';

interface Reservation {
  id: string;
  type: string;
  origin: string;
  destination: string;
  date: string;
  totalAmount: string;
  status: ReservationStatus;
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

function parseReservations(raw: unknown): Reservation[] {
  const record = asRecord(raw);
  const values = Array.isArray(raw)
    ? raw
    : Array.isArray(record?.reservations)
      ? record.reservations
      : Array.isArray(record?.data)
        ? record.data
        : [];

  return values.flatMap((value, index) => {
    const item = asRecord(value);
    if (!item) {
      return [];
    }
    const rawStatus = readValue(item, ['status'], 'pending').toLowerCase();
    const status: ReservationStatus =
      rawStatus === 'confirmed' || rawStatus === 'cancelled' ? rawStatus : 'pending';
    return [{
      id: readValue(item, ['id', '_id', 'reservation_id'], String(index)),
      type: readValue(item, ['type', 'reservation_type'], 'trip'),
      origin: readValue(item, ['origin', 'from'], 'Origin'),
      destination: readValue(item, ['destination', 'to'], 'Destination'),
      date: readValue(item, ['date', 'departure_date', 'created_at'], 'Date unavailable'),
      totalAmount: readValue(item, ['total_amount', 'totalAmount', 'amount', 'price'], 'Amount unavailable'),
      status,
    }];
  });
}

function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string; error?: string }>(error)) {
    return error.response?.data?.message ?? error.response?.data?.error ?? fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function reservationIcon(type: string): keyof typeof Ionicons.glyphMap {
  const normalized = type.toLowerCase();
  if (normalized.includes('flight')) return 'airplane-outline';
  if (normalized.includes('hotel')) return 'bed-outline';
  if (normalized.includes('bus')) return 'bus-outline';
  return 'ticket-outline';
}

export default function ReservationsScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { theme } = useTheme();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadReservations = useCallback(async (asRefresh = false) => {
    if (!token) {
      setError('Your session has expired. Sign in and try again.');
      setLoading(false);
      return;
    }
    asRefresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const response = await axios.get<unknown>(API.reservations, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReservations(parseReservations(response.data));
    } catch (loadError) {
      setError(apiErrorMessage(loadError, 'Unable to load your reservations.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    void loadReservations();
  }, [loadReservations]);

  async function cancelReservation(id: string) {
    if (!token) {
      setError('Your session has expired. Sign in and try again.');
      return;
    }
    setCancellingId(id);
    setError('');
    try {
      await axios.put(
        `${API.reservations}/${encodeURIComponent(id)}/cancel`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setReservations((current) => current.map((item) => item.id === id ? { ...item, status: 'cancelled' } : item));
    } catch (cancelError) {
      setError(apiErrorMessage(cancelError, 'Unable to cancel this reservation.'));
    } finally {
      setCancellingId(null);
    }
  }

  function confirmCancellation(id: string) {
    Alert.alert(
      'Cancel reservation?',
      'This action cannot be undone.',
      [
        { text: 'Keep reservation', style: 'cancel' },
        { text: 'Cancel reservation', style: 'destructive', onPress: () => { void cancelReservation(id); } },
      ],
    );
  }

  if (loading) {
    return <LoadingSpinner fill message="Loading your reservations…" />;
  }

  return (
    <SafeAreaView edges={['bottom']} style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, reservations.length === 0 && styles.emptyContent]}
        refreshControl={<RefreshControl colors={[theme.primary]} onRefresh={() => { void loadReservations(true); }} refreshing={refreshing} tintColor={theme.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {reservations.length > 0 ? (
          <>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Flights, stays, and transport you’ve booked in one place.</Text>
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
            <View style={styles.list}>
              {reservations.map((reservation) => {
                const statusColor = reservation.status === 'confirmed' ? theme.success : reservation.status === 'cancelled' ? theme.error : theme.accent;
                return (
                  <Card key={reservation.id} style={styles.reservationCard}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.typeIcon, { backgroundColor: theme.inputBg }]}>
                        <Ionicons color={theme.primary} name={reservationIcon(reservation.type)} size={22} />
                      </View>
                      <View style={styles.typeCopy}>
                        <Text style={[styles.type, { color: theme.text }]}>{reservation.type}</Text>
                        <Text style={[styles.date, { color: theme.textSecondary }]}>{displayDate(reservation.date)}</Text>
                      </View>
                      <View style={[styles.badge, { borderColor: statusColor }]}>
                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                        <Text style={[styles.badgeText, { color: statusColor }]}>{reservation.status}</Text>
                      </View>
                    </View>
                    <Text style={[styles.route, { color: theme.text }]}>{reservation.origin} → {reservation.destination}</Text>
                    <View style={[styles.amountRow, { borderTopColor: theme.border }]}>
                      <Text style={[styles.amountLabel, { color: theme.textSecondary }]}>Total amount</Text>
                      <Text style={[styles.amount, { color: theme.text }]}>{reservation.totalAmount}</Text>
                    </View>
                    {reservation.status !== 'cancelled' ? (
                      <Button
                        loading={cancellingId === reservation.id}
                        onPress={() => confirmCancellation(reservation.id)}
                        title="Cancel Reservation"
                        variant="danger"
                      />
                    ) : null}
                  </Card>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIllustration, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
              <Ionicons color={theme.primary} name="ticket-outline" size={44} />
              <View style={[styles.emptyPlane, { backgroundColor: theme.primary }]}>
                <Ionicons color={theme.surface} name="airplane" size={18} />
              </View>
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No reservations yet</Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>When you book a trip, its details and status will live here.</Text>
            {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.error }]}>{error}</Text> : null}
            <Button onPress={() => router.push('/(app)/wizard')} title="Plan Your First Trip" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { paddingBottom: 36, paddingHorizontal: 20, paddingTop: 10 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 18 },
  error: { fontSize: 14, lineHeight: 20, marginBottom: 14, textAlign: 'center' },
  list: { gap: 14 },
  reservationCard: { padding: 17 },
  cardHeader: { alignItems: 'center', flexDirection: 'row' },
  typeIcon: { alignItems: 'center', borderRadius: 12, height: 44, justifyContent: 'center', marginRight: 11, width: 44 },
  typeCopy: { flex: 1 },
  type: { fontSize: 15, fontWeight: '800', textTransform: 'capitalize' },
  date: { fontSize: 12, marginTop: 3 },
  badge: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6 },
  statusDot: { borderRadius: 3, height: 6, width: 6 },
  badgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase' },
  route: { fontSize: 19, fontWeight: '800', letterSpacing: -0.25, marginTop: 18 },
  amountRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, marginTop: 17, paddingTop: 14 },
  amountLabel: { fontSize: 13 },
  amount: { fontSize: 16, fontWeight: '900' },
  emptyState: { alignItems: 'center' },
  emptyIllustration: { alignItems: 'center', borderRadius: 34, borderWidth: 1, height: 126, justifyContent: 'center', marginBottom: 25, position: 'relative', width: 126 },
  emptyPlane: { alignItems: 'center', borderRadius: 18, bottom: 9, height: 36, justifyContent: 'center', position: 'absolute', right: 3, width: 36 },
  emptyTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
  emptyBody: { fontSize: 15, lineHeight: 22, marginBottom: 24, marginTop: 8, maxWidth: 300, textAlign: 'center' },
});
