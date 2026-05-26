import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { searchSerpApiFlights as searchGoogleFlights } from '../../google-api/google-flights';
import { searchSerpApiHotels as searchGoogleHotels } from '../../google-api/google-hotels';

const LOCATIONIQ_KEY = 'pk.35eee2d341d3d4fca912eeafc74ba5a4';
const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

// ──────────────────────────────────────────────────────────────
// LocationIQ Helpers
// ──────────────────────────────────────────────────────────────

// Centralized throttle: ensures at least 500ms between any two LocationIQ requests
// and automatically retries once on 429 (rate limit) after a 1s pause.
let _lastLocationIqCall = 0;
async function locationIqFetch(url: string, label: string): Promise<Response | null> {
  // Enforce 500ms gap between calls
  const now = Date.now();
  const elapsed = now - _lastLocationIqCall;
  if (elapsed < 500) {
    await new Promise(r => setTimeout(r, 500 - elapsed));
  }
  _lastLocationIqCall = Date.now();

  const res = await fetch(url);

  // If rate-limited, wait 1s and retry once
  if (res.status === 429) {
    console.warn(`  ⏳ LocationIQ 429 on ${label} — waiting 1s and retrying...`);
    await new Promise(r => setTimeout(r, 1000));
    _lastLocationIqCall = Date.now();
    const retry = await fetch(url);
    if (!retry.ok) {
      console.warn(`  ❌ LocationIQ retry still failed (${retry.status}) for ${label}`);
      return null;
    }
    return retry;
  }

  if (!res.ok) {
    console.warn(`  ⚠️ LocationIQ HTTP ${res.status} for ${label}`);
    return null;
  }
  return res;
}

/**
 * Calculate the great-circle distance between two points on the Earth using the Haversine formula.
 * Returns distance in kilometers.
 */
function haversineDistance(lat1Str: string, lon1Str: string, lat2Str: string, lon2Str: string): number {
  const lat1 = parseFloat(lat1Str);
  const lon1 = parseFloat(lon1Str);
  const lat2 = parseFloat(lat2Str);
  const lon2 = parseFloat(lon2Str);

  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;

  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Geocode a CITY NAME (not IATA code) to lat/lon using LocationIQ.
 * This ensures we get city-center coordinates, not airport coordinates.
 */
async function geocodeCity(cityName: string, countryName: string = ''): Promise<{ lat: string; lon: string; displayName: string } | null> {
  const searchQuery = countryName ? `${cityName}, ${countryName}` : cityName;
  try {
    const url = `https://us1.locationiq.com/v1/search?key=${LOCATIONIQ_KEY}&q=${encodeURIComponent(searchQuery)}&format=json&limit=1&addressdetails=1`;
    const res = await locationIqFetch(url, `geocode "${searchQuery}"`);
    if (!res) return null;
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: data[0].lat, lon: data[0].lon, displayName: data[0].display_name };
    }
  } catch (err) {
    console.warn('LocationIQ geocoding failed:', err);
  }
  return null;
}

/**
 * Geocode a place name using SerpApi Google Maps local results + Nominatim fallback.
 * Returns coordinates only if they are within maxDistKm of the destination.
 */
async function geocodePlaceName(
  placeName: string,
  cityName: string,
  countryName: string = '',
  countryCode: string = '',
  destLat: string = '',
  destLon: string = ''
): Promise<{
  lat: string;
  lon: string;
  rating?: number;
  reviewsCount?: number;
  address?: string;
  placeType?: string;
  source?: string;
} | null> {
  const MAX_DIST = 100; // km - reject if further than this

  const isCloseEnough = (lat: string, lon: string): boolean => {
    if (!destLat || !destLon) return true;
    const dist = haversineDistance(destLat, destLon, lat, lon);
    return dist <= MAX_DIST;
  };

  // Attempt 1: SerpApi Google Maps local results
  const placeQuery = countryName
    ? `${placeName}, ${cityName}, ${countryName}`
    : `${placeName}, ${cityName}`;

  if (SERPAPI_KEY) {
    try {
      const searchParams = new URLSearchParams({
        engine: 'google_maps',
        type: 'search',
        q: placeQuery,
        api_key: SERPAPI_KEY,
        no_cache: 'true',
      });

      if (countryCode) searchParams.set('gl', countryCode.toLowerCase());
      if (destLat && destLon) searchParams.set('ll', `@${destLat},${destLon},13z`);

      const res = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
      if (!res.ok) {
        console.warn(`  SerpApi Google Maps HTTP ${res.status} for place "${placeName}"`);
      } else {
        const data = await res.json();
        const localResults = Array.isArray(data?.local_results) ? data.local_results : [];
        const first = localResults[0];
        const lat = first?.gps_coordinates?.latitude;
        const lon = first?.gps_coordinates?.longitude;

        if (lat !== undefined && lon !== undefined) {
          const latStr = String(lat);
          const lonStr = String(lon);
          if (isCloseEnough(latStr, lonStr)) {
            console.log(`  SerpApi Maps: "${placeName}" -> lat=${latStr}, lon=${lonStr} (OK)`);
            return {
              lat: latStr,
              lon: lonStr,
              rating: typeof first?.rating === 'number' ? first.rating : undefined,
              reviewsCount: typeof first?.reviews === 'number' ? first.reviews : undefined,
              address: typeof first?.address === 'string' ? first.address : undefined,
              placeType: typeof first?.type === 'string' ? first.type : undefined,
              source: 'serpapi_maps',
            };
          }

          const dist = haversineDistance(destLat, destLon, latStr, lonStr);
          console.log(`  SerpApi Maps: "${placeName}" -> lat=${latStr}, lon=${lonStr} -> ${dist.toFixed(0)} km (TOO FAR, trying Nominatim)`);
        } else {
          console.warn(`  SerpApi Maps returned no coordinates for place "${placeName}"`);
        }
      }
    } catch (err) {
      console.warn(`  SerpApi Maps lookup failed for place "${placeName}":`, err);
    }
  } else {
    console.warn(`  SERPAPI_API_KEY missing, skipping SerpApi lookup for "${placeName}"`);
  }

  // Attempt 2: Nominatim fallback
  const nomQuery = countryName
    ? `${placeName}, ${cityName}, ${countryName}`
    : `${placeName}, ${cityName}`;

  try {
    await new Promise(r => setTimeout(r, 1000));
    const countryParam = countryCode ? `&countrycodes=${countryCode}` : '';
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nomQuery)}&format=json&limit=1${countryParam}`,
      { headers: { 'User-Agent': 'TravelPlannerWebsite/1.0' } }
    );

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const { lat, lon } = data[0];
        const dist = destLat && destLon ? haversineDistance(destLat, destLon, lat, lon) : 0;
        console.log(`  NOMINATIM FALLBACK: "${placeName}" -> lat=${lat}, lon=${lon} -> ${dist.toFixed(1)} km`);
        if (isCloseEnough(lat, lon)) {
          return { lat, lon, source: 'nominatim' };
        }
        console.log(`  Nominatim result too far (${dist.toFixed(0)} km)`);
      }
    }
  } catch {
    // both failed
  }

  console.log(`  REJECTED - both geocoders failed for: "${placeName}"`);
  return null;
}
async function findNearby(lat: string, lon: string, tag: string, radiusMeters: number = 20000, limit: number = 10): Promise<any[]> {
  try {
    const url = `https://us1.locationiq.com/v1/nearby?key=${LOCATIONIQ_KEY}&lat=${lat}&lon=${lon}&tag=${tag}&radius=${radiusMeters}&limit=${limit}&format=json`;
    const res = await locationIqFetch(url, `nearby ${tag}`);
    if (!res) return [];
    const data = await res.json();
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    console.warn(`LocationIQ nearby (${tag}) failed:`, err);
  }
  return [];
}

function minutesToIsoDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes || 0));
  const days = Math.floor(safeMinutes / 1440);
  const hours = Math.floor((safeMinutes % 1440) / 60);
  const mins = safeMinutes % 60;

  let duration = 'PT';
  if (days > 0) duration += `${days}D`;
  if (hours > 0) duration += `${hours}H`;
  if (mins > 0 || duration === 'PT') duration += `${mins}M`;
  return duration;
}

function timeToDateKey(timeValue: string): string {
  return timeValue ? timeValue.split(' ')[0] : '';
}

function formatFlightDuration(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function formatFlightTime(timeValue: string): string {
  return timeValue || 'N/A';
}

function splitSerpApiSegmentsByTrip(itinerary: any, returnDate: string): any[][] {
  const rawSegments = Array.isArray(itinerary?.flights) ? itinerary.flights : [];
  if (rawSegments.length === 0) return [];

  const normalizedSegments = rawSegments.map((segment: any) => ({
    departing_at: toIsoTimeString(segment?.departure_airport?.time || ''),
  }));

  const returnIndex = returnDate
    ? normalizedSegments.findIndex((segment: any) => timeToDateKey(segment.departing_at) >= returnDate)
    : -1;

  if (returnIndex > 0) {
    return [rawSegments.slice(0, returnIndex), rawSegments.slice(returnIndex)];
  }

  return [rawSegments];
}

function logSerpApiSegment(segment: any, segmentIndex: number) {
  const departureAirport = segment?.departure_airport || {};
  const arrivalAirport = segment?.arrival_airport || {};
  const durationMinutes = Number(segment?.duration || 0);
  const notes: string[] = [];

  if (segment?.overnight) notes.push('overnight');
  if (segment?.often_delayed_by_over_30_min) notes.push('often delayed >30 min');
  if (segment?.plane_and_crew_by) notes.push(`plane and crew by ${segment.plane_and_crew_by}`);

  console.log(
    `      Segment ${segmentIndex + 1}: ${segment?.airline || 'Airline'} ${segment?.flight_number || ''}`.trim()
  );
  console.log(
    `        ${departureAirport?.id || 'DEP'} ${departureAirport?.name || 'Departure airport'} at ${formatFlightTime(departureAirport?.time || '')}` +
      ` → ${arrivalAirport?.id || 'ARR'} ${arrivalAirport?.name || 'Arrival airport'} at ${formatFlightTime(arrivalAirport?.time || '')}`
  );
  console.log(
    `        Duration: ${formatFlightDuration(durationMinutes)} | Cabin: ${segment?.travel_class || 'N/A'} | Aircraft: ${segment?.airplane || 'N/A'}`
  );
  console.log(
    `        Legroom: ${segment?.legroom || 'N/A'} | Airfare details: ${segment?.extensions?.join(' | ') || 'N/A'}`
  );

  if (segment?.ticket_also_sold_by?.length) {
    console.log(`        Also sold by: ${segment.ticket_also_sold_by.join(', ')}`);
  }

  if (notes.length > 0) {
    console.log(`        Notes: ${notes.join(' | ')}`);
  }
}

function logSerpApiLayover(layover: any, layoverIndex: number) {
  if (!layover) return;

  const notes: string[] = [];
  if (layover?.overnight) notes.push('overnight');

  console.log(
    `        Layover ${layoverIndex + 1}: ${layover?.name || 'Layover airport'} (${layover?.id || 'N/A'}) for ${formatFlightDuration(Number(layover?.duration || 0))}` +
      `${notes.length > 0 ? ` | ${notes.join(' | ')}` : ''}`
  );
}

function toIsoTimeString(timeValue: string): string {
  if (!timeValue) return '';
  const normalized = timeValue.includes('T') ? timeValue : timeValue.replace(' ', 'T');
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

function buildAirportRef(airport: any) {
  return {
    iata_code: airport?.id || '',
    name: airport?.name || airport?.id || '',
    city_name: airport?.city || airport?.name || airport?.id || '',
  };
}

const AIRLINE_IATA_BY_NAME: Record<string, string> = {
  'flynas': 'XY',
  'royal jordanian': 'RJ',
  'saudia': 'SV',
  'etihad': 'EY',
  'air cairo': 'SM',
  'emirates': 'EK',
  'qatar airways': 'QR',
  'turkish airlines': 'TK',
  'flydubai': 'FZ',
  'air arabia': 'G9',
  'jazeera airways': 'J9',
  'kuwait airways': 'KU',
  'gulf air': 'GF',
  'egyptair': 'MS',
  'oman air': 'WY',
  'wizz air': 'W6',
  'pegasus airlines': 'PC',
  'lufthansa': 'LH',
  'british airways': 'BA',
  'air france': 'AF',
  'klm': 'KL',
};

function extractAirlineIata(segment: any): string {
  const flightNumber = String(segment?.flight_number || '').trim().toUpperCase();
  const flightCodeMatch = flightNumber.match(/^([A-Z0-9]{2})\s*\d+/);
  if (flightCodeMatch?.[1]) return flightCodeMatch[1];

  const airlineName = String(segment?.airline || '').trim().toLowerCase();
  return AIRLINE_IATA_BY_NAME[airlineName] || '';
}

function buildAirlineLogoUrl(segment: any): string {
  if (segment?.airline_logo) return segment.airline_logo;
  const iataCode = extractAirlineIata(segment);
  return iataCode ? `https://images.kiwi.com/airlines/64/${iataCode}.png` : '';
}

function normalizeSerpApiSegment(segment: any, index: number, cabinClass: string) {
  const departureAirport = segment?.departure_airport || {};
  const arrivalAirport = segment?.arrival_airport || {};
  const extensions = Array.isArray(segment?.extensions) ? segment.extensions : [];
  const carbonKg = segment?.carbon_emissions?.this_flight
    ? `${Math.round(Number(segment.carbon_emissions.this_flight) / 1000)} kg`
    : '';
  const airlineIata = extractAirlineIata(segment);
  const airlineLogoUrl = buildAirlineLogoUrl(segment);
  return {
    id: `${departureAirport.id || 'dep'}-${arrivalAirport.id || 'arr'}-${index}`,
    departing_at: toIsoTimeString(departureAirport.time || ''),
    arriving_at: toIsoTimeString(arrivalAirport.time || ''),
    duration: minutesToIsoDuration(Number(segment?.duration || 0)),
    origin: buildAirportRef(departureAirport),
    destination: buildAirportRef(arrivalAirport),
    origin_name: departureAirport.name || departureAirport.id || '',
    destination_name: arrivalAirport.name || arrivalAirport.id || '',
    origin_terminal: '-',
    destination_terminal: '-',
    aircraft_name: segment?.airplane || 'Aircraft',
    marketing_carrier: {
      name: segment?.airline || 'Airline',
      iata_code: airlineIata,
      logo_symbol_url: airlineLogoUrl,
      logo_url: airlineLogoUrl,
    },
    marketing_carrier_flight_number: segment?.flight_number || '',
    cabin_class: (segment?.travel_class || cabinClass || 'economy').toLowerCase(),
    legroom: segment?.legroom || '',
    amenities: extensions,
    airfare_details: extensions,
    carbon_emissions: carbonKg,
    notes: [
      segment?.overnight ? 'overnight' : '',
      segment?.often_delayed_by_over_30_min ? 'often delayed over 30 min' : '',
    ].filter(Boolean),
  };
}

function normalizeSerpApiLayover(layover: any) {
  const durationMinutes = Number(layover?.duration || 0);
  return {
    airportName: layover?.name || 'Layover airport',
    airportCode: layover?.id || '',
    duration: formatFlightDuration(durationMinutes),
    durationMinutes,
    overnight: !!layover?.overnight,
  };
}

function normalizeSerpApiItinerary(itinerary: any, returnDate: string, cabinClass: string, passengers: any[]) {
  const rawSegments = Array.isArray(itinerary?.flights) ? itinerary.flights : [];
  const rawLayovers = Array.isArray(itinerary?.layovers) ? itinerary.layovers : [];
  const normalizedSegments = rawSegments.map((segment: any, index: number) => normalizeSerpApiSegment(segment, index, cabinClass));
  const firstRawSegment = rawSegments[0] || {};
  const ownerIata = extractAirlineIata(firstRawSegment);
  const ownerLogoUrl = buildAirlineLogoUrl(firstRawSegment);

  const returnIndex = returnDate
    ? normalizedSegments.findIndex((segment: any) => timeToDateKey(segment.departing_at) >= returnDate)
    : -1;

  const sliceGroups = returnIndex > 0
    ? [normalizedSegments.slice(0, returnIndex), normalizedSegments.slice(returnIndex)]
    : [normalizedSegments];

  const slices = sliceGroups.filter(group => group.length > 0).map((segments, sliceIndex) => {
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const groupStartIndex = normalizedSegments.indexOf(firstSegment);
    const layovers = segments
      .slice(0, -1)
      .map((_: any, segmentIndex: number) => rawLayovers[groupStartIndex + segmentIndex])
      .filter(Boolean)
      .map(normalizeSerpApiLayover);
    const totalDurationMinutes = firstSegment?.departing_at && lastSegment?.arriving_at
      ? Math.max(0, Math.round((new Date(lastSegment.arriving_at).getTime() - new Date(firstSegment.departing_at).getTime()) / 60000))
      : 0;

    return {
      id: `${itinerary?.departure_token || itinerary?.booking_token || itinerary?.price || 'serp'}-${sliceIndex}`,
      duration: minutesToIsoDuration(totalDurationMinutes),
      segments,
      layovers,
    };
  });

  const totalIncludedBaggage = 0;

  const hasPrice = typeof itinerary?.price === 'number' && Number.isFinite(itinerary.price) && itinerary.price > 0;

  return {
    id: itinerary?.booking_token || itinerary?.departure_token || `${itinerary?.price || 'serp'}-${Math.random().toString(36).slice(2, 8)}`,
    slices,
    passengers: passengers.length > 0 ? passengers : [{ type: 'adult' }],
    total_amount: hasPrice ? String(itinerary.price) : '',
    display_price: hasPrice ? Number(itinerary.price) : null,
    baggage_metadata: { carry_on: 1, checked: totalIncludedBaggage },
    estimated_baggage_fee: 0,
    total_included_baggage: totalIncludedBaggage,
    owner: {
      name: itinerary?.flights?.[0]?.airline || 'Google Flights',
      iata_code: ownerIata,
      logo_symbol_url: ownerLogoUrl,
      logo_url: ownerLogoUrl,
    },
    currency: 'USD',
    trip_type: itinerary?.type || (slices.length > 1 ? 'Round trip' : 'One way'),
    booking_token: itinerary?.booking_token,
    departure_token: itinerary?.departure_token,
    airline_logo: itinerary?.airline_logo || ownerLogoUrl,
    price_insights: itinerary?.price_insights,
  };
}

function getSerpApiItineraries(response: any) {
  return [
    ...(Array.isArray(response?.best_flights) ? response.best_flights : []),
    ...(Array.isArray(response?.other_flights) ? response.other_flights : []),
  ];
}

function mergeReturnSliceIntoOffer(outboundOffer: any, returnItinerary: any, cabinClass: string, passengers: any[]) {
  const returnOffer = normalizeSerpApiItinerary(returnItinerary, '', cabinClass, passengers);
  const returnSlice = returnOffer.slices?.[0];
  if (!returnSlice) return outboundOffer;

  return {
    ...outboundOffer,
    slices: [outboundOffer.slices[0], returnSlice].filter(Boolean),
    total_amount: returnOffer.total_amount || outboundOffer.total_amount,
    display_price: returnOffer.display_price || outboundOffer.display_price,
    booking_token: returnOffer.booking_token || outboundOffer.booking_token,
    return_departure_token: returnOffer.departure_token,
    return_owner: returnOffer.owner,
  };
}

function formatIsoDurationForLog(duration: string) {
  const hours = Number(String(duration || '').match(/(\d+)H/)?.[1] || 0);
  const minutes = Number(String(duration || '').match(/(\d+)M/)?.[1] || 0);
  const days = Number(String(duration || '').match(/(\d+)D/)?.[1] || 0);
  const totalMinutes = days * 1440 + hours * 60 + minutes;
  return totalMinutes > 0 ? formatFlightDuration(totalMinutes) : 'duration N/A';
}

function logNormalizedFlightCard(flight: any, flightIndex: number) {
  const slices = Array.isArray(flight?.slices) ? flight.slices : [];
  const segmentCount = slices.reduce((total: number, slice: any) => total + (Array.isArray(slice.segments) ? slice.segments.length : 0), 0);
  const priceLabel = flight.total_amount ? `$${flight.total_amount}` : 'price unavailable';

  console.log(
    `  ${flightIndex + 1}. ${flight.owner?.name || 'Unknown airline'} | ${priceLabel} | ${flight.trip_type || 'unknown trip'} | ${segmentCount} segment(s) | ${slices.length} slice(s)`
  );

  slices.forEach((slice: any, sliceIndex: number) => {
    const segments = Array.isArray(slice?.segments) ? slice.segments : [];
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    const legLabel = slices.length > 1 ? (sliceIndex === 0 ? 'Outbound' : 'Return') : 'One-way';
    const originCode = firstSegment?.origin?.iata_code || 'DEP';
    const destinationCode = lastSegment?.destination?.iata_code || 'ARR';
    const departureTime = firstSegment?.departing_at ? formatFlightTime(firstSegment.departing_at) : 'N/A';
    const arrivalTime = lastSegment?.arriving_at ? formatFlightTime(lastSegment.arriving_at) : 'N/A';
    const stopLabel = segments.length <= 1 ? 'Nonstop' : `${segments.length - 1} transfer${segments.length === 2 ? '' : 's'}`;

    console.log(`     ${legLabel}: ${originCode} -> ${destinationCode} | ${departureTime} -> ${arrivalTime} | ${formatIsoDurationForLog(slice?.duration)} | ${stopLabel}`);

    segments.forEach((segment: any, segmentIndex: number) => {
      const carrier = segment?.marketing_carrier?.name || 'Airline';
      const flightNumber = segment?.marketing_carrier_flight_number || 'N/A';
      const segmentRoute = `${segment?.origin?.iata_code || 'DEP'} -> ${segment?.destination?.iata_code || 'ARR'}`;
      const amenities = [
        ...(Array.isArray(segment?.amenities) ? segment.amenities : []),
        ...(Array.isArray(segment?.airfare_details) ? segment.airfare_details : []),
      ].filter(Boolean).join(' | ') || 'N/A';

      console.log(
        `       Segment ${segmentIndex + 1}: ${carrier} ${flightNumber} | ${segmentRoute} | ${formatIsoDurationForLog(segment?.duration)} | ${segment?.aircraft_name || 'Aircraft TBA'} | ${segment?.cabin_class || 'economy'} | Legroom: ${segment?.legroom || 'N/A'} | Carbon: ${segment?.carbon_emissions || 'N/A'}`
      );
      console.log(`         Amenities: ${amenities}`);
    });

    const layovers = Array.isArray(slice?.layovers) ? slice.layovers : [];
    layovers.forEach((layover: any, layoverIndex: number) => {
      console.log(
        `       Transfer ${layoverIndex + 1}: ${layover.airportName || 'Layover airport'}${layover.airportCode ? ` (${layover.airportCode})` : ''} for ${layover.duration || formatFlightDuration(layover.durationMinutes || 0)}${layover.overnight ? ' | overnight' : ''}`
      );
    });
  });
}

function selectOutboundByCarrier(outboundFlights: any[]) {
  const carrierMap = new Map<string, any>();
  const pricedFirst = [...outboundFlights].sort((a: any, b: any) => {
    const aPrice = parseFloat(a.total_amount);
    const bPrice = parseFloat(b.total_amount);
    const safeA = Number.isFinite(aPrice) && aPrice > 0 ? aPrice : Number.POSITIVE_INFINITY;
    const safeB = Number.isFinite(bPrice) && bPrice > 0 ? bPrice : Number.POSITIVE_INFINITY;
    return safeA - safeB;
  });

  for (const offer of pricedFirst) {
    if (!offer?.departure_token) continue;
    const firstSegment = offer?.slices?.[0]?.segments?.[0];
    const carrierKey = firstSegment?.marketing_carrier?.iata_code || offer?.owner?.name || offer.id;
    if (!carrierMap.has(carrierKey)) carrierMap.set(carrierKey, offer);
  }

  return Array.from(carrierMap.values());
}

function logSerpApiAirports(airports: any[]) {
  if (!Array.isArray(airports) || airports.length === 0) {
    console.log('✈️ SerpApi airports: none returned');
    return;
  }

  console.log(`✈️ SerpApi airports: ${airports.length} route group(s)`);
  airports.forEach((group: any, groupIndex: number) => {
    const departureAirports = Array.isArray(group?.departure) ? group.departure : [];
    const arrivalAirports = Array.isArray(group?.arrival) ? group.arrival : [];

    console.log(`  Route group ${groupIndex + 1}: ${departureAirports.length} departure option(s), ${arrivalAirports.length} arrival option(s)`);

    departureAirports.forEach((airport: any, airportIndex: number) => {
      console.log(
        `    DEP ${airportIndex + 1}: ${airport?.airport?.id || 'N/A'} | ${airport?.airport?.name || 'N/A'} | ${airport?.city || 'N/A'}, ${airport?.country || 'N/A'} (${airport?.country_code || 'N/A'})`
      );
    });

    arrivalAirports.forEach((airport: any, airportIndex: number) => {
      console.log(
        `    ARR ${airportIndex + 1}: ${airport?.airport?.id || 'N/A'} | ${airport?.airport?.name || 'N/A'} | ${airport?.city || 'N/A'}, ${airport?.country || 'N/A'} (${airport?.country_code || 'N/A'})`
      );
    });
  });
}

function extractArrivalAirportMetadata(airports: any[], destinationIata: string) {
  const routeGroups = Array.isArray(airports) ? airports : [];
  for (const group of routeGroups) {
    const arrivals = Array.isArray(group?.arrival) ? group.arrival : [];
    const exact = arrivals.find((arrival: any) => arrival?.airport?.id === destinationIata);
    const arrival = exact || arrivals[0];
    if (arrival?.airport) {
      return {
        iata: arrival.airport.id || destinationIata,
        airportName: arrival.airport.name || `${destinationIata} Airport`,
        city: arrival.city || destinationIata,
        country: arrival.country || '',
        countryCode: arrival.country_code || '',
      };
    }
  }
  return null;
}

function logSerpApiItineraries(label: string, itineraries: any[], returnDate: string) {
  const safeItineraries = Array.isArray(itineraries) ? itineraries : [];
  console.log(`✈️ SerpApi ${label}: ${safeItineraries.length} itinerary result(s)`);

  safeItineraries.forEach((itinerary: any, itineraryIndex: number) => {
    const segmentGroups = splitSerpApiSegmentsByTrip(itinerary, returnDate);
    const layovers = Array.isArray(itinerary?.layovers) ? itinerary.layovers : [];
    const totalDurationMinutes = Number(itinerary?.total_duration || 0);

    console.log(`  ${itineraryIndex + 1}. ${itinerary?.airline || itinerary?.flights?.[0]?.airline || 'Airline'} | ${itinerary?.type || 'N/A'} | $${itinerary?.price ?? 'N/A'} | total ${formatFlightDuration(totalDurationMinutes)}`);

    segmentGroups.forEach((segments, groupIndex) => {
      const isReturn = segmentGroups.length > 1 && groupIndex === 1;
      const groupLabel = segmentGroups.length > 1 ? (isReturn ? 'Return leg' : 'Outbound leg') : 'Trip leg';
      console.log(`     ${groupLabel}:`);

      segments.forEach((segment: any, segmentIndex: number) => {
        logSerpApiSegment(segment, segmentIndex);

        const nextSegment = segments[segmentIndex + 1];
        if (nextSegment) {
          const layover = layovers[segmentIndex];
          if (layover) {
            logSerpApiLayover(layover, segmentIndex);
          } else {
            const arrivalTime = new Date(toIsoTimeString(segment?.arrival_airport?.time || '')).getTime();
            const nextDepartureTime = new Date(toIsoTimeString(nextSegment?.departure_airport?.time || '')).getTime();
            if (!Number.isNaN(arrivalTime) && !Number.isNaN(nextDepartureTime) && nextDepartureTime >= arrivalTime) {
              const gapMinutes = Math.round((nextDepartureTime - arrivalTime) / 60000);
              console.log(
                `        Layover ${segmentIndex + 1}: ${segment?.arrival_airport?.name || 'Connecting airport'} for ${formatFlightDuration(gapMinutes)}`
              );
            }
          }
        }
      });
    });
  });
}

function formatHotelPrice(priceValue: any): string {
  if (typeof priceValue === 'number') return `$${priceValue}`;
  if (typeof priceValue === 'string' && priceValue.trim()) return priceValue;
  return 'N/A';
}

function formatStarLabel(stars: any): string {
  if (typeof stars === 'number') return `${stars}-star hotel`;
  if (typeof stars === 'string' && stars.trim()) return stars;
  return 'N/A';
}

function normalizeHotelTransportation(transportations: any[]) {
  return Array.isArray(transportations) ? transportations : [];
}

function logHotelProperty(property: any, index: number) {
  const images = Array.isArray(property?.images) ? property.images : [];
  const nearbyPlaces = Array.isArray(property?.nearby_places) ? property.nearby_places : [];
  const amenities = Array.isArray(property?.amenities) ? property.amenities : [];
  const ratings = Array.isArray(property?.ratings) ? property.ratings : [];
  const reviewsBreakdown = Array.isArray(property?.reviews_breakdown) ? property.reviews_breakdown : [];
  const essentialInfo = Array.isArray(property?.essential_info) ? property.essential_info : [];
  const excludedAmenities = Array.isArray(property?.excluded_amenities) ? property.excluded_amenities : [];
  const dealText = property?.deal_description || property?.deal || '';
  const ratePerNight = property?.rate_per_night?.extracted_lowest ?? property?.rate_per_night?.lowest ?? property?.extracted_price ?? property?.price;
  const totalRate = property?.total_rate?.extracted_lowest ?? property?.total_rate?.lowest ?? '';
  const propertyType = property?.type || 'hotel';
  const hotelClass = property?.hotel_class || formatStarLabel(property?.extracted_hotel_class);
  const overallRating = property?.overall_rating ?? 'N/A';
  const reviewCount = property?.reviews ?? 'N/A';
  const locationRating = property?.location_rating ?? 'N/A';

  console.log(`  ${index + 1}. ${property?.name || 'Unnamed hotel'}`);
  console.log(`     Type: ${propertyType} | Class: ${hotelClass} | Rating: ${overallRating} | Reviews: ${reviewCount} | Location rating: ${locationRating}`);
  console.log(`     Price: ${formatHotelPrice(ratePerNight)}/night | Total stay: ${formatHotelPrice(totalRate)}`);

  if (property?.description) {
    console.log(`     Description: ${property.description}`);
  }

  if (property?.address) {
    console.log(`     Address: ${property.address}`);
  }

  if (property?.link) {
    console.log(`     Website: ${property.link}`);
  }

  if (property?.serpapi_property_details_link) {
    console.log(`     SerpApi details: ${property.serpapi_property_details_link}`);
  }

  if (property?.property_token) {
    console.log(`     Property token: ${property.property_token}`);
  }

  if (property?.check_in_time || property?.check_out_time) {
    console.log(`     Check-in/out: ${property?.check_in_time || 'N/A'} / ${property?.check_out_time || 'N/A'}`);
  }

  if (property?.gps_coordinates?.latitude && property?.gps_coordinates?.longitude) {
    console.log(`     GPS: ${property.gps_coordinates.latitude}, ${property.gps_coordinates.longitude}`);
  }

  if (dealText) {
    console.log(`     Deal: ${dealText}`);
  }

  if (images.length > 0) {
    console.log(`     Photos: ${images.length} image(s)`);
    images.slice(0, 5).forEach((image: any, imageIndex: number) => {
      console.log(`       Photo ${imageIndex + 1}: ${image?.thumbnail || image?.original_image || 'N/A'}`);
    });
  }

  if (amenities.length > 0) {
    console.log(`     Amenities: ${amenities.join(', ')}`);
  }

  if (excludedAmenities.length > 0) {
    console.log(`     Excluded amenities: ${excludedAmenities.join(', ')}`);
  }

  if (essentialInfo.length > 0) {
    console.log(`     Essential info: ${essentialInfo.join(' | ')}`);
  }

  if (nearbyPlaces.length > 0) {
    console.log('     Nearby places:');
    nearbyPlaces.slice(0, 5).forEach((place: any, placeIndex: number) => {
      const transportations = normalizeHotelTransportation(place?.transportations);
      console.log(`       ${placeIndex + 1}. ${place?.name || 'Nearby place'}`);
      transportations.forEach((transportation: any) => {
        console.log(`          ${transportation?.type || 'Transport'}: ${transportation?.duration || 'N/A'}`);
      });
    });
  }

  if (ratings.length > 0) {
    console.log('     Rating breakdown:');
    ratings.forEach((rating: any) => {
      console.log(`       ${rating?.stars || '?'} stars: ${rating?.count ?? 'N/A'}`);
    });
  }

  if (reviewsBreakdown.length > 0) {
    console.log('     Review breakdown:');
    reviewsBreakdown.slice(0, 8).forEach((breakdown: any) => {
      console.log(
        `       ${breakdown?.name || 'Category'} | positive ${breakdown?.positive ?? 'N/A'} | negative ${breakdown?.negative ?? 'N/A'} | neutral ${breakdown?.neutral ?? 'N/A'}`
      );
    });
  }
}

function mapSerpApiHotelToResult(property: any, fallbackIndex: number, destinationCity: string) {
  const extractedPrice = property?.rate_per_night?.extracted_lowest ?? property?.extracted_price ?? property?.price ?? 0;
  const totalRate = property?.total_rate?.extracted_lowest ?? extractedPrice;
  const starRating = property?.extracted_hotel_class || property?.hotel_class || 3;
  const hotelClass = formatStarLabel(property?.hotel_class || (typeof starRating === 'number' ? `${starRating}-star hotel` : ''));
  const amenities = Array.isArray(property?.amenities) ? property.amenities : [];
  const nearbyPlaces = Array.isArray(property?.nearby_places) ? property.nearby_places : [];
  const images = Array.isArray(property?.images) ? property.images : [];

  return {
    id: property?.property_token || property?.serpapi_property_details_link || `serp-h-${fallbackIndex}`,
    type: property?.type || 'hotel',
    name: property?.name || `Hotel ${fallbackIndex + 1}`,
    price: Number(extractedPrice) || 0,
    totalPrice: Number(totalRate) || Number(extractedPrice) || 0,
    rating: Number(starRating) || 3,
    overallRating: property?.overall_rating ?? null,
    reviews: property?.reviews ?? null,
    description: property?.description || `Real-time hotel listing in ${destinationCity}.`,
    location: property?.address || destinationCity,
    amenities,
    nearbyPlaces,
    images,
    lat: property?.gps_coordinates?.latitude || null,
    lon: property?.gps_coordinates?.longitude || null,
    source: 'serpapi',
    verified: true,
    hotelClass,
    deal: property?.deal_description || property?.deal || '',
    address: property?.address || '',
    website: property?.link || '',
    propertyToken: property?.property_token || '',
    serpapiPropertyDetailsLink: property?.serpapi_property_details_link || '',
    checkInTime: property?.check_in_time || '',
    checkOutTime: property?.check_out_time || '',
    locationRating: property?.location_rating ?? null,
    reviewBreakdown: Array.isArray(property?.reviews_breakdown) ? property.reviews_breakdown : [],
    excludedAmenities: Array.isArray(property?.excluded_amenities) ? property.excluded_amenities : [],
    essentialInfo: Array.isArray(property?.essential_info) ? property.essential_info : [],
    gpsCoordinates: property?.gps_coordinates || null,
    raw: property,
  };
}

// ──────────────────────────────────────────────────────────────
// Main API Handler
// ──────────────────────────────────────────────────────────────

function isHotelInDestination(
  property: any,
  destinationCity: string,
  destinationCountry: string,
  destinationCode: string,
  destLat: string,
  destLon: string
) {
  const lat = property?.gps_coordinates?.latitude;
  const lon = property?.gps_coordinates?.longitude;

  if (lat !== undefined && lon !== undefined && destLat && destLon) {
    const distanceKm = haversineDistance(destLat, destLon, String(lat), String(lon));
    const MAX_HOTEL_DISTANCE_KM = 80;
    if (distanceKm <= MAX_HOTEL_DISTANCE_KM) return true;
    console.log(
      `  🏨 Rejected hotel outside destination radius: "${property?.name || 'Unnamed'}" (${distanceKm.toFixed(0)} km from ${destinationCode})`
    );
    return false;
  }

  const haystack = [
    property?.name,
    property?.address,
    property?.description,
    property?.location,
  ].filter(Boolean).join(' ').toLowerCase();

  const city = destinationCity.toLowerCase();
  const country = destinationCountry.toLowerCase();
  const code = destinationCode.toLowerCase();
  const keep =
    (city.length > 2 && haystack.includes(city)) ||
    (country.length > 2 && haystack.includes(country)) ||
    (code.length > 2 && haystack.includes(code));

  if (!keep) {
    console.log(`  🏨 Rejected hotel without destination match or GPS: "${property?.name || 'Unnamed'}"`);
  }
  return keep;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      origin, destination, tripType, departureDate, returnDate,
      adults, children, cabinClass, baggageCount, directOnly,
      budgetMode, totalBudget, flightBudget, hotelBudget, transportBudget, dailyExpenseBudget,
      hotelStars, hotelRooms, hotelBeds, hotelAmenities, nights,
      includeFlight = true, includeHotel = true, includeTransport, transportTypes, transportPriority,
      vibes,
    } = body;

    // ═══════════ STEP 1: USER INPUT ═══════════
    console.log('\n\n═══════════ STEP 1: USER INPUT RECEIVED ═══════════');
    console.log('🧳 Trip type:', tripType);
    console.log('✈️ Origin:', origin);
    console.log('🏁 Destination:', destination);
    console.log('📅 Departure date:', departureDate);
    console.log('📅 Return date:', returnDate);
    console.log('👥 Travelers:', adults, 'adults,', children, 'children');
    console.log('💺 Cabin class:', cabinClass);
    console.log('💰 Budget mode:', budgetMode, '| Total:', totalBudget, '| Flight:', flightBudget, '| Hotel:', hotelBudget, '| Transport:', transportBudget, '| Daily:', dailyExpenseBudget);
    console.log('⭐ Hotel stars:', hotelStars);
    console.log('🛏️ Rooms:', hotelRooms, '| Beds per room:', hotelBeds);
    console.log('🏨 Hotel amenities:', JSON.stringify(hotelAmenities));
    console.log('🚗 Include transport:', includeTransport, '| Types:', JSON.stringify(transportTypes));
    console.log('🎯 Transport priority:', transportPriority);
    console.log('🎨 Vibes:', JSON.stringify(vibes), '| Type:', typeof vibes, '| Is array:', Array.isArray(vibes), '| Length:', Array.isArray(vibes) ? vibes.length : 'N/A');
    console.log('═══════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 1: Resolve destination labels without calling a non-Google flight API
    // ────────────────────────────────────────────────────────
    let destinationCity = destination;
    let destinationCountry = '';
    let airportName = `${destination} Airport`;
    let countryCode = '';

    // ────────────────────────────────────────────────────────
    // STEP 2: Geocode the EXACT destination (airport or city)
    // ────────────────────────────────────────────────────────
    // Use an airport label first because the user selected an airport code.
    let airportGeo = await geocodeCity(airportName, destinationCountry);
    let cityGeo = await geocodeCity(destinationCity, destinationCountry);
    // Prefer airport coordinates since the user selected an airport code
    let geo = airportGeo || cityGeo;
    let geoLat = geo?.lat || '';
    let geoLon = geo?.lon || '';
    // Label used in distance strings — shows the IATA code for clarity
    const destinationLabel = destination; // e.g. "MXP", "CDG", "JFK"

    // ═══════════ STEP 2: DESTINATION RESOLUTION ═══════════
    console.log('═══════════ STEP 2: DESTINATION RESOLUTION ═══════════');
    console.log('📍 Destination resolved:', destinationCity, '|', airportName, '|', destinationCountry);
    console.log('🌍 Destination coordinates:', geoLat, geoLon, '| Source:', airportGeo ? 'AIRPORT geocode' : 'CITY geocode');
    console.log('🌍 Country code for API calls:', countryCode);
    console.log('🌍 Full display name:', geo?.displayName || 'N/A');
    console.log('═══════════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 3: Search flights via SerpApi Google Flights
    // ────────────────────────────────────────────────────────
    let flights: any[] = [];
    if (includeFlight) {
      const passengers = [
        ...Array(adults).fill(null).map(() => ({ type: 'adult' as const })),
        ...Array(children).fill(null).map(() => ({ type: 'child' as const })),
      ];

      try {
        const serpApiResults = await searchGoogleFlights({
          origin,
          destination,
          departureDate,
          returnDate,
          tripType,
          adults,
          children,
          cabinClass,
          directOnly,
          baggageCount,
        });

        console.log('✈️ SerpApi raw response keys:', Object.keys(serpApiResults || {}));
        logSerpApiAirports(serpApiResults?.airports || []);

        const arrivalMeta = extractArrivalAirportMetadata(serpApiResults?.airports || [], destination);
        if (arrivalMeta) {
          const changed =
            arrivalMeta.city !== destinationCity ||
            arrivalMeta.country !== destinationCountry ||
            arrivalMeta.airportName !== airportName ||
            arrivalMeta.countryCode !== countryCode;

          destinationCity = arrivalMeta.city || destinationCity;
          destinationCountry = arrivalMeta.country || destinationCountry;
          airportName = arrivalMeta.airportName || airportName;
          countryCode = arrivalMeta.countryCode || countryCode;

          if (changed) {
            airportGeo = await geocodeCity(airportName, destinationCountry);
            cityGeo = await geocodeCity(destinationCity, destinationCountry);
            geo = airportGeo || cityGeo;
            geoLat = geo?.lat || '';
            geoLon = geo?.lon || '';
            console.log('📍 Destination refined from flight metadata:', destinationCity, '|', airportName, '|', destinationCountry, '|', countryCode);
            console.log('🌍 Refined destination coordinates:', geoLat, geoLon, '| Source:', airportGeo ? 'AIRPORT geocode' : 'CITY geocode');
          }
        }

        const itineraries = getSerpApiItineraries(serpApiResults);

        logSerpApiItineraries('best_flights + other_flights', itineraries, returnDate || '');

        flights = itineraries
          .map((itinerary: any) => normalizeSerpApiItinerary(itinerary, returnDate || '', cabinClass, passengers))
          .filter((offer: any) => offer.slices.length > 0);

        if (tripType === 'round_trip' && returnDate) {
          console.log('✈️ Fetching return legs via SerpApi departure_token for round-trip results...');
          const outboundFlights = flights;
          const returnLookupOffers = selectOutboundByCarrier(outboundFlights);
          console.log(`  ✈️ Return lookup outbound carriers: ${returnLookupOffers.length}`);
          flights = returnLookupOffers.length > 0 ? await Promise.all(returnLookupOffers.map(async (offer: any) => {
            if (!offer.departure_token) {
              console.log(`  ✈️ Return leg skipped for ${offer.owner?.name || 'flight'}: missing departure_token`);
              return offer;
            }

            try {
              const returnResults = await searchGoogleFlights({
                origin,
                destination,
                departureDate,
                returnDate,
                tripType,
                adults,
                children,
                cabinClass,
                directOnly,
                baggageCount,
                departureToken: offer.departure_token,
              });
              const returnItineraries = getSerpApiItineraries(returnResults);
              const mergedOffers = returnItineraries
                .map((returnItinerary: any) => mergeReturnSliceIntoOffer(offer, returnItinerary, cabinClass, passengers))
                .filter((mergedOffer: any) => mergedOffer.slices?.length > 1)
                .slice(0, 6);
              if (mergedOffers.length === 0) {
                console.log(`  ✈️ Return leg unavailable for ${offer.owner?.name || 'flight'}`);
                return [offer];
              }
              console.log(`  ✈️ Built ${mergedOffers.length} round-trip option(s) from one outbound and one return request`);
              const mergedOffer = mergedOffers[0];
              const returnSegments = mergedOffer.slices?.[1]?.segments || [];
              const firstReturn = returnSegments[0];
              const lastReturn = returnSegments[returnSegments.length - 1];
              console.log(
                `  ✈️ Return leg attached: ${firstReturn?.origin?.iata_code || 'RET'} → ${lastReturn?.destination?.iata_code || 'ARR'} | ${mergedOffer.slices?.[1]?.duration || 'duration N/A'}`
              );
              return mergedOffers;
            } catch (returnErr: any) {
              console.warn(`  ✈️ Return leg lookup failed for ${offer.owner?.name || 'flight'}:`, returnErr.message);
              return [offer];
            }
          })).then((items: any[]) => items.flat()) : outboundFlights;
        }

        if (directOnly) {
          flights = flights.filter(f => f.slices.every((s: any) => s.segments.length === 1));
        }

        console.log('✈️ Normalized SerpApi flights returned to handler:', flights.length);
        flights.forEach((flight: any, flightIndex: number) => logNormalizedFlightCard(flight, flightIndex));
      } catch (flightErr: any) {
        console.error('SerpApi flight search error:', flightErr.message);
      }
    } else {
      console.log('✈️ Flights SKIPPED — user toggled off includeFlight');
    }

    // ═══════════ STEP 3: FLIGHT SEARCH ═══════════
    console.log('═══════════ STEP 3: FLIGHT SEARCH ═══════════');
    console.log('✈️ Flights API response — total results:', flights.length);
    if (flights.length > 0) {
      const prices = flights
        .map((f: any) => parseFloat(f.total_amount))
        .filter((price: number) => Number.isFinite(price) && price > 0);
      if (prices.length > 0) {
        console.log('✈️ Price range: $' + Math.min(...prices).toFixed(0) + ' to $' + Math.max(...prices).toFixed(0));
      } else {
        console.log('✈️ Price range: unavailable');
      }
      console.log('✈️ First flight:', flights[0]?.owner?.name || 'unknown airline', '| $' + flights[0]?.total_amount);
      console.log('✈️ All normalized flights logged above from SerpApi raw response');
    } else {
      console.log('✈️ No flights found');
    }
    console.log('════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 4: Fetch REAL hotels from SerpApi Google Hotels
    //         Anchored to the destination city and travel dates
    // ────────────────────────────────────────────────────────
    let hotels: any[] = [];
    if (includeHotel) {
      try {
        const hotelQuery = [destinationCity, destinationCountry, 'hotels'].filter(Boolean).join(' ');
        const checkInDate = departureDate;
        const checkOutDate = (() => {
          const outDate = new Date(departureDate);
          const hotelNights = typeof nights === 'number' && nights > 0 ? nights : 0;
          outDate.setDate(outDate.getDate() + hotelNights);
          return outDate.toISOString().split('T')[0];
        })();

        console.log(`\n🏨 SERPAPI HOTEL SEARCH — query="${hotelQuery}" | ${checkInDate} → ${checkOutDate} | travelers: ${adults} adult(s), ${children} child(ren)`);

        const serpApiHotelResults = await searchGoogleHotels({
          query: hotelQuery,
          checkInDate,
          checkOutDate,
          adults,
          children,
          countryCode: countryCode || 'us',
        });

        console.log('🏨 SerpApi hotel raw response keys:', Object.keys(serpApiHotelResults || {}));
        console.log('🏨 SerpApi hotel status:', serpApiHotelResults?.search_metadata?.status || 'N/A');
        console.log('🏨 SerpApi total results:', serpApiHotelResults?.search_information?.total_results ?? 'N/A');
        if (serpApiHotelResults?.search_information?.hotels_results_state) {
          console.log('🏨 Results state:', serpApiHotelResults.search_information.hotels_results_state);
        }

        const hotelProperties = Array.isArray(serpApiHotelResults?.properties) ? serpApiHotelResults.properties : [];
        const hotelAds = Array.isArray(serpApiHotelResults?.ads) ? serpApiHotelResults.ads : [];
        const allHotelResults = [...hotelProperties, ...hotelAds].slice(0, 20);

        console.log(`🏨 SerpApi properties/ads returned: ${allHotelResults.length} result(s)`);

        hotels = allHotelResults
          .filter((property: any) => property?.name)
          .filter((property: any) => isHotelInDestination(property, destinationCity, destinationCountry, destination, geoLat, geoLon))
          .filter((property: any) => {
            const classValue = property?.extracted_hotel_class || property?.hotel_class;
            if (!hotelStars) return true;
            if (typeof classValue === 'number') return classValue >= hotelStars;
            if (typeof classValue === 'string') {
              const match = classValue.match(/(\d)/);
              return match ? Number(match[1]) >= hotelStars : true;
            }
            return true;
          })
          .map((property: any, idx: number) => mapSerpApiHotelToResult(property, idx, destinationCity))
          .slice(0, 10);

        if (hotelAmenities && hotelAmenities.length > 0) {
          hotels.sort((a: any, b: any) => {
            const aMatch = hotelAmenities.filter((am: string) => a.amenities.some((item: string) => item.toLowerCase().includes(am.toLowerCase()))).length;
            const bMatch = hotelAmenities.filter((am: string) => b.amenities.some((item: string) => item.toLowerCase().includes(am.toLowerCase()))).length;
            return bMatch - aMatch;
          });
        }

        if (hotels.length > 0) {
          console.log(`🏨 SERPAPI HOTEL CARD LOGS — ${hotels.length} hotel(s)`);
          hotels.forEach((hotel: any, index: number) => logHotelProperty(hotel.raw || hotel, index));
        } else {
          console.log('🏨 No SerpApi hotel results matched the current filters');
        }
      } catch (hotelErr: any) {
        console.error('SerpApi hotel search error:', hotelErr.message);
      }

      if (hotels.length === 0) {
        hotels = [
          {
            id: 'h1',
            type: 'hotel',
            name: `Grand ${destinationCity} Resort`,
            price: 450,
            totalPrice: 450,
            rating: 5,
            description: `Premium luxury hotel in the heart of ${destinationCity}. Includes complimentary breakfast, high-speed WiFi, pool, and luxury toiletries.`,
            location: `${destinationCity} City Center`,
            amenities: ['Breakfast', 'WiFi', 'Pool', 'Toiletries', 'Spa', 'Gym'],
            verified: false,
            source: 'fallback',
          },
          {
            id: 'h2',
            type: 'hotel',
            name: `${destinationCity} Metropolitan Suites`,
            price: 280,
            totalPrice: 280,
            rating: 4,
            description: `Modern downtown hotel in ${destinationCity} with panoramic views. Features high-speed WiFi, in-room coffee, and fitness center.`,
            location: `Downtown ${destinationCity}`,
            amenities: ['WiFi', 'Coffee', 'Gym', 'Breakfast'],
            verified: false,
            source: 'fallback',
          },
          {
            id: 'h3',
            type: 'hotel',
            name: `${destinationCity} Boutique Hotel`,
            price: 190,
            totalPrice: 190,
            rating: 3,
            description: `Charming boutique hotel in ${destinationCity}: free WiFi, in-room coffee, and complimentary breakfast.`,
            location: `${destinationCity} Historic District`,
            amenities: ['WiFi', 'Coffee', 'Breakfast'],
            verified: false,
            source: 'fallback',
          },
        ].filter(h => h.rating >= hotelStars);
      }
    } else {
      console.log('🏨 Hotels SKIPPED — user toggled off includeHotel');
    }

    // ═══════════ STEP 4: HOTEL SEARCH ═══════════
    console.log('═══════════ STEP 4: HOTEL SEARCH ═══════════');
    console.log('🏨 Hotels found:', hotels.length, '| Source:', hotels.length > 0 ? hotels[0].source : 'none');
    hotels.forEach((h: any, i: number) => {
      console.log(`   ${i + 1}. "${h.name}" | ${h.rating}⭐ | $${h.price}/night | ${h.location}`);
      if (h.address) console.log(`      Address: ${h.address}`);
      if (h.hotelClass) console.log(`      Class: ${h.hotelClass}`);
      if (h.overallRating !== null && h.overallRating !== undefined) console.log(`      Rating: ${h.overallRating}`);
      if (h.reviews !== null && h.reviews !== undefined) console.log(`      Reviews: ${h.reviews}`);
      if (h.deal) console.log(`      Deal: ${h.deal}`);
      if (h.locationRating !== null && h.locationRating !== undefined) console.log(`      Location rating: ${h.locationRating}`);
      if (h.checkInTime || h.checkOutTime) console.log(`      Check-in/out: ${h.checkInTime || 'N/A'} / ${h.checkOutTime || 'N/A'}`);
      if (Array.isArray(h.amenities) && h.amenities.length > 0) console.log(`      Amenities: ${h.amenities.join(', ')}`);
      if (Array.isArray(h.nearbyPlaces) && h.nearbyPlaces.length > 0) {
        console.log('      Nearby places:');
        h.nearbyPlaces.slice(0, 4).forEach((place: any, placeIndex: number) => {
          console.log(`        ${placeIndex + 1}. ${place?.name || 'Nearby place'}`);
          normalizeHotelTransportation(place?.transportations).forEach((transportation: any) => {
            console.log(`           ${transportation?.type || 'Transport'}: ${transportation?.duration || 'N/A'}`);
          });
        });
      }
      if (Array.isArray(h.images) && h.images.length > 0) {
        console.log(`      Photos: ${h.images.length}`);
        h.images.slice(0, 4).forEach((image: any, imageIndex: number) => {
          console.log(`        Photo ${imageIndex + 1}: ${image?.thumbnail || image?.original_image || 'N/A'}`);
        });
      }
    });
    console.log('════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 5: Fetch nearby attractions via LocationIQ
    //         Anchored to CITY CENTER coordinates
    // ────────────────────────────────────────────────────────
    let nearbyAttractions: any[] = [];
    if (geoLat && geoLon) {
      const tourism = await findNearby(geoLat, geoLon, 'tourism', 20000, 15);

      // Blocklist: filter out non-tourist utility locations
      // Blocklist: filter out non-tourist utility locations AND accommodations
      const BLOCKED_TYPES = ['atm', 'bank', 'pharmacy', 'fuel', 'post_office', 'police', 'fire_station', 'hospital', 'clinic', 'dentist', 'veterinary', 'car_wash', 'car_repair', 'parking', 'bus_stop', 'taxi', 'hotel', 'motel', 'hostel', 'guest_house', 'chalet', 'accommodation'];
      const BLOCKED_NAMES = ['atm', 'bancomat', 'cash point', 'cash machine', 'parking', 'bus stop', 'taxi stand', 'gas station', 'petrol', 'hotel', 'motel', 'hostel', 'b&b', 'bed and breakfast'];

      const filtered = tourism
        .filter((p: any) => {
          if (!p.display_name) return false;
          const type = (p.type || '').toLowerCase();
          const name = (p.display_name?.split(',')[0]?.trim() || '').toLowerCase();
          // Reject if type matches blocklist
          if (BLOCKED_TYPES.some(bt => type.includes(bt))) return false;
          // Reject if name matches blocklist
          if (BLOCKED_NAMES.some(bn => name.includes(bn))) return false;
          return true;
        });

      // Deduplicate by name (case-insensitive)
      const seen = new Set<string>();
      nearbyAttractions = filtered
        .map((p: any) => {
          const name = p.display_name?.split(',')[0]?.trim() || 'Local Attraction';
          const distVal = haversineDistance(geoLat, geoLon, p.lat, p.lon);
          const distanceKm = distVal > 0 ? (distVal).toFixed(1) : '';
          return {
            name,
            distance: distanceKm ? `${distanceKm} km from ${destinationLabel}` : `Near ${destinationLabel}`,
            type: p.type || 'attraction',
            lat: p.lat,
            lon: p.lon,
          };
        })
        .filter(a => {
          const key = a.name.toLowerCase().trim();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, 10);
    }

    // ═══════════ STEP 5: LOCATIONIQ POI FETCH ═══════════
    console.log('═══════════ STEP 5: LOCATIONIQ POI FETCH ═══════════');
    console.log('🔍 LocationIQ search coords:', geoLat, geoLon);
    console.log('📍 POIs after filtering & dedup:', nearbyAttractions.length);
    nearbyAttractions.forEach((a: any, i: number) => console.log(`   ${i + 1}. "${a.name}" (type: ${a.type}) — ${a.distance}`));
    console.log('═══════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 6: Generate mock transport data
    // ────────────────────────────────────────────────────────
    let transport: any[] = [];
    if (includeTransport) {
      const allTransport = [
        { id: 't1', type: 'bus', operator: 'Elite Express', price: 85, duration: '1h 30m', class: 'First Class', amenities: ['WiFi', 'Reclining Seats', 'Power Outlets', 'Refreshments'], location: `${destinationCity} Central Station`, transportType: 'private_car' },
        { id: 't2', type: 'bus', operator: 'Royal Coach', price: 45, duration: '2h 15m', class: 'Business', amenities: ['WiFi', 'Snacks', 'Extra Legroom'], location: `${destinationCity} North Terminal`, transportType: 'shared_shuttle' },
        { id: 't3', type: 'bus', operator: 'Skyline Transit', price: 25, duration: '3h 00m', class: 'Standard', amenities: ['WiFi', 'USB Charging'], location: `${destinationCity} Downtown Hub`, transportType: 'bus' },
        { id: 't4', type: 'bus', operator: 'Metro Rail Express', price: 35, duration: '1h 45m', class: 'Standard Plus', amenities: ['WiFi', 'Power Outlets', 'Scenic Route'], location: `${destinationCity} Rail Terminal`, transportType: 'train' },
      ];

      transport = allTransport.filter(t => transportTypes && transportTypes.includes(t.transportType));
      if (transport.length === 0) transport = allTransport.slice(0, 2);

      if (transportPriority === 'cheapest') transport.sort((a, b) => a.price - b.price);
      else if (transportPriority === 'fastest') transport.sort((a, b) => parseFloat(a.duration) - parseFloat(b.duration));
    }

    // ────────────────────────────────────────────────────────
    // STEP 7: Validate nights + compute effective budget
    //         (Budget breakdown moved to AFTER Gemini so hotel
    //          prices reflect destination-aware Gemini estimates)
    // ────────────────────────────────────────────────────────
    const effectiveBudget = budgetMode === 'total' ? totalBudget : (flightBudget + hotelBudget + transportBudget + dailyExpenseBudget);
    // Use the user-provided nights from the wizard (no hardcoded fallback)
    const tripNights = typeof nights === 'number' && nights > 0 ? nights : null;
    if (tripNights === null) {
      return NextResponse.json({ error: 'Missing or invalid nights value. Please select the number of nights in the Stay step.' }, { status: 400 });
    }

    // ────────────────────────────────────────────────────────
    // STEP 8: Call Gemini AI — with STRICT location anchoring
    // ────────────────────────────────────────────────────────
    let aiSummary = null;
    let placesToVisit: any[] = [];
    let upsellOptions: any[] = [];

    try {
      // Build context from REAL LocationIQ data
      const hasVibes = vibes && Array.isArray(vibes) && vibes.length > 0;
      const vibeLabels = hasVibes ? vibes.map((v: string) => {
        const labelMap: Record<string, string> = {
          food_drink: 'Food & Drink (restaurants, food markets, cafés, wine bars, street food tours, local eateries)',
          nature_outdoors: 'Nature & Outdoors (parks, gardens, nature reserves, hiking trails, scenic viewpoints, lakes)',
          culture_history: 'Culture & History (museums, historical sites, cultural landmarks, monuments, heritage sites)',
          shopping_exploring: 'Shopping & Exploring (markets, shopping districts, bazaars, unique local stores, flea markets)',
          nightlife_entertainment: 'Nightlife & Entertainment (bars, clubs, live music venues, theaters, entertainment districts)',
          relaxation_wellness: 'Relaxation & Wellness (spas, thermal baths, peaceful gardens, wellness centers, yoga retreats)',
          art_architecture: 'Art & Architecture (galleries, architectural landmarks, street art, design districts, art museums)',
          family_friendly: 'Family Friendly (theme parks, zoos, aquariums, interactive museums, playgrounds, family activities)',
        };
        return labelMap[v] || v;
      }).join('; ') : '';

      // When vibes are selected, COMPLETELY OMIT LocationIQ POI data to prevent Gemini from
      // picking aviation/transport museums that happen to be near the airport.
      const attractionContext = hasVibes
        ? `\n\nIMPORTANT: Ignore any nearby POI data. Use your own knowledge to suggest places in ${destinationCity} that match ONLY the user's selected vibes listed above.`
        : nearbyAttractions.length > 0
          ? `\n\nREAL VERIFIED ATTRACTIONS found via GPS within ${destinationCity} (lat: ${geoLat}, lon: ${geoLon}):\n${nearbyAttractions.map((a, i) => `${i + 1}. "${a.name}" (${a.type}) — ${a.distance}, GPS: ${a.lat},${a.lon}`).join('\n')}\n\nYou MUST use these real GPS-verified places as the primary basis for "placesToVisit". You may add 1-2 additional WELL-KNOWN landmarks that are definitely in ${destinationCity}, ${destinationCountry}, but DO NOT invent or hallucinate places.`
          : `\n\nNo GPS-verified attractions data available. For "placesToVisit", ONLY suggest well-known, real landmarks and attractions that are definitely located within ${destinationCity}, ${destinationCountry}. Do NOT suggest places from other cities or countries.`;

      console.log(`\n📍 PLACES DATA SOURCE: ${hasVibes ? 'gemini-only (LocationIQ data OMITTED because vibes are active)' : nearbyAttractions.length > 0 ? 'combined (LocationIQ POIs fed to Gemini)' : 'gemini-only (no LocationIQ data available)'}`);

      const hotelContext = hotels.length > 0
        ? `\n\nREAL HOTELS found within 20km of ${destinationLabel} (lat: ${geoLat}, lon: ${geoLon}):\n${hotels.map((h, i) => `${i + 1}. "${h.name}" — ${h.rating}-star, $${h.price}/night, located at ${h.location}`).join('\n')}`
        : '';

      const prompt = `You are an elite AI travel concierge planning a trip to ${destinationCity}, ${destinationCountry}.

CRITICAL LOCATION CONSTRAINT:
- The destination is ${destinationCity}, ${destinationCountry}
- The user is arriving at ${airportName} (${destination}), GPS coordinates: latitude ${geoLat}, longitude ${geoLon}
- Suggest places that are either:
  (a) Right near the airport in the surrounding area (e.g. Ferno, Somma Lombardo, Cardano al Campo for MXP), OR
  (b) In ${destinationCity} city center, which is accessible by train/transport from the airport
- For each place, mention in the description which area it is in and approximately how far from ${destination}
- DO NOT suggest any place that is not in ${destinationCity} or the area near ${destination}
- DO NOT hallucinate or invent fictional places

CRITICAL QUALITY RULES FOR "placesToVisit":
- Each place MUST be a genuine tourist attraction, landmark, museum, park, restaurant, or cultural experience
- DO NOT include utility locations like ATMs, banks, pharmacies, bus stops, parking lots, gas stations, or transport hubs
- DO NOT include hotels, hostels, or any type of accommodation in the Places to Visit list
- DO NOT return duplicate places — every entry in the list must have a UNIQUE name
- If the source data contains duplicates, keep only the first occurrence
${hasVibes ? `
*** MOST IMPORTANT INSTRUCTION — VIBE FILTER ***
The user has selected these travel vibes: ${vibeLabels}

You MUST return places that match ONLY these travel vibes. Here is what each vibe means:
- Food & Drink: restaurants, food markets, cafes, street food, local cuisine spots, wine bars, bakeries, food tours.
- Nature & Outdoors: parks, gardens, lakes, hiking trails, natural reserves, botanical gardens, scenic viewpoints.
- Culture & History: historical monuments, museums of art/history/culture, heritage sites, old town areas, castles, churches.
- Shopping & Exploring: shopping streets, local markets, bazaars, boutiques, flea markets, artisan shops.
- Nightlife & Entertainment: bars, clubs, live music venues, comedy clubs, rooftop bars, entertainment districts, theaters.
- Relaxation & Wellness: spas, thermal baths, hammams, wellness centers, peaceful gardens, yoga retreats.
- Art & Architecture: art galleries, architectural landmarks, street art districts, design museums, sculpture gardens.
- Family Friendly: theme parks, zoos, aquariums, interactive science museums, playgrounds, family activity centers.

Do NOT return aviation museums, transport museums, aircraft exhibitions, motorcycle museums, or any technology/vehicle museum unless the user specifically selected a matching vibe.
Do NOT return generic popular attractions that don't match the selected vibes.
Every single result MUST clearly belong to one of the selected vibes: ${vibes.join(', ')}.
If you are unsure whether a place matches, do NOT include it.
` : ''}

Trip Details:
- Route: ${origin} → ${destination} (IATA: ${destination}, City: ${destinationCity})
- Trip type: ${tripType}
- Departure: ${departureDate} ${returnDate ? '/ Return: ' + returnDate : ''}
- Travelers: ${adults} adults, ${children} children
- Cabin class: ${cabinClass}
- Budget: $${effectiveBudget.toLocaleString()} (${budgetMode === 'total' ? 'AI-allocated' : 'per-category'})
- Hotel: ${hotelStars}-star, ${hotelRooms} rooms, ${hotelBeds || 2} beds per room, amenities: ${hotelAmenities?.join(', ') || 'none specified'}
- Transport: ${includeTransport ? (transportTypes || []).map((t: string) => t.replace('_', ' ')).join(', ') + ', priority: ' + transportPriority : 'not included'}

There are ${flights.length} flight options ranging from $${flights.length > 0 ? Math.min(...flights.map((f: any) => parseFloat(f.total_amount))).toLocaleString() : '0'} to $${flights.length > 0 ? Math.max(...flights.map((f: any) => parseFloat(f.total_amount))).toLocaleString() : '0'}.
${hotelContext}${attractionContext}

Please provide a JSON response with:
1. "aiSummary" - An object with "title" (catchy trip title mentioning ${destinationCity}) and "description" (2-3 sentence persuasive trip summary about visiting ${destinationCity})
2. "placesToVisit" - Array of 12 objects (extra buffer for filtering). Each MUST be a UNIQUE real place in ${destinationCity}, ${destinationCountry}.${hasVibes ? ` CRITICAL: Each place MUST match one of these vibes: ${vibes.join(', ')}. Do NOT return aviation museums, transport museums, aircraft exhibitions, or motorcycle museums. ONLY return places matching the selected vibes.` : ''} NO duplicates allowed. Each object has "name" (the full real name of the place, minimum 4 characters), "description" (1-2 sentences about this specific place), and "estimatedCost" (estimated daily cost in USD as a number)
3. "upsellOptions" - Array of 3 objects, each with "extraAmount" (number, like 100, 250, 500), "title" (what you get), and "description" (1 sentence explanation of the upgrade)
`;

      // ═══════════ STEP 6: GEMINI PROMPT CONSTRUCTION ═══════════
      console.log('\n═══════════ STEP 6: GEMINI PROMPT CONSTRUCTION ═══════════');
      console.log('🤖 Variables injected into prompt:');
      console.log('   - Destination city:', destinationCity);
      console.log('   - Coordinates:', geoLat, geoLon);
      console.log('   - Effective budget: $' + effectiveBudget);
      console.log('   - Cabin class:', cabinClass);
      console.log('   - Hotel stars:', hotelStars);
      console.log('   - Vibes:', JSON.stringify(vibes));
      console.log('   - Has vibes:', hasVibes);
      console.log('   - Flights count passed:', flights.length);
      console.log('   - Hotels count passed:', hotels.length);
      console.log('   - POIs count passed:', nearbyAttractions.length);
      console.log('   - LocationIQ data omitted?:', hasVibes);
      console.log('🤖 FULL PROMPT SENT TO GEMINI:');
      console.log(prompt);
      console.log('══════════════════════════════════════════════════════════\n');

      const model = 'gemini-2.5-flash';
      const geminiRequestConfig = {
        model,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json' as const,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              aiSummary: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                },
                required: ['title', 'description'],
              },
              placesToVisit: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    estimatedCost: { type: Type.NUMBER },
                  },
                  required: ['name', 'description', 'estimatedCost'],
                },
              },
              upsellOptions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    extraAmount: { type: Type.NUMBER },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                  },
                  required: ['extraAmount', 'title', 'description'],
                },
              },
            },
            required: ['aiSummary', 'placesToVisit', 'upsellOptions'],
          },
        },
      };

      // ── 3-layer AI fallback: Gemini primary → Gemini secondary → Groq ──
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      let response: any;
      let aiResult: any = {};
      const primaryKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      const secondaryKey = process.env.GEMINI_API_KEY_2;
      const groqKey = process.env.GROQ_API_KEY;

      // Layer 1: Gemini primary key
      try {
        const aiPrimary = new GoogleGenAI({ apiKey: primaryKey });
        response = await aiPrimary.models.generateContent(geminiRequestConfig);
        aiResult = typeof response.text === 'string' ? JSON.parse(response.text || '{}') : {};
        console.log('🔑 Gemini call succeeded with PRIMARY key');
      } catch (primaryErr: any) {
        console.error('❌ Gemini PRIMARY key failed:', primaryErr.message);

        // Layer 2: Gemini secondary key
        if (secondaryKey) {
          console.log('⏳ Waiting 2s before retrying with Gemini secondary key...');
          await delay(2000);
          try {
            const aiSecondary = new GoogleGenAI({ apiKey: secondaryKey });
            response = await aiSecondary.models.generateContent(geminiRequestConfig);
            aiResult = typeof response.text === 'string' ? JSON.parse(response.text || '{}') : {};
            console.log('🔑 Gemini call succeeded with SECONDARY key');
          } catch (secondaryErr: any) {
            console.error('❌ Gemini SECONDARY key also failed:', secondaryErr.message);

            // Layer 3: Groq fallback
            if (groqKey) {
              console.log('⏳ Waiting 2s before trying Groq...');
              await delay(2000);
              console.log('🟠 Trying Groq fallback...');
              try {
                const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`,
                  },
                  body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                      { role: 'system', content: 'You are an elite AI travel concierge. Respond ONLY with valid JSON matching the requested schema. No markdown, no code fences, just raw JSON.' },
                      { role: 'user', content: prompt },
                    ],
                    temperature: 0.7,
                    max_tokens: 4096,
                    response_format: { type: 'json_object' },
                  }),
                });

                if (!groqResponse.ok) {
                  throw new Error(`Groq HTTP ${groqResponse.status}: ${await groqResponse.text()}`);
                }

                const groqData = await groqResponse.json();
                const groqContent = groqData.choices?.[0]?.message?.content || '{}';
                aiResult = JSON.parse(groqContent);
                console.log('✅ Groq call succeeded');
              } catch (groqErr: any) {
                console.error('❌ Groq also failed:', groqErr.message);
                throw groqErr; // let the outer catch handle hardcoded fallback
              }
            } else {
              console.error('❌ No GROQ_API_KEY configured — falling back to hardcoded response');
              throw secondaryErr;
            }
          }
        } else {
          // No secondary key — try Groq directly
          if (groqKey) {
            console.log('⏳ Waiting 2s before trying Groq...');
            await delay(2000);
            console.log('🟠 Trying Groq fallback...');
            try {
              const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${groqKey}`,
                },
                body: JSON.stringify({
                  model: 'llama-3.3-70b-versatile',
                  messages: [
                    { role: 'system', content: 'You are an elite AI travel concierge. Respond ONLY with valid JSON matching the requested schema. No markdown, no code fences, just raw JSON.' },
                    { role: 'user', content: prompt },
                  ],
                  temperature: 0.7,
                  max_tokens: 4096,
                  response_format: { type: 'json_object' },
                }),
              });

              if (!groqResponse.ok) {
                throw new Error(`Groq HTTP ${groqResponse.status}: ${await groqResponse.text()}`);
              }

              const groqData = await groqResponse.json();
              const groqContent = groqData.choices?.[0]?.message?.content || '{}';
              aiResult = JSON.parse(groqContent);
              console.log('✅ Groq call succeeded');
            } catch (groqErr: any) {
              console.error('❌ Groq also failed:', groqErr.message);
              throw groqErr;
            }
          } else {
            throw primaryErr;
          }
        }
      }

      // ═══════════ STEP 7: GEMINI RAW RESPONSE ═══════════
      console.log('\n═══════════ STEP 7: GEMINI RAW RESPONSE ═══════════');
      console.log('🤖 Code path: Gemini AI (NOT fallback)');
      console.log('🤖 AI Summary title:', aiResult.aiSummary?.title || 'N/A');
      console.log('🤖 placesToVisit count:', (aiResult.placesToVisit || []).length);
      console.log('🤖 upsellOptions count:', (aiResult.upsellOptions || []).length);
      console.log('🤖 Raw placesToVisit:');
      (aiResult.placesToVisit || []).forEach((p: any, i: number) => console.log(`   ${i + 1}. "${p.name}" | $${p.estimatedCost} | ${(p.description || '').substring(0, 80)}...`));
      console.log('════════════════════════════════════════════════════\n');

      aiSummary = aiResult.aiSummary || null;
      upsellOptions = aiResult.upsellOptions || [];

      // (No hotel pricing requested from Gemini anymore)

      // ── STEP A: Validate place names (reject broken/empty names like "AS") ──
      const rawPlaces: any[] = (aiResult.placesToVisit || []).filter((p: any) => {
        const name = (p.name || '').trim();
        if (name.length < 4) {
          console.log(`  ❌ Rejected place with invalid name: "${name}"`);
          return false;
        }
        return true;
      });

      // ── STEP B: Deduplicate (case-insensitive by name) ──
      const seenPlaces = new Set<string>();
      let dedupedPlaces = rawPlaces.filter(p => {
        const key = (p.name || '').toLowerCase().trim();
        if (!key || seenPlaces.has(key)) return false;
        seenPlaces.add(key);
        return true;
      });

      // ── STEP C: Post-AI vibe enforcement (filter non-matching results) ──
      if (hasVibes) {
        // Keywords that each vibe maps to — used to validate Gemini's results
        const vibeKeywordMap: Record<string, string[]> = {
          food_drink: ['restaurant', 'ristorante', 'trattoria', 'osteria', 'pizzeria', 'cafe', 'café', 'bakery', 'food', 'market', 'cuisine', 'wine', 'bar', 'bistro', 'gelato', 'pastry', 'dining', 'eatery', 'tavern', 'pub', 'street food', 'brewery', 'brunch'],
          nature_outdoors: ['park', 'garden', 'lake', 'trail', 'nature', 'forest', 'botanical', 'scenic', 'mountain', 'river', 'valley', 'hill', 'reserve', 'outdoor', 'green', 'waterfall', 'beach', 'island'],
          culture_history: ['museum', 'castle', 'cathedral', 'church', 'basilica', 'monument', 'historic', 'heritage', 'palace', 'temple', 'ruins', 'archaeological', 'medieval', 'ancient', 'cultural', 'history', 'memorial', 'fortress', 'abbey', 'chapel', 'duomo', 'gallery'],
          shopping_exploring: ['market', 'shopping', 'store', 'boutique', 'mall', 'bazaar', 'flea', 'artisan', 'district', 'quarter', 'souk', 'galleria', 'corso', 'street'],
          nightlife_entertainment: ['bar', 'club', 'nightclub', 'live music', 'comedy', 'rooftop', 'lounge', 'entertainment', 'theater', 'theatre', 'disco', 'cabaret', 'jazz', 'karaoke', 'concert'],
          relaxation_wellness: ['spa', 'thermal', 'bath', 'wellness', 'yoga', 'hammam', 'retreat', 'sauna', 'massage', 'relaxation', 'peaceful', 'zen'],
          art_architecture: ['gallery', 'art', 'architecture', 'design', 'sculpture', 'fresco', 'mural', 'street art', 'modern art', 'contemporary', 'exhibition', 'pinacoteca'],
          family_friendly: ['zoo', 'aquarium', 'theme park', 'playground', 'amusement', 'interactive', 'science', 'children', 'family', 'kids', 'fun', 'adventure'],
        };

        // Collect all relevant keywords from selected vibes
        const allowedKeywords: string[] = [];
        for (const v of vibes) {
          if (vibeKeywordMap[v]) allowedKeywords.push(...vibeKeywordMap[v]);
        }

        // Words that indicate non-matching results
        const VIBE_BLOCKLIST = ['aviation', 'aircraft', 'airplane', 'aeroplane', 'helicopter', 'transport museum', 'motorcycle', 'automobile', 'car museum', 'vehicle', 'locomotive', 'railway museum', 'flight simulator'];

        dedupedPlaces = dedupedPlaces.filter(p => {
          const combined = `${p.name} ${p.description}`.toLowerCase();
          // Reject if it matches the blocklist
          if (VIBE_BLOCKLIST.some(blocked => combined.includes(blocked))) {
            console.log(`  🔍 CHECKING PLACE: "${p.name}" → BLOCKED: true (matched blocklist)`);
            return false;
          }
          // Check if at least one keyword from the selected vibes matches
          const matchedKw = allowedKeywords.find(kw => combined.includes(kw));
          if (!matchedKw) {
            console.log(`  🔍 CHECKING PLACE: "${p.name}" → BLOCKED: false (no vibe keyword match, keeping as fallback)`);
            p._vibeScore = 0;
          } else {
            console.log(`  🔍 CHECKING PLACE: "${p.name}" → BLOCKED: false (matched vibe keyword: "${matchedKw}")`);
            p._vibeScore = 1;
          }
          return true;
        });

        // Sort so vibe-matched results come first
        dedupedPlaces.sort((a, b) => (b._vibeScore || 0) - (a._vibeScore || 0));
        console.log(`  ✅ After vibe filtering: ${dedupedPlaces.length} places remain`);
      }

      // ── STEP D: Geocode each place, compute distance, validate ──
      if (geoLat && geoLon) {
        // Try geocoding top candidates, but keep places even if geocoding fails.
        const geocodeCandidates = dedupedPlaces;
        const geocodeResults = await Promise.all(
          geocodeCandidates.map(async (place) => {
            const coords = await geocodePlaceName(place.name, destinationCity, destinationCountry, countryCode, geoLat, geoLon);
            if (coords) {
              const dist = haversineDistance(geoLat, geoLon, coords.lat, coords.lon);
              console.log(`  PLACE COORDS: "${place.name}" -> lat=${coords.lat}, lon=${coords.lon} -> distance: ${dist.toFixed(1)} km`);
              return {
                ...place,
                lat: coords.lat,
                lon: coords.lon,
                distance: `${dist.toFixed(1)} km from ${destinationLabel}`,
                rating: (coords as any).rating,
                reviewsCount: (coords as any).reviewsCount,
                address: (coords as any).address,
                placeType: (coords as any).placeType,
                geoSource: (coords as any).source || 'unknown',
                _geoOk: true,
                _geoDistanceKm: dist,
              };
            }
            return {
              ...place,
              geoStatus: 'missing_coordinates',
              _geoOk: false,
            };
          })
        );

        const geocoded = geocodeResults
          .filter((p: any) => p._geoOk)
          .sort((a: any, b: any) => (a._geoDistanceKm || 0) - (b._geoDistanceKm || 0));
        const notGeocoded = geocodeResults.filter((p: any) => !p._geoOk);

        // Prioritize geocoded places first, then backfill with non-geocoded results.
        placesToVisit = [...geocoded, ...notGeocoded]
          .map(({ _vibeScore, _geoOk, _geoDistanceKm, ...rest }: any) => rest);

        console.log(`  Geocode summary: ${geocoded.length} with coordinates, ${notGeocoded.length} without coordinates (kept as fallback)`);
      } else {
        placesToVisit = dedupedPlaces.map(({ _vibeScore, ...rest }: any) => rest);
      }

      // ═══════════ STEP 8: PLACES GEOCODING + FILTERING ═══════════
      console.log('\n═══════════ STEP 8: PLACES GEOCODING + FILTERING ═══════════');
      console.log('✅ Final places after all filtering:', placesToVisit.length);
      placesToVisit.forEach((p: any, i: number) => console.log(`   ${i + 1}. "${p.name}" — ${p.distance || 'no distance'} | lat=${p.lat || 'N/A'} lon=${p.lon || 'N/A'} | rating=${p.rating || 'N/A'} (${p.reviewsCount || 0} reviews)`));
      console.log('════════════════════════════════════════════════════════════\n');
    } catch (aiErr: any) {
      console.warn('\n❌ AI analysis failed — using FALLBACK code path:', aiErr.message);
      console.log('🤖 CODE PATH: FALLBACK (not Gemini)');
      aiSummary = {
        title: `Your Journey to ${destinationCity}`,
        description: `We've curated the best options for your ${tripType.replace('_', ' ')} trip to ${destinationCity}. Browse through the flights, hotels, and activities below to build your perfect itinerary.`,
      };
      if (nearbyAttractions.length > 0) {
        placesToVisit = nearbyAttractions.map(a => ({
          name: a.name,
          description: `A popular ${a.type} in ${destinationCity}, ${a.distance}. A must-visit during your trip.`,
          estimatedCost: Math.floor(Math.random() * 50) + 10,
        }));
      } else {
        placesToVisit = [
          { name: `${destinationCity} City Center`, description: `Explore the vibrant heart of ${destinationCity}.`, estimatedCost: 20 },
          { name: `${destinationCity} Historic Quarter`, description: `Walk through centuries of history in ${destinationCity}.`, estimatedCost: 15 },
        ];
      }
      upsellOptions = [
        { extraAmount: 100, title: 'Better Hotel', description: 'Upgrade to a higher-rated hotel with more amenities.' },
        { extraAmount: 250, title: 'Premium Cabin', description: 'Switch to a premium cabin class for a more comfortable flight.' },
        { extraAmount: 500, title: 'Full Luxury Package', description: 'Unlock first-class flights, 5-star hotels, and private transfers.' },
      ];
    }

    // NOTE: We do not request or apply AI-provided hotel pricing anymore; keep hotel prices from SerpApi/fallback.

    // ────────────────────────────────────────────────────────
    // STEP 8c: Calculate budget breakdown (after hotel re-pricing)
    // ────────────────────────────────────────────────────────
    // ── Fixed percentage ceilings (never redistributed) ──
    const flightCeiling = Math.round(effectiveBudget * 0.45);
    const hotelCeiling = Math.round(effectiveBudget * 0.30);
    const transportFixed = Math.round(effectiveBudget * 0.10);
    const dailyFixed = Math.round(effectiveBudget * 0.15);

    const cheapestFlightPrice = flights.length > 0
      ? Math.min(...flights.map((f: any) => parseFloat(f.total_amount) || Infinity))
      : 0;
    const cheapestHotelTotal = hotels.length > 0
      ? Math.min(...hotels.map((h: any) => (typeof h.price === 'number' ? h.price : Infinity))) * tripNights
      : 0;

    let budgetBreakdown;
    if (budgetMode === 'total') {
      budgetBreakdown = {
        flights: includeFlight ? Math.round(Math.min(cheapestFlightPrice || flightCeiling, flightCeiling)) : 0,
        hotels: includeHotel ? Math.round(Math.min(cheapestHotelTotal || hotelCeiling, hotelCeiling)) : 0,
        transport: includeTransport ? transportFixed : 0,
        dailyExpenses: dailyFixed,
        nights: tripNights,
        totalBudget: totalBudget,
        includeFlight: !!includeFlight,
        includeHotel: !!includeHotel,
        includeTransport: !!includeTransport,
      };
    } else {
      budgetBreakdown = {
        flights: includeFlight ? flightBudget : 0,
        hotels: includeHotel ? hotelBudget : 0,
        transport: includeTransport ? transportBudget : 0,
        dailyExpenses: dailyExpenseBudget,
        nights: tripNights,
        totalBudget: effectiveBudget,
        includeFlight: !!includeFlight,
        includeHotel: !!includeHotel,
        includeTransport: !!includeTransport,
      };
    }

    // ═══════════ STEP 9: FINAL RESPONSE TO FRONTEND ═══════════
    const finalResponse = {
      flights,
      hotels,
      transport,
      budgetBreakdown,
      aiSummary,
      placesToVisit,
      upsellOptions,
      _debug: {
        resolvedDestination: { iata: destination, city: destinationCity, country: destinationCountry },
        geocodedCenter: geo ? { lat: geoLat, lon: geoLon, displayName: geo.displayName } : null,
        nearbyHotelsFound: hotels.length,
        nearbyAttractionsFound: nearbyAttractions.length,
        hotelSource: hotels.length > 0 ? hotels[0].source : 'none',
      },
    };

    console.log('═══════════ STEP 9: FINAL RESPONSE TO FRONTEND ═══════════');
    console.log('✅ Flights in response:', flights.length);
    console.log('✅ Hotels in response:', hotels.length);
    console.log('✅ Transport in response:', transport.length);
    console.log('✅ Places in response:', placesToVisit.length);
    console.log('✅ AI summary title:', aiSummary?.title || 'N/A');
    console.log('✅ Budget breakdown:', JSON.stringify(budgetBreakdown));
    console.log('✅ Upsell options:', upsellOptions.length);
    console.log('✅ Total response size:', JSON.stringify(finalResponse).length, 'chars');
    console.log('══════════════════════════════════════════════════════════\n');

    return NextResponse.json(finalResponse);
  } catch (error: any) {
    console.error('Planner API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate trip plan' }, { status: 500 });
  }
}



