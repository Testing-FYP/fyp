import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { searchSerpApiFlights as searchGoogleFlights } from '../google-api/google-flights';
import { searchSerpApiHotels as searchGoogleHotels } from '../google-api/google-hotels';
import { searchGoogleImagesLight } from '../google-api/google-images-light';
import { generateMockFlights, generateMockHotels } from './mock-generator';

async function emitProgress(sessionId: string | null, percent: number, label: string): Promise<void> {
  if (!sessionId) return;
  try {
    await fetch(`http://localhost:5000/api/generate/progress/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ percent, label }),
    });
  } catch {
    // Non-fatal: progress reporting must never interrupt trip generation.
  }
}

const LOCATIONIQ_KEY = process.env.LOCATIONIQ_KEY || '';
const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';
const HOTEL_STAR_OPTIONS = [1, 2, 3, 4, 5];

function loadPromptTemplate(fileName: string) {
  return fs.readFileSync(path.join(process.cwd(), 'app', 'ai-prompts', fileName), 'utf8');
}

function fillPromptTemplate(template: string, values: Record<string, string | number | boolean>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

function createPlannerLogger() {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = Date.now();
  const prefix = `[planner.generate:${requestId}]`;

  const formatValue = (value: any) => {
    if (value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  return {
    start() {
      console.log(`\n${prefix} START`);
    },
    step(index: number, title: string, details?: any) {
      const suffix = details === undefined ? '' : ` | ${formatValue(details)}`;
      console.log(`${prefix} STEP ${String(index).padStart(2, '0')} - ${title}${suffix}`);
    },
    info(label: string, value?: any) {
      const suffix = value === undefined ? '' : `: ${formatValue(value)}`;
      console.log(`${prefix}   ${label}${suffix}`);
    },
    warn(label: string, value?: any) {
      const suffix = value === undefined ? '' : `: ${formatValue(value)}`;
      console.warn(`${prefix}   WARN ${label}${suffix}`);
    },
    error(label: string, value?: any) {
      const suffix = value === undefined ? '' : `: ${formatValue(value)}`;
      console.error(`${prefix}   ERROR ${label}${suffix}`);
    },
    done(details?: any) {
      const elapsedMs = Date.now() - startedAt;
      const suffix = details === undefined ? '' : ` | ${formatValue(details)}`;
      console.log(`${prefix} DONE in ${elapsedMs}ms${suffix}\n`);
    },
  };
}

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

function normalizeSerpApiSegment(segment: any, index: number) {
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
    cabin_class: (segment?.travel_class || 'economy').toLowerCase(),
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

function parseFlightPriceValue(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = parseFlightPriceValue(item);
      if (parsed !== null) return parsed;
    }
  }
  if (value && typeof value === 'object') {
    return firstFlightPrice(
      value.extracted_price,
      value.price,
      value.amount,
      value.total,
      value.total_amount,
      value.value,
      value.lowest,
      value.extracted_lowest
    );
  }
  return null;
}

function firstFlightPrice(...values: any[]) {
  for (const value of values) {
    const parsed = parseFlightPriceValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function getSerpApiItineraryPrice(itinerary: any): number | null {
  const priceInsights = itinerary?.price_insights || {};
  return firstFlightPrice(
    itinerary?.price,
    itinerary?.extracted_price,
    itinerary?.total_price,
    itinerary?.total_amount,
    itinerary?.price_amount,
    itinerary?.displayed_price,
    itinerary?.fare?.price,
    itinerary?.fare?.amount,
    itinerary?.booking_options,
    itinerary?.prices,
    priceInsights?.price,
    priceInsights?.lowest_price
  );
}

function normalizeSerpApiItinerary(itinerary: any, returnDate: string, passengers: any[]) {
  const rawSegments = Array.isArray(itinerary?.flights) ? itinerary.flights : [];
  const rawLayovers = Array.isArray(itinerary?.layovers) ? itinerary.layovers : [];
  const normalizedSegments = rawSegments.map((segment: any, index: number) => normalizeSerpApiSegment(segment, index));
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

  const normalizedPrice = getSerpApiItineraryPrice(itinerary);
  const hasPrice = normalizedPrice !== null;

  return {
    id: itinerary?.booking_token || itinerary?.departure_token || `${normalizedPrice || itinerary?.price || 'serp'}-${Math.random().toString(36).slice(2, 8)}`,
    slices,
    passengers: passengers.length > 0 ? passengers : [{ type: 'adult' }],
    total_amount: hasPrice ? String(normalizedPrice) : '',
    display_price: hasPrice ? normalizedPrice : null,
    priceSource: hasPrice ? 'provider' : 'missing',
    raw_price: itinerary?.price ?? null,
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

function mergeReturnSliceIntoOffer(outboundOffer: any, returnItinerary: any, passengers: any[]) {
  const returnOffer = normalizeSerpApiItinerary(returnItinerary, '', passengers);
  const returnSlice = returnOffer.slices?.[0];
  if (!returnSlice) return outboundOffer;
  const returnPrice = returnOffer.display_price ?? parseFlightPriceValue(returnOffer.total_amount);
  const outboundPrice = outboundOffer.display_price ?? parseFlightPriceValue(outboundOffer.total_amount);
  const mergedPrice = returnPrice ?? outboundPrice;

  return {
    ...outboundOffer,
    slices: [outboundOffer.slices[0], returnSlice].filter(Boolean),
    total_amount: mergedPrice !== null ? String(mergedPrice) : '',
    display_price: mergedPrice,
    priceSource: returnOffer.priceSource === 'provider' || outboundOffer.priceSource === 'provider' ? 'provider' : 'missing',
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

function parseHotelPriceValue(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function firstHotelPrice(...values: any[]) {
  for (const value of values) {
    const parsed = parseHotelPriceValue(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function estimateHotelNightlyPrice(property: any, fallbackIndex: number) {
  const classValue = property?.extracted_hotel_class ?? property?.hotel_class;
  let stars = typeof classValue === 'number' ? classValue : 0;
  if (!stars && typeof classValue === 'string') {
    const match = classValue.match(/(\d)/);
    stars = match ? Number(match[1]) : 0;
  }

  const rating = parseHotelPriceValue(property?.overall_rating) || 0;
  const starBased = stars >= 5 ? 310 : stars >= 4 ? 210 : stars >= 3 ? 140 : 95;
  const ratingPremium = rating >= 4.6 ? 35 : rating >= 4.2 ? 20 : 0;
  const rankAdjustment = Math.max(0, 5 - fallbackIndex) * 8;
  return starBased + ratingPremium + rankAdjustment;
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

function mapSerpApiHotelToResult(property: any, fallbackIndex: number, destinationCity: string, nights: number, apartments = 1, roomsPerApartment = 1) {
  const stayNights = Math.max(1, Number(nights) || 1);
  const apartmentCount = Math.max(1, Number(apartments) || 1);
  const bedroomCount = Math.max(1, Number(roomsPerApartment) || 1);
  const offerPrices = Array.isArray(property?.prices)
    ? property.prices.flatMap((price: any) => [price?.extracted_price, price?.price, price?.rate_per_night, price?.total_rate])
    : [];
  const nightlyFromProvider = firstHotelPrice(
    property?.rate_per_night?.extracted_lowest,
    property?.rate_per_night?.lowest,
    property?.extracted_price,
    property?.price,
    property?.displayed_price,
    property?.price_from,
    ...offerPrices
  );
  const totalFromProvider = firstHotelPrice(
    property?.total_rate?.extracted_lowest,
    property?.total_rate?.lowest,
    property?.extracted_total_price,
    property?.total_price,
    property?.total,
    property?.price_total
  );
  const estimatedNightlyPrice = estimateHotelNightlyPrice(property, fallbackIndex);
  const extractedPrice = nightlyFromProvider ?? (totalFromProvider && stayNights > 0 ? Math.round(totalFromProvider / stayNights) : null) ?? estimatedNightlyPrice;
  const computedTotalRate = Math.round(extractedPrice * stayNights * apartmentCount);
  const providerTotal = totalFromProvider && totalFromProvider >= extractedPrice ? totalFromProvider : null;
  const totalRate = providerTotal ? Math.round(providerTotal * apartmentCount) : computedTotalRate;
  const priceSource = nightlyFromProvider !== null || totalFromProvider !== null ? 'provider' : 'estimated';
  const starRating = property?.extracted_hotel_class || property?.hotel_class || 3;
  const hotelClass = formatStarLabel(property?.hotel_class || (typeof starRating === 'number' ? `${starRating}-star hotel` : ''));
  const amenities = Array.isArray(property?.amenities) ? property.amenities : [];
  const nearbyPlaces = Array.isArray(property?.nearby_places) ? property.nearby_places : [];
  const images = Array.isArray(property?.images) ? property.images : [];

  return {
    id: property?.property_token || property?.serpapi_property_details_link || `serp-h-${fallbackIndex}`,
    type: property?.type || 'hotel',
    name: property?.name || `Hotel ${fallbackIndex + 1}`,
    price: extractedPrice,
    totalPrice: totalRate,
    nights: stayNights,
    apartments: apartmentCount,
    roomsPerApartment: bedroomCount,
    bedsRequested: apartmentCount * bedroomCount,
    priceSource,
    priceLabel: priceSource === 'estimated' ? 'Estimated nightly price' : 'Live nightly price',
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

function getSerpApiHotelKey(property: any) {
  return [
    property?.property_token,
    property?.serpapi_property_details_link,
    property?.name && property?.address ? `${property.name}|${property.address}` : '',
    property?.name && property?.gps_coordinates
      ? `${property.name}|${property.gps_coordinates.latitude}|${property.gps_coordinates.longitude}`
      : '',
    property?.name,
  ].filter(Boolean)[0] || '';
}

type BudgetCategoryKey = 'flights' | 'hotels' | 'transport' | 'dailyExpenses';

type BudgetCategoryDecision = {
  status?: 'fit' | 'over_budget' | 'no_budget' | 'no_data' | 'no_prices';
  selectedIndexes?: number[];
  message?: string;
  examples?: string[];
};

type BudgetAiDecision = {
  summary?: string;
  warnings?: string[];
  categories?: Partial<Record<BudgetCategoryKey, BudgetCategoryDecision>>;
};

type BudgetFilterInput = {
  flights: any[];
  hotels: any[];
  transport: any[];
  placesToVisit: any[];
  includeFlight: boolean;
  includeHotel: boolean;
  includeTransport: boolean;
  includePlaceVisits: boolean;
  budgetMode: string;
  totalBudget: number;
  flightBudget: number;
  hotelBudget: number;
  transportBudget: number;
  transportBudgetSelections?: Record<string, { selected?: boolean; quantity?: number }>;
  dailyExpenseBudget: number;
  nights: number;
  hotelRooms?: number;
  travelers: number;
  origin: string;
  destination: string;
  destinationCity: string;
  destinationCountry: string;
  tripType: string;
  departureDate: string;
  returnDate?: string;
  vibes?: string[];
};

type BudgetPickResult<T = any> = {
  items: T[];
  selectedIndexes: number[];
  cheapestPrice: number | null;
  selectedTotalPrice: number | null;
  shownCount: number;
  status: 'fit' | 'over_budget' | 'no_prices';
};

const BUDGET_TOLERANCE_PERCENT = 10;
const TOTAL_BUDGET_SPLIT: Record<BudgetCategoryKey, number> = {
  flights: 0.45,
  hotels: 0.30,
  transport: 0.10,
  dailyExpenses: 0.15,
};
const BUDGET_CATEGORY_LABELS: Record<BudgetCategoryKey, string> = {
  flights: 'Flights',
  hotels: 'Hotels',
  transport: 'Transport',
  dailyExpenses: 'Daily expenses',
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildBudgetAllocations(input: BudgetFilterInput) {
  if (input.budgetMode === 'per_category') {
    return {
      flights: input.includeFlight ? Math.max(0, Number(input.flightBudget) || 0) : 0,
      hotels: input.includeHotel ? Math.max(0, Number(input.hotelBudget) || 0) : 0,
      transport: input.includeTransport ? Math.max(0, Number(input.transportBudget) || 0) : 0,
      dailyExpenses: input.includePlaceVisits ? Math.max(0, Number(input.dailyExpenseBudget) || 0) : 0,
    };
  }

  const total = Math.max(0, Number(input.totalBudget) || 0);
  const enabledWeights = {
    flights: input.includeFlight ? TOTAL_BUDGET_SPLIT.flights : 0,
    hotels: input.includeHotel ? TOTAL_BUDGET_SPLIT.hotels : 0,
    transport: input.includeTransport ? TOTAL_BUDGET_SPLIT.transport : 0,
    dailyExpenses: input.includePlaceVisits ? TOTAL_BUDGET_SPLIT.dailyExpenses : 0,
  };
  const enabledTotal = Object.values(enabledWeights).reduce((sum, weight) => sum + weight, 0) || 1;
  return {
    flights: Math.round(total * (enabledWeights.flights / enabledTotal)),
    hotels: Math.round(total * (enabledWeights.hotels / enabledTotal)),
    transport: Math.round(total * (enabledWeights.transport / enabledTotal)),
    dailyExpenses: Math.round(total * (enabledWeights.dailyExpenses / enabledTotal)),
  };
}

function getNormalizedFlightPrice(flight: any) {
  return parseFlightPriceValue(flight?.display_price ?? flight?.total_amount ?? flight?.price);
}

function getBudgetFlightCabin(flight: any) {
  const firstSegment = flight?.slices?.[0]?.segments?.[0];
  return String(firstSegment?.cabin_class || flight?.cabin_class || 'economy').toLowerCase();
}

function getBudgetHotelStarCount(hotel: any) {
  const candidates = [hotel?.rating, hotel?.hotelClass, hotel?.raw?.hotel_class, hotel?.raw?.extracted_hotel_class];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return Math.max(1, Math.min(5, Math.round(candidate)));
    if (typeof candidate === 'string') {
      const match = candidate.match(/(\d)/);
      if (match) return Math.max(1, Math.min(5, Number(match[1])));
    }
  }
  return 0;
}

function getHotelStayPrice(hotel: any, nights: number, rooms: number) {
  const total = firstHotelPrice(hotel?.totalPrice, hotel?.total_price, hotel?.total);
  const nightly = firstHotelPrice(hotel?.price, hotel?.nightlyPrice, hotel?.rate_per_night);
  const stayMultiplier = Math.max(1, nights) * Math.max(1, rooms);
  if (total !== null) {
    if (nightly !== null && stayMultiplier > 1 && total <= nightly) {
      return nightly * stayMultiplier;
    }
    return total;
  }
  if (nightly === null) return null;
  return nightly * stayMultiplier;
}

function getTransportMode(option: any) {
  return String(option?.id || option?.transportType || option?.type || '').trim();
}

function getTransportSelection(input: BudgetFilterInput, option: any) {
  const type = getTransportMode(option);
  return type ? input.transportBudgetSelections?.[type] : undefined;
}

function getTransportQuantity(input: BudgetFilterInput, option: any) {
  return Math.max(1, Number(getTransportSelection(input, option)?.quantity) || 1);
}

function getTransportOptionPrice(option: any, nights = 1, quantity = 1) {
  const price = firstHotelPrice(option?.estimatedPrice, option?.price, option?.totalPrice, option?.amount);
  if (price === null) return null;
  const stayDays = Math.max(1, Number(nights) || 1);
  return price * stayDays * Math.max(1, Number(quantity) || 1);
}

function getPlaceTotalPrice(place: any, travelers: number, nights = 1) {
  const price = firstHotelPrice(place?.estimatedCost, place?.price, place?.cost);
  if (price === null) return null;
  return price * Math.max(1, travelers) * Math.max(1, Number(nights) || 1);
}

function getDailyCategoryPlaceName(category: any) {
  const suggestedPlace = String(category?.suggestedPlace || category?.place || category?.where || '').trim();
  if (suggestedPlace) return suggestedPlace;
  const label = String(category?.label || category?.key || 'Daily stop').trim();
  return label;
}

function getDailyCategoryDescription(category: any, destinationCity: string) {
  const detail = String(category?.detail || '').trim();
  const suggestedPlace = String(category?.suggestedPlace || category?.place || category?.where || '').trim();
  const label = String(category?.label || category?.key || 'daily experience').trim();
  if (suggestedPlace && detail) return `${suggestedPlace}: ${detail.charAt(0).toUpperCase()}${detail.slice(1)} in ${destinationCity}.`;
  if (suggestedPlace) return `Try ${suggestedPlace} in ${destinationCity}. This is the normal spend estimate for ${label.toLowerCase()}.`;
  if (detail) return `${detail.charAt(0).toUpperCase()}${detail.slice(1)} in ${destinationCity}.`;
  return `${label} option in ${destinationCity}, matched to the daily budget you selected.`;
}

function buildDailyCategoryPlaces(categories: any[], destinationCity: string) {
  return categories.flatMap((category: any, index: number) => {
    const baseCost = Math.max(0, Math.round(Number(category?.estimatedCost || 0)));
    const rawSuggestions = Array.isArray(category?.suggestedPlaces) && category.suggestedPlaces.length
      ? category.suggestedPlaces
      : [category?.suggestedPlace || category?.place || category?.where || getDailyCategoryPlaceName(category)].filter(Boolean);

    return rawSuggestions.slice(0, 5).map((suggestion: any, suggestionIndex: number) => {
      const suggestionName = typeof suggestion === 'string'
        ? suggestion
        : String(suggestion?.name || suggestion?.label || suggestion?.place || suggestion?.where || '').trim();
      const suggestionCost = typeof suggestion === 'object'
        ? Math.max(0, Math.round(Number(suggestion?.estimatedCost || suggestion?.cost || suggestion?.price || baseCost)))
        : baseCost;
      const suggestionDetail = typeof suggestion === 'object'
        ? String(suggestion?.detail || suggestion?.notes || suggestion?.description || category?.detail || '').trim()
        : String(category?.detail || '').trim();
      const categoryForDescription = {
        ...category,
        suggestedPlace: suggestionName,
        detail: suggestionDetail,
      };
      return {
        name: suggestionName || getDailyCategoryPlaceName(category),
        description: getDailyCategoryDescription(categoryForDescription, destinationCity),
        estimatedCost: suggestionCost || baseCost,
        categoryKey: String(category?.key || '').trim(),
        categoryLabel: String(category?.label || '').trim(),
        suggestedPlace: suggestionName,
        source: 'budget_daily_category',
        selectedFromBudget: true,
        sortPriority: index,
        optionIndex: suggestionIndex,
      };
    });
  });
}

function mergeBudgetDailyPlaces(places: any[], categoryPlaces: any[]) {
  const seen = new Set<string>();
  return [...categoryPlaces, ...places].filter(place => {
    const key = String(place?.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickOneVibePlace(places: any[]) {
  const place = places.find((item: any) => item?.selectedFromBudget !== true && item?.source !== 'budget_daily_category');
  return place ? [{ ...place, selectedFromVibe: true }] : [];
}

function pickOnePerBudgetCategory(places: any[]) {
  const seen = new Set<string>();
  return places.filter((place: any) => {
    const key = String(place?.categoryKey || place?.categoryLabel || place?.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeBudgetFlights(flights: any[]) {
  return flights.slice(0, 12).map((flight, index) => {
    const slice = flight?.slices?.[0] || {};
    const segments = Array.isArray(slice?.segments) ? slice.segments : [];
    const first = segments[0] || {};
    const last = segments[segments.length - 1] || first;
    return {
      index,
      price: getNormalizedFlightPrice(flight),
      airline: first?.marketing_carrier?.name || flight?.owner?.name || 'Airline unavailable',
      cabin: first?.cabin_class || flight?.cabin_class || '',
      stops: Math.max(0, segments.length - 1),
      route: `${first?.origin?.iata_code || ''}-${last?.destination?.iata_code || ''}`,
      departure: first?.departing_at || '',
      arrival: last?.arriving_at || '',
    };
  });
}

function summarizeBudgetHotels(hotels: any[], nights: number, rooms: number) {
  return hotels.slice(0, 12).map((hotel, index) => ({
    index,
    totalStayPrice: getHotelStayPrice(hotel, nights, rooms),
    nightlyPrice: firstHotelPrice(hotel?.price, hotel?.nightlyPrice),
    name: hotel?.name || 'Hotel unavailable',
    stars: hotel?.rating || hotel?.hotelClass || '',
    location: hotel?.location || hotel?.address || '',
    amenities: Array.isArray(hotel?.amenities) ? hotel.amenities.slice(0, 8) : [],
  }));
}

function summarizeBudgetTransport(transport: any[], input: BudgetFilterInput) {
  return transport.slice(0, 12).map((option, index) => ({
    index,
    totalTripPrice: getTransportOptionPrice(option, input.nights, getTransportQuantity(input, option)),
    unitPrice: firstHotelPrice(option?.estimatedPrice, option?.price, option?.totalPrice, option?.amount),
    quantity: getTransportQuantity(input, option),
    name: option?.displayName || option?.operator || option?.type || 'Transport option',
    type: option?.id || option?.transportType || option?.type || '',
    priceLabel: option?.priceLabel || '',
    timing: option?.duration || option?.travelTimeNotes || '',
    notes: option?.notes || option?.bestUseCase || '',
  }));
}

function summarizeBudgetPlaces(placesToVisit: any[], travelers: number, nights: number) {
  return placesToVisit.slice(0, 16).map((place, index) => ({
    index,
    totalEstimatedPrice: getPlaceTotalPrice(place, travelers, nights),
    unitEstimatedPrice: firstHotelPrice(place?.estimatedCost, place?.price, place?.cost),
    name: place?.name || 'Place unavailable',
    description: place?.description || '',
    rating: place?.rating || null,
    distance: place?.distance || '',
  }));
}

function stripJsonFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function parseBudgetAiJson(text: string): BudgetAiDecision {
  const stripped = stripJsonFences(text || '{}');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const json = start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
  return JSON.parse(json);
}

function buildBudgetAiPrompt(input: BudgetFilterInput) {
  const budgets = buildBudgetAllocations(input);
  const categoryUpper = {
    flights: Math.round(budgets.flights * 1.1),
    hotels: Math.round(budgets.hotels * 1.1),
    transport: Math.round(budgets.transport * 1.1),
    dailyExpenses: Math.round(budgets.dailyExpenses * 1.1),
  };

  return fillPromptTemplate(loadPromptTemplate('generate-budget-filter.txt'), {
    TRIP_CONTEXT_JSON: JSON.stringify({
      origin: input.origin,
      destination: input.destination,
      destinationCity: input.destinationCity,
      destinationCountry: input.destinationCountry,
      tripType: input.tripType,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      travelers: input.travelers,
      nights: input.nights,
      vibes: input.vibes || [],
    }, null, 2),
    BUDGET_CONTEXT_JSON: JSON.stringify({
      budgetMode: input.budgetMode,
      totalBudget: input.totalBudget,
      userCategoryBudgets: {
        flights: input.flightBudget,
        hotels: input.hotelBudget,
        transport: input.transportBudget,
        dailyExpenses: input.dailyExpenseBudget,
      },
      effectiveCategoryBudgets: budgets,
      tolerancePercent: BUDGET_TOLERANCE_PERCENT,
      toleranceUpperLimit: categoryUpper,
    }, null, 2),
    REAL_OPTIONS_JSON: JSON.stringify({
      flights: summarizeBudgetFlights(input.flights),
      hotels: summarizeBudgetHotels(input.hotels, input.nights, Math.max(1, Number(input.hotelRooms) || 1)),
      transport: summarizeBudgetTransport(input.transport, input),
      dailyExpenses: summarizeBudgetPlaces(input.placesToVisit, input.travelers, input.nights),
    }, null, 2),
  });
}

async function callBudgetGemini(prompt: string) {
  const keys = [
    { name: 'gemini_key_1', value: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' },
    { name: 'gemini_key_2', value: process.env.NEXT_PUBLIC_GEMINI_API_KEY_V2 || '' },
  ];

  for (const key of keys) {
    if (!key.value) continue;
    try {
      const ai = new GoogleGenAI({ apiKey: key.value });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          temperature: 0.15,
          responseMimeType: 'application/json',
        },
      } as any);
      return { decision: parseBudgetAiJson(response.text || '{}'), source: key.name };
    } catch (error: any) {
      console.error(`[Budget AI prompt] ${key.name} failed:`, error?.message || error);
    }
  }

  const groqKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || '';
  if (groqKey) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.15,
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      return {
        decision: parseBudgetAiJson(data.choices?.[0]?.message?.content || '{}'),
        source: 'groq',
      };
    } catch (error: any) {
      console.error('[Budget AI prompt] groq failed:', error?.message || error);
    }
  }

  throw new Error('AI budget filter failed');
}

function pickAiSelectedItems<T>(items: T[], decision?: BudgetCategoryDecision) {
  if (!Array.isArray(decision?.selectedIndexes)) return [];
  const picked = decision.selectedIndexes
    .map(index => Number(index))
    .filter(index => Number.isInteger(index) && index >= 0 && index < items.length)
    .map(index => items[index]);
  return picked;
}

function getCategoryCheapestPrice(key: BudgetCategoryKey, input: BudgetFilterInput) {
  const prices =
    key === 'flights'
      ? input.flights.map(getNormalizedFlightPrice)
      : key === 'hotels'
        ? input.hotels.map(hotel => getHotelStayPrice(hotel, input.nights, Math.max(1, Number(input.hotelRooms) || 1)))
        : key === 'transport'
          ? input.transport.map(option => getTransportOptionPrice(option, input.nights, getTransportQuantity(input, option)))
          : input.placesToVisit.map(place => getPlaceTotalPrice(place, input.travelers, input.nights));
  const valid = prices.filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0);
  return valid.length ? Math.min(...valid) : null;
}

function getCategoryPriceGetter(key: BudgetCategoryKey, input: BudgetFilterInput) {
  if (key === 'flights') return (item: any) => getNormalizedFlightPrice(item);
  if (key === 'hotels') return (item: any) => getHotelStayPrice(item, input.nights, Math.max(1, Number(input.hotelRooms) || 1));
  if (key === 'transport') return (item: any) => getTransportOptionPrice(item, input.nights, getTransportQuantity(input, item));
  return (item: any) => getPlaceTotalPrice(item, input.travelers, input.nights);
}

function deterministicPickByBudget<T>(
  items: T[],
  budget: number,
  getPrice: (item: T) => number | null,
  maxItems: number,
  options: { cumulative?: boolean } = {}
): BudgetPickResult<T> {
  const priced = items
    .map((item, index) => ({ item, index, price: getPrice(item) }))
    .filter((entry): entry is { item: T; index: number; price: number } => typeof entry.price === 'number' && Number.isFinite(entry.price) && entry.price > 0)
    .sort((a, b) => a.price - b.price);
  const upperBound = Math.round(Math.max(0, Number(budget) || 0) * (1 + BUDGET_TOLERANCE_PERCENT / 100));
  if (options.cumulative) {
    const picked: typeof priced = [];
    let selectedTotalPrice = 0;
    for (const entry of priced) {
      if (picked.length >= maxItems) break;
      if (selectedTotalPrice + entry.price <= upperBound) {
        picked.push(entry);
        selectedTotalPrice += entry.price;
      }
    }
    if (!picked.length && priced.length) {
      picked.push(priced[0]);
      selectedTotalPrice = priced[0].price;
    }

    return {
      items: picked.map(entry => entry.item),
      selectedIndexes: picked.map(entry => entry.index),
      cheapestPrice: priced[0]?.price ?? null,
      selectedTotalPrice: picked.length ? selectedTotalPrice : null,
      shownCount: picked.length,
      status: !priced.length
        ? 'no_prices' as const
        : selectedTotalPrice <= upperBound
          ? 'fit' as const
          : 'over_budget' as const,
    };
  }

  const withinBudget = priced.filter(entry => entry.price <= upperBound);
  const picked = (withinBudget.length ? withinBudget : priced.slice(0, 1)).slice(0, maxItems);
  return {
    items: picked.map(entry => entry.item),
    selectedIndexes: picked.map(entry => entry.index),
    cheapestPrice: priced[0]?.price ?? null,
    selectedTotalPrice: picked[0]?.price ?? null,
    shownCount: picked.length,
    status: !priced.length
      ? 'no_prices' as const
      : picked.length && picked[0].price <= upperBound
        ? 'fit' as const
        : 'over_budget' as const,
  };
}

function buildBudgetUnitInfo(
  key: BudgetCategoryKey,
  input: BudgetFilterInput,
  budget: number,
  cheapestPrice: number | null,
  selectedTotalPrice: number | null
) {
  const nights = Math.max(1, Number(input.nights) || 1);
  const rooms = Math.max(1, Number(input.hotelRooms) || 1);
  const travelers = Math.max(1, Number(input.travelers) || 1);
  if (key === 'flights') {
    return {
      budgetLabel: 'Trip fare budget',
      cheapestLabel: 'Cheapest fare',
      upperLabel: 'With tolerance',
      selectedLabel: 'Lowest shown',
      usageDetail: `${pluralize(travelers, 'traveler')} · ${input.tripType === 'round_trip' ? 'round trip' : 'one way'}`,
      unitBudget: null,
      unitCheapest: null,
    };
  }
  if (key === 'hotels') {
    const perApartmentNightBudget = budget ? Math.round(budget / nights / rooms) : null;
    const perApartmentNightCheapest = cheapestPrice ? Math.round(cheapestPrice / nights / rooms) : null;
    return {
      budgetLabel: 'Total stay budget',
      cheapestLabel: 'Cheapest stay',
      upperLabel: 'With tolerance',
      selectedLabel: 'Lowest shown',
      usageDetail: `${pluralize(nights, 'night')} · ${pluralize(rooms, 'apartment')}`,
      unitBudget: perApartmentNightBudget,
      unitCheapest: perApartmentNightCheapest,
      unitLabel: 'per apartment/night',
      scopeMetrics: [
        { icon: 'hotel', label: 'Total staying budget', value: budget, detail: `${pluralize(nights, 'night')} total` },
        { icon: 'dollar', label: 'Cheapest option', value: cheapestPrice, detail: 'total stay price' },
        { icon: 'calendar', label: 'Nightly budget', value: perApartmentNightBudget, detail: 'per apartment/night' },
        { icon: 'bed', label: 'Cheapest daily hotel', value: perApartmentNightCheapest, detail: 'per apartment/night' },
        { icon: 'tolerance', label: 'Tolerance', value: Math.round(budget * 1.1), detail: `${BUDGET_TOLERANCE_PERCENT}% upper limit` },
      ],
    };
  }
  if (key === 'transport') {
    const perDayBudget = budget ? Math.round(budget / nights) : null;
    const perDayCheapest = cheapestPrice ? Math.round(cheapestPrice / nights) : null;
    return {
      budgetLabel: 'Trip transport budget',
      cheapestLabel: 'Cheapest option',
      upperLabel: 'With tolerance',
      selectedLabel: 'Lowest shown',
      usageDetail: `${pluralize(travelers, 'traveler')} · whole trip movement`,
      unitBudget: perDayBudget,
      unitCheapest: perDayCheapest,
      unitLabel: 'per trip day',
      scopeMetrics: [
        { icon: 'dollar', label: 'Total budget', value: budget, detail: `${pluralize(nights, 'day')} total` },
        { icon: 'ticket', label: 'Total cheapest option', value: cheapestPrice, detail: 'cheapest trip option' },
        { icon: 'calendar', label: 'One-day budget', value: perDayBudget, detail: 'daily allowance' },
        { icon: 'bus', label: 'Cheapest option/day', value: perDayCheapest, detail: 'cheapest daily average' },
        { icon: 'tolerance', label: 'Tolerance', value: Math.round(budget * 1.1), detail: `${BUDGET_TOLERANCE_PERCENT}% upper limit` },
      ],
    };
  }
  const perDayBudget = budget ? Math.round(budget / nights) : null;
  const perDaySelected = selectedTotalPrice ? Math.round(selectedTotalPrice / nights) : null;
  return {
    budgetLabel: 'Places budget',
    cheapestLabel: 'Cheapest place',
    upperLabel: 'With tolerance',
    selectedLabel: 'Selected total',
    usageDetail: `${pluralize(travelers, 'traveler')} · selected places are added together`,
    unitBudget: perDayBudget,
    unitCheapest: perDaySelected,
    unitLabel: 'per trip day',
    scopeMetrics: [
      { icon: 'dollar', label: 'Total budget', value: budget, detail: `${pluralize(nights, 'day')} total` },
      { icon: 'ticket', label: 'Selected total', value: selectedTotalPrice, detail: 'all selected places' },
      { icon: 'calendar', label: 'One-day budget', value: perDayBudget, detail: 'daily allowance' },
      { icon: 'map', label: 'Selected/day', value: perDaySelected, detail: 'selected daily average' },
      { icon: 'tolerance', label: 'Tolerance', value: Math.round(budget * 1.1), detail: `${BUDGET_TOLERANCE_PERCENT}% upper limit` },
    ],
  };
}

function sumPrices<T>(items: T[], getPrice: (item: T) => number | null) {
  const prices = items
    .map(getPrice)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0);
  return prices.length ? prices.reduce((sum, price) => sum + price, 0) : null;
}

function lowestPrice<T>(items: T[], getPrice: (item: T) => number | null) {
  const prices = items
    .map(getPrice)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function priceRangeStats<T>(items: T[], getPrice: (item: T) => number | null) {
  const prices = items
    .map(getPrice)
    .filter((price): price is number => typeof price === 'number' && Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  if (!prices.length) {
    return {
      min: null,
      max: null,
      average: null,
      count: 0,
    };
  }
  const min = prices[0];
  const max = prices[prices.length - 1];
  const sampleIndexes = prices.length >= 4
    ? [0, 1, Math.floor(prices.length / 2), prices.length - 1]
    : prices.map((_, index) => index);
  const samplePrices = sampleIndexes.map(index => prices[index]);
  const sampleAverage = samplePrices.reduce((sum, price) => sum + price, 0) / samplePrices.length;
  return {
    min,
    max,
    average: Math.round(sampleAverage),
    count: prices.length,
    samplePrices,
  };
}

function buildBudgetCategoryReport(
  key: BudgetCategoryKey,
  input: BudgetFilterInput,
  decision: BudgetCategoryDecision | undefined,
  originalCount: number,
  shownCount: number,
  enabled = true,
  selectedTotalPrice: number | null = null,
  selectedPriceStats: { min: number | null; max: number | null; average: number | null; count: number; samplePrices?: number[] } | null = null
) {
  const budgets = buildBudgetAllocations(input);
  const budget = budgets[key];
  const cheapestPrice = getCategoryCheapestPrice(key, input);
  const unitInfo = buildBudgetUnitInfo(key, input, budget, cheapestPrice, selectedTotalPrice);
  const lowerBound = Math.round(budget * 0.9);
  const upperBound = Math.round(budget * 1.1);
  const comparisonStatus = selectedTotalPrice && budget > 0
    ? selectedTotalPrice <= upperBound ? 'fit' : 'over_budget'
    : undefined;
  return {
    key,
    label: BUDGET_CATEGORY_LABELS[key],
    comparisonBasis: 'trip_total',
    stayDays: Math.max(1, Number(input.nights) || 1),
    travelers: Math.max(1, Number(input.travelers) || 1),
    status: enabled ? (comparisonStatus || decision?.status || 'no_data') : 'disabled',
    budget,
    lowerBound,
    upperBound,
    cheapestPrice,
    selectedTotalPrice,
    selectedPriceStats,
    ...unitInfo,
    originalCount,
    shownCount,
    hiddenCount: Math.max(0, originalCount - shownCount),
    message: decision?.message || (enabled ? 'Gemini did not return a category explanation.' : `${BUDGET_CATEGORY_LABELS[key]} is disabled for this trip.`),
    examples: Array.isArray(decision?.examples) ? decision.examples.map(String) : [],
  };
}

function buildUnavailableBudgetResult(input: BudgetFilterInput, errorMessage: string) {
  const budgets = buildBudgetAllocations(input);
  const emptyPick = { items: [], selectedIndexes: [], cheapestPrice: null, selectedTotalPrice: null, shownCount: 0, status: 'no_prices' as const };
  const flightPick = input.includeFlight ? deterministicPickByBudget(input.flights, budgets.flights, getCategoryPriceGetter('flights', input), 9) : emptyPick;
  const hotelPick = input.includeHotel ? deterministicPickByBudget(input.hotels, budgets.hotels, getCategoryPriceGetter('hotels', input), 10) : emptyPick;
  const selectedTransportFromBudget = input.includeTransport && input.transportBudgetSelections
    ? input.transport.filter((option: any) => getTransportSelection(input, option)?.selected === true)
    : [];
  const transportPick = input.includeTransport
    ? selectedTransportFromBudget.length
      ? {
          items: selectedTransportFromBudget,
          selectedIndexes: selectedTransportFromBudget.map((option: any) => input.transport.indexOf(option)).filter(index => index >= 0),
          cheapestPrice: lowestPrice(selectedTransportFromBudget, getCategoryPriceGetter('transport', input)),
          selectedTotalPrice: sumPrices(selectedTransportFromBudget, getCategoryPriceGetter('transport', input)),
          shownCount: selectedTransportFromBudget.length,
          status: 'fit' as const,
        }
      : deterministicPickByBudget(input.transport, budgets.transport, getCategoryPriceGetter('transport', input), 6)
    : emptyPick;
  const selectedDailyPlacesFromBudget = input.includePlaceVisits
    ? pickOnePerBudgetCategory(input.placesToVisit.filter((place: any) => place?.selectedFromBudget === true))
    : [];
  const selectedDailyVibePlace = input.includePlaceVisits ? pickOneVibePlace(input.placesToVisit) : [];
  const selectedDailyItems = mergeBudgetDailyPlaces(selectedDailyVibePlace, selectedDailyPlacesFromBudget);
  const dailyPick = input.includePlaceVisits
    ? selectedDailyPlacesFromBudget.length
      ? {
          items: selectedDailyItems,
          selectedIndexes: selectedDailyItems.map((place: any) => input.placesToVisit.indexOf(place)).filter(index => index >= 0),
          cheapestPrice: lowestPrice(selectedDailyPlacesFromBudget, getCategoryPriceGetter('dailyExpenses', input)),
          selectedTotalPrice: sumPrices(selectedDailyItems, getCategoryPriceGetter('dailyExpenses', input)),
          shownCount: selectedDailyItems.length,
          status: 'fit' as const,
        }
      : deterministicPickByBudget(input.placesToVisit, budgets.dailyExpenses, getCategoryPriceGetter('dailyExpenses', input), 12, { cumulative: true })
    : emptyPick;
  const flightStats = input.includeFlight ? priceRangeStats(flightPick.items, getCategoryPriceGetter('flights', input)) : null;
  const hotelStats = input.includeHotel ? priceRangeStats(hotelPick.items, getCategoryPriceGetter('hotels', input)) : null;
  const transportStats = input.includeTransport ? priceRangeStats(transportPick.items, getCategoryPriceGetter('transport', input)) : null;
  const dailyStats = input.includePlaceVisits ? priceRangeStats(dailyPick.items, getCategoryPriceGetter('dailyExpenses', input)) : null;
  const flightTotal = flightStats?.average ?? flightPick.selectedTotalPrice;
  const hotelTotal = hotelStats?.average ?? hotelPick.selectedTotalPrice;
  const transportTotal = sumPrices(transportPick.items, getCategoryPriceGetter('transport', input)) ?? transportPick.selectedTotalPrice;
  const dailyTotal = sumPrices(dailyPick.items, getCategoryPriceGetter('dailyExpenses', input)) ?? dailyPick.selectedTotalPrice;

  const makeDecision = (key: BudgetCategoryKey, pick: BudgetPickResult) => {
    const cheapest = pick.cheapestPrice;
    const message = pick.status === 'fit'
      ? `${BUDGET_CATEGORY_LABELS[key]} were filtered by real prices using your ${input.budgetMode === 'total' ? 'fixed total budget split' : 'category budget'}.`
      : pick.status === 'over_budget' && cheapest
        ? `${BUDGET_CATEGORY_LABELS[key]} real prices are above this budget. Cheapest found is $${Math.round(cheapest).toLocaleString()}, so more budget is needed.`
        : `No reliable ${BUDGET_CATEGORY_LABELS[key].toLowerCase()} prices were available to filter.`;
    return {
      status: pick.status,
      selectedIndexes: pick.selectedIndexes,
      message,
      examples: [`AI budget filtering failed (${errorMessage}), so deterministic price filtering was used instead.`],
    };
  };

  const categories = {
    flights: buildBudgetCategoryReport('flights', input, makeDecision('flights', flightPick), input.flights.length, flightPick.shownCount, input.includeFlight, flightTotal, flightStats),
    hotels: buildBudgetCategoryReport('hotels', input, makeDecision('hotels', hotelPick), input.hotels.length, hotelPick.shownCount, input.includeHotel, hotelTotal, hotelStats),
    transport: buildBudgetCategoryReport('transport', input, makeDecision('transport', transportPick), input.transport.length, transportPick.shownCount, input.includeTransport, transportTotal, transportStats),
    dailyExpenses: buildBudgetCategoryReport('dailyExpenses', input, makeDecision('dailyExpenses', dailyPick), input.placesToVisit.length, dailyPick.shownCount, input.includePlaceVisits, dailyTotal, dailyStats),
  };

  return {
    flights: flightPick.items,
    hotels: hotelPick.items,
    transport: transportPick.items,
    placesToVisit: dailyPick.items,
    budgetFitAgent: {
      tolerancePercent: BUDGET_TOLERANCE_PERCENT,
      modelSource: 'deterministic_fallback',
      categories,
      warnings: [errorMessage],
      summary: 'AI budget filtering was unavailable, so the planner filtered real prices deterministically against your budget.',
    },
  };
}

function buildEnabledTripSummary(input: {
  aiSummary: any;
  destinationCity: string;
  destinationCountry: string;
  tripType: string;
  nights: number;
  effectiveBudget: number;
  includeFlight: boolean;
  includeHotel: boolean;
  includeTransport: boolean;
  includePlaceVisits: boolean;
  flights: any[];
  hotels: any[];
  transport: any[];
  placesToVisit: any[];
}) {
  const destinationLabel = [input.destinationCity, input.destinationCountry].filter(Boolean).join(', ') || input.destinationCity || 'your destination';
  const tripLabel = input.tripType === 'round_trip' ? 'round-trip' : input.tripType === 'one_way' ? 'one-way' : input.tripType?.replace(/_/g, ' ') || 'trip';
  const enabledParts = [
    input.includeFlight ? `${input.flights.length} flight option${input.flights.length === 1 ? '' : 's'}` : '',
    input.includeHotel ? `${input.hotels.length} stay option${input.hotels.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  const disabledParts = [
    !input.includeFlight ? 'flights' : '',
    !input.includeHotel ? 'hotels' : '',
  ].filter(Boolean);
  const title = input.aiSummary?.title || `Your Journey to ${input.destinationCity || destinationLabel}`;
  const enabledText = enabledParts.length
    ? `The planner selected ${enabledParts.join(', ')} from real options using your enabled budget sections.`
    : 'No budget sections are enabled, so this plan is limited to the destination summary.';
  const disabledText = disabledParts.length
    ? ` Disabled sections were not used: ${disabledParts.join(', ')}.`
    : '';

  return {
    title,
    description: `This ${tripLabel} ${input.nights ? `for ${input.nights} night${input.nights === 1 ? '' : 's'} ` : ''}to ${destinationLabel} is built around your ${input.effectiveBudget ? `$${Math.round(input.effectiveBudget).toLocaleString()}` : 'selected'} budget. ${enabledText}${disabledText}`,
  };
}

async function applyGeminiBudgetFilter(input: BudgetFilterInput) {
  let aiDecision: BudgetAiDecision;
  let source = 'gemini';
  try {
    const response = await callBudgetGemini(buildBudgetAiPrompt(input));
    aiDecision = response.decision;
    source = response.source;
  } catch (error: any) {
    return buildUnavailableBudgetResult(input, error?.message || 'Gemini budget filter failed');
  }

  const flightDecision = aiDecision.categories?.flights;
  const hotelDecision = aiDecision.categories?.hotels;
  const transportDecision = aiDecision.categories?.transport;
  const dailyDecision = aiDecision.categories?.dailyExpenses;
  const budgets = buildBudgetAllocations(input);
  const emptyPick = { items: [], selectedIndexes: [], cheapestPrice: null, selectedTotalPrice: null, shownCount: 0, status: 'no_prices' as const };
  const fallbackFlights = input.includeFlight ? deterministicPickByBudget(input.flights, budgets.flights, getCategoryPriceGetter('flights', input), 9) : emptyPick;
  const fallbackHotels = input.includeHotel ? deterministicPickByBudget(input.hotels, budgets.hotels, getCategoryPriceGetter('hotels', input), 10) : emptyPick;
  const fallbackTransport = input.includeTransport ? deterministicPickByBudget(input.transport, budgets.transport, getCategoryPriceGetter('transport', input), 6) : emptyPick;
  const selectedDailyPlacesFromBudget = input.includePlaceVisits
    ? pickOnePerBudgetCategory(input.placesToVisit.filter((place: any) => place?.selectedFromBudget === true))
    : [];
  const fallbackDaily = input.includePlaceVisits ? deterministicPickByBudget(input.placesToVisit, budgets.dailyExpenses, getCategoryPriceGetter('dailyExpenses', input), 12, { cumulative: true }) : emptyPick;
  const flights = input.includeFlight ? pickAiSelectedItems(input.flights, flightDecision) : [];
  const hotels = input.includeHotel ? pickAiSelectedItems(input.hotels, hotelDecision) : [];
  const transport = input.includeTransport ? pickAiSelectedItems(input.transport, transportDecision) : [];
  const placesToVisit = input.includePlaceVisits ? pickAiSelectedItems(input.placesToVisit, dailyDecision) : [];
  const dailyAiTotal = input.includePlaceVisits ? sumPrices(placesToVisit, getCategoryPriceGetter('dailyExpenses', input)) : null;
  const dailyUpperBound = Math.round(Math.max(0, budgets.dailyExpenses) * (1 + BUDGET_TOLERANCE_PERCENT / 100));
  const dailyAiFits = placesToVisit.length > 0 && dailyAiTotal !== null && dailyAiTotal <= dailyUpperBound;
  const finalFlights = input.includeFlight ? (flights.length ? flights : fallbackFlights.items) : [];
  const finalHotels = input.includeHotel ? (hotels.length ? hotels : fallbackHotels.items) : [];
  const selectedTransportFromBudget = input.includeTransport && input.transportBudgetSelections
    ? input.transport.filter((option: any) => getTransportSelection(input, option)?.selected === true)
    : [];
  const finalTransport = input.includeTransport
    ? (selectedTransportFromBudget.length ? selectedTransportFromBudget : (transport.length ? transport : fallbackTransport.items))
    : [];
  const selectedVibePlaces = pickOneVibePlace(dailyAiFits ? placesToVisit : fallbackDaily.items);
  const finalPlacesToVisit = input.includePlaceVisits
    ? mergeBudgetDailyPlaces(
        selectedVibePlaces,
        selectedDailyPlacesFromBudget
      )
    : [];
  const finalFlightStats = input.includeFlight ? priceRangeStats(finalFlights, getCategoryPriceGetter('flights', input)) : null;
  const finalHotelStats = input.includeHotel ? priceRangeStats(finalHotels, getCategoryPriceGetter('hotels', input)) : null;
  const finalTransportStats = input.includeTransport ? priceRangeStats(finalTransport, getCategoryPriceGetter('transport', input)) : null;
  const finalDailyStats = input.includePlaceVisits ? priceRangeStats(finalPlacesToVisit, getCategoryPriceGetter('dailyExpenses', input)) : null;
  const finalFlightTotal = finalFlightStats?.average ?? null;
  const finalHotelTotal = finalHotelStats?.average ?? null;
  const finalTransportTotal = sumPrices(finalTransport, getCategoryPriceGetter('transport', input));
  const finalDailyTotal = sumPrices(finalPlacesToVisit, getCategoryPriceGetter('dailyExpenses', input));
  const flightReportDecision = flights.length ? flightDecision : { status: fallbackFlights.status, selectedIndexes: fallbackFlights.selectedIndexes, message: flightDecision?.message };
  const hotelReportDecision = hotels.length ? hotelDecision : { status: fallbackHotels.status, selectedIndexes: fallbackHotels.selectedIndexes, message: hotelDecision?.message };
  const transportReportDecision = transport.length ? transportDecision : { status: fallbackTransport.status, selectedIndexes: fallbackTransport.selectedIndexes, message: transportDecision?.message };
  const dailyReportDecision = dailyAiFits ? dailyDecision : { status: fallbackDaily.status, selectedIndexes: fallbackDaily.selectedIndexes, message: dailyDecision?.message };
  const dailySelectedTotalPrice = finalDailyTotal ?? (dailyAiFits ? dailyAiTotal : fallbackDaily.selectedTotalPrice);

  const categories = {
    flights: buildBudgetCategoryReport('flights', input, flightReportDecision, input.flights.length, finalFlights.length, input.includeFlight, finalFlightTotal, finalFlightStats),
    hotels: buildBudgetCategoryReport('hotels', input, hotelReportDecision, input.hotels.length, finalHotels.length, input.includeHotel, finalHotelTotal, finalHotelStats),
    transport: buildBudgetCategoryReport('transport', input, transportReportDecision, input.transport.length, finalTransport.length, input.includeTransport, finalTransportTotal, finalTransportStats),
    dailyExpenses: buildBudgetCategoryReport('dailyExpenses', input, dailyReportDecision, input.placesToVisit.length, finalPlacesToVisit.length, input.includePlaceVisits, dailySelectedTotalPrice, finalDailyStats),
  };

  return {
    flights: finalFlights,
    hotels: finalHotels,
    transport: finalTransport,
    placesToVisit: finalPlacesToVisit,
    budgetFitAgent: {
      tolerancePercent: BUDGET_TOLERANCE_PERCENT,
      modelSource: source,
      categories,
      warnings: Array.isArray(aiDecision.warnings) ? aiDecision.warnings.map(String) : [],
      summary: aiDecision.summary || 'Gemini filtered the real trip options against the selected budget scenario.',
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      origin, destination, tripType, departureDate, returnDate,
      destinationCity: inputDestinationCity,
      destinationCountry: inputDestinationCountry,
      destinationCountryCode: inputDestinationCountryCode,
      adults, children,
      includeFlight, includeHotel,
      hotelRooms, hotelRoomsPerApartment, budgetFlightCabins, budgetHotelStars,
      budgetMode, totalBudget, flightBudget, hotelBudget, transportBudget, dailyExpenseBudget,
      includePlaceVisits,
      dailyCategories,
      nights,
      vibes,
      mockSource: requestedMockSource,
      sessionId = null,
    } = body;
    const mockSource: 'serpapi' | 'groq' | 'deepseek' = requestedMockSource === 'groq' || requestedMockSource === 'deepseek'
      ? requestedMockSource
      : 'serpapi';
    const selectedDailyCategories = Array.isArray(dailyCategories)
      ? dailyCategories
          .filter((category: any) => category?.selected !== false)
          .map((category: any, index: number) => ({
            key: String(category?.key || category?.label || `daily_category_${index + 1}`),
            label: String(category?.label || category?.key || `Daily category ${index + 1}`),
            estimatedCost: Math.max(0, Math.round(Number(category?.estimatedCost || 0))),
            suggestedPlace: String(category?.suggestedPlace || category?.place || category?.where || '').trim(),
            suggestedPlaces: Array.isArray(category?.suggestedPlaces) ? category.suggestedPlaces : [],
            detail: String(category?.detail || '').trim(),
          }))
          .filter((category: any) => category.estimatedCost > 0)
      : [];
    const enabledInputs = {
      includeFlight: includeFlight !== false,
      includeHotel: includeHotel !== false,
      includeTransport: body.includeTransport !== false,
      includePlaceVisits: includePlaceVisits !== false && Number(dailyExpenseBudget || 0) > 0,
    };
    const selectedFlightCabins = Array.isArray(budgetFlightCabins)
      ? Array.from(new Set(
          budgetFlightCabins
            .map((cabin: any) => String(cabin).toLowerCase())
            .filter((cabin: string) => cabin === 'economy' || cabin === 'business')
        ))
      : [];
    if (selectedFlightCabins.length === 0) selectedFlightCabins.push('economy');

    const log = createPlannerLogger();
    log.start();
    log.step(1, 'Input received', {
      route: `${origin || 'origin?'} -> ${destination || 'destination?'}`,
      tripType,
      dates: { departureDate, returnDate },
      destination: {
        city: inputDestinationCity,
        country: inputDestinationCountry,
        countryCode: inputDestinationCountryCode,
      },
      travelers: { adults, children },
      stay: { nights },
      budget: { budgetMode, totalBudget, flightBudget, hotelBudget, transportBudget, dailyExpenseBudget, budgetFlightCabins: selectedFlightCabins, budgetHotelStars, ...enabledInputs },
      selectedDailyCategories,
      vibes,
    });

    // ═══════════ STEP 1: USER INPUT ═══════════
    console.log('\n\n═══════════ STEP 1: USER INPUT RECEIVED ═══════════');
    console.log('🧳 Trip type:', tripType);
    console.log('✈️ Origin:', origin);
    console.log('🏁 Destination:', destination);
    console.log('🌍 Destination city/country from input:', inputDestinationCity, '|', inputDestinationCountry, '|', inputDestinationCountryCode);
    console.log('📅 Departure date:', departureDate);
    console.log('📅 Return date:', returnDate);
    console.log('👥 Travelers:', adults, 'adults,', children, 'children');
    console.log('💰 Budget mode:', budgetMode, '| Total:', totalBudget, '| Flight:', flightBudget, '| Hotel:', hotelBudget, '| Transport:', transportBudget, '| Daily:', dailyExpenseBudget);
    console.log('🍽️ Selected daily categories:', JSON.stringify(selectedDailyCategories));
    console.log('🏨 Stay nights:', nights);
    console.log('🎨 Vibes:', JSON.stringify(vibes), '| Type:', typeof vibes, '| Is array:', Array.isArray(vibes), '| Length:', Array.isArray(vibes) ? vibes.length : 'N/A');
    console.log('═══════════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 1: Resolve destination labels without calling a non-Google flight API
    // ────────────────────────────────────────────────────────
    let destinationCity = inputDestinationCity || destination;
    let destinationCountry = inputDestinationCountry || '';
    let airportName = `${destination} Airport`;
    let countryCode = inputDestinationCountryCode || '';

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
    log.step(2, 'Destination resolved', {
      destination,
      destinationCity,
      destinationCountry,
      airportName,
      countryCode,
      coordinates: geoLat && geoLon ? { lat: geoLat, lon: geoLon } : null,
      geocodeSource: airportGeo ? 'airport' : cityGeo ? 'city' : 'none',
    });
    await emitProgress(sessionId, 12, 'Destination located');

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
    {
      const passengers = [
        ...Array(adults).fill(null).map(() => ({ type: 'adult' as const })),
        ...Array(children).fill(null).map(() => ({ type: 'child' as const })),
      ];

      const flightParams = {
        origin, destination, destinationCity, destinationCountry, departureDate, returnDate, tripType,
        adults, children, cabinClass: selectedFlightCabins[0] || body.cabinClass,
      };

      if (mockSource === 'groq' || mockSource === 'deepseek') {
        flights = await generateMockFlights(flightParams, mockSource);
      } else {
      try {
        const serpApiResults = await searchGoogleFlights({
          origin,
          destination,
          departureDate,
          returnDate,
          tripType,
          adults,
          children,
          cabinClass: selectedFlightCabins[0],
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
          .map((itinerary: any) => normalizeSerpApiItinerary(itinerary, returnDate || '', passengers))
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
                cabinClass: selectedFlightCabins[0],
                departureToken: offer.departure_token,
              });
              const returnItineraries = getSerpApiItineraries(returnResults);
              const mergedOffers = returnItineraries
                .map((returnItinerary: any) => mergeReturnSliceIntoOffer(offer, returnItinerary, passengers))
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


        for (const extraCabin of selectedFlightCabins.slice(1)) {
          try {
            console.log(`Searching additional SerpApi Google Flights cabin: ${extraCabin}`);
            const extraCabinResults = await searchGoogleFlights({
              origin,
              destination,
              departureDate,
              returnDate,
              tripType,
              adults,
              children,
              cabinClass: extraCabin,
            });
            const extraItineraries = getSerpApiItineraries(extraCabinResults);
            logSerpApiItineraries(`${extraCabin} best_flights + other_flights`, extraItineraries, returnDate || '');
            const extraFlights = extraItineraries
              .map((itinerary: any) => normalizeSerpApiItinerary(itinerary, returnDate || '', passengers))
              .filter((offer: any) => offer.slices.length > 0);
            flights = [...flights, ...extraFlights];
          } catch (extraCabinErr: any) {
            console.warn(`SerpApi ${extraCabin} flight search error:`, extraCabinErr.message);
          }
        }

        const seenFlightKeys = new Set<string>();
        flights = flights.filter((flight: any) => {
          const routeKey = (flight?.slices || []).map((slice: any) =>
            (slice?.segments || []).map((segment: any) => [
              segment?.origin?.iata_code,
              segment?.destination?.iata_code,
              segment?.departing_at,
              segment?.cabin_class,
            ].join('-')).join('_')
          ).join('|');
          const key = [flight?.owner?.name || '', flight?.total_amount || '', routeKey].join('|');
          if (seenFlightKeys.has(key)) return false;
          seenFlightKeys.add(key);
          return true;
        });

        console.log('✈️ Normalized SerpApi flights returned to handler:', flights.length);
        const flightCountBeforePriceFilter = flights.length;
        flights = flights.filter((flight: any) => parseFlightPriceValue(flight?.display_price ?? flight?.total_amount ?? flight?.price) !== null);
        const removedUnpricedFlights = flightCountBeforePriceFilter - flights.length;
        if (removedUnpricedFlights > 0) {
          console.log(`✈️ Removed ${removedUnpricedFlights} flight option(s) with unavailable provider prices`);
        }

        flights.forEach((flight: any, flightIndex: number) => logNormalizedFlightCard(flight, flightIndex));
      } catch (flightErr: any) {
        console.error('SerpApi flight search error:', flightErr.message);
      }
      }
    }

    // ═══════════ STEP 3: FLIGHT SEARCH ═══════════
    console.log('═══════════ STEP 3: FLIGHT SEARCH ═══════════');
    console.log('✈️ Flights API response — total results:', flights.length);
    console.log('════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 4: Fetch REAL hotels from SerpApi Google Hotels
    //         Anchored to the destination city and travel dates
    // ────────────────────────────────────────────────────────
    log.step(3, 'Flights fetched from SerpApi', {
      count: flights.length,
      prices: flights
        .map((flight: any) => getNormalizedFlightPrice(flight))
        .filter((price: number | null): price is number => price !== null)
        .slice(0, 10),
    });
    await emitProgress(sessionId, 30, 'Flights found');

    let hotels: any[] = [];
    {
      if (mockSource === 'groq' || mockSource === 'deepseek') {
        hotels = await generateMockHotels({
          origin, destination, destinationCity, destinationCountry, departureDate, returnDate, tripType,
          adults, children, nights: Number(nights) || 1, hotelStars: Number(body.hotelStars) || 3,
          hotelRooms: Number(hotelRooms) || 1, hotelRoomsPerApartment: Number(hotelRoomsPerApartment) || 1,
        }, mockSource);
      } else {
      try {
        const selectedHotelStars = Array.isArray(budgetHotelStars)
          ? budgetHotelStars.map((star: any) => Math.round(Number(star))).filter((star: number) => star >= 1 && star <= 5)
          : [];
        const appliedHotelStar = selectedHotelStars.length
          ? Math.max(...selectedHotelStars)
          : Math.max(1, Math.min(5, Math.round(Number(body.hotelStars) || 3)));
        const apartmentCount = Math.max(1, Number(hotelRooms) || 1);
        const roomsPerApartment = Math.max(1, Number(hotelRoomsPerApartment) || 1);
        const stayNights = Math.max(1, Number(nights) || 1);
        const roomText = roomsPerApartment > 1 ? `${roomsPerApartment} bedroom apartment` : 'apartment hotel';
        const hotelStarSearchOrder = [
          appliedHotelStar,
          ...HOTEL_STAR_OPTIONS.filter(star => star !== appliedHotelStar),
        ];
        const hotelQuery = [destinationCity, destinationCountry, `${appliedHotelStar} star`, roomText].filter(Boolean).join(' ');
        const searchAsVacationRental = roomsPerApartment > 1;
        const checkInDate = departureDate;
        const checkOutDate = (() => {
          const outDate = new Date(departureDate);
          const hotelNights = stayNights;
          outDate.setDate(outDate.getDate() + hotelNights);
          return outDate.toISOString().split('T')[0];
        })();

        console.log(`\n🏨 SERPAPI HOTEL SEARCH — query="${hotelQuery}" | ${checkInDate} → ${checkOutDate} | ${stayNights} night(s) | ${apartmentCount} apartment(s), ${roomsPerApartment} room(s) inside each | travelers: ${adults} adult(s), ${children} child(ren)`);

        const serpApiHotelResults = await searchGoogleHotels({
          query: hotelQuery,
          checkInDate,
          checkOutDate,
          adults,
          children,
          countryCode: countryCode || 'us',
          bedrooms: roomsPerApartment,
          hotelClass: searchAsVacationRental ? undefined : appliedHotelStar,
          vacationRentals: searchAsVacationRental,
        });

        console.log('🏨 SerpApi hotel raw response keys:', Object.keys(serpApiHotelResults || {}));
        console.log('🏨 SerpApi hotel status:', serpApiHotelResults?.search_metadata?.status || 'N/A');
        console.log('🏨 SerpApi total results:', serpApiHotelResults?.search_information?.total_results ?? 'N/A');
        if (serpApiHotelResults?.search_information?.hotels_results_state) {
          console.log('🏨 Results state:', serpApiHotelResults.search_information.hotels_results_state);
        }

        const hotelProperties = Array.isArray(serpApiHotelResults?.properties) ? serpApiHotelResults.properties : [];
        const hotelAds = Array.isArray(serpApiHotelResults?.ads) ? serpApiHotelResults.ads : [];
        let allHotelResults = [...hotelProperties, ...hotelAds].slice(0, 20);

        console.log(`🏨 SerpApi properties/ads returned: ${allHotelResults.length} result(s)`);

        const supplementalStars = hotelStarSearchOrder.filter(star => star !== appliedHotelStar);
        if (supplementalStars.length > 0) {
          console.log(`ðŸ¨ Checking supplemental hotel star buckets: ${supplementalStars.join(', ')}`);
          const supplementalSearches = await Promise.allSettled(
            supplementalStars.map(async star => {
              const query = [destinationCity, destinationCountry, `${star} star`, roomText].filter(Boolean).join(' ');
              const results = await searchGoogleHotels({
                query,
                checkInDate,
                checkOutDate,
                adults,
                children,
                countryCode: countryCode || 'us',
                bedrooms: roomsPerApartment,
                hotelClass: star,
                vacationRentals: false,
              });
              return { star, query, results };
            })
          );
          const seenHotelKeys = new Set(allHotelResults.map(getSerpApiHotelKey).filter(Boolean));

          supplementalSearches.forEach(result => {
            if (result.status === 'rejected') {
              console.error('ðŸ¨ Supplemental SerpApi hotel search failed:', result.reason?.message || result.reason);
              return;
            }

            const hotelProperties = Array.isArray(result.value.results?.properties) ? result.value.results.properties : [];
            const hotelAds = Array.isArray(result.value.results?.ads) ? result.value.results.ads : [];
            const bucketResults = [...hotelProperties, ...hotelAds];
            console.log(`ðŸ¨ Supplemental ${result.value.star}-star hotel bucket returned: ${bucketResults.length} result(s)`);

            for (const property of bucketResults) {
              const key = getSerpApiHotelKey(property);
              if (key && seenHotelKeys.has(key)) continue;
              if (key) seenHotelKeys.add(key);
              allHotelResults.push(property);
            }
          });

          allHotelResults = allHotelResults.slice(0, 50);
          console.log(`ðŸ¨ SerpApi hotel merged results after 1-5 star check: ${allHotelResults.length} result(s)`);
        }

        hotels = allHotelResults
          .filter((property: any) => property?.name)
          .filter((property: any) => isHotelInDestination(property, destinationCity, destinationCountry, destination, geoLat, geoLon))
          .map((property: any, idx: number) => mapSerpApiHotelToResult(property, idx, destinationCity, stayNights, apartmentCount, roomsPerApartment))
          .slice(0, 10);

        if (hotels.length > 0) {
          console.log(`🏨 SERPAPI HOTEL CARD LOGS — ${hotels.length} hotel(s)`);
          hotels.forEach((hotel: any, index: number) => logHotelProperty(hotel.raw || hotel, index));
        } else {
          console.log('🏨 No SerpApi hotel results matched the current filters');
        }
      } catch (hotelErr: any) {
        console.error('SerpApi hotel search error:', hotelErr.message);
      }
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
        ];
      }
    }

    // ═══════════ STEP 4: HOTEL SEARCH ═══════════
    console.log('═══════════ STEP 4: HOTEL SEARCH ═══════════');
    console.log('🏨 Hotels API response — total results after filtering:', hotels.length);
    console.log('════════════════════════════════════════════\n');

    // ────────────────────────────────────────────────────────
    // STEP 5: Fetch nearby attractions via LocationIQ
    //         Anchored to CITY CENTER coordinates
    // ────────────────────────────────────────────────────────
    log.step(4, 'Hotels fetched from SerpApi', {
      count: hotels.length,
      source: hotels.length > 0 ? hotels[0].source : 'none',
      prices: hotels.slice(0, 10).map((hotel: any) => ({
        name: hotel?.name,
        nightly: hotel?.price,
        totalStay: getHotelStayPrice(hotel, Math.max(1, Number(nights) || 1), 1),
      })),
    });
    await emitProgress(sessionId, 52, 'Hotels matched');

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
    log.step(5, 'Nearby POIs prepared', {
      coordinates: geoLat && geoLon ? { lat: geoLat, lon: geoLon } : null,
      count: nearbyAttractions.length,
      sample: nearbyAttractions.slice(0, 5).map((place: any) => ({
        name: place?.name,
        type: place?.type,
        distance: place?.distance,
      })),
    });
    await emitProgress(sessionId, 62, 'Points of interest ready');

    let destinationImages: any[] = [];
    try {
      const imageQuery = [destinationCity, destinationCountry, 'official tourism landmark skyline city view'].filter(Boolean).join(' ');
      destinationImages = await searchGoogleImagesLight({
        query: imageQuery,
        location: destinationCity && destinationCountry ? `${destinationCity}, ${destinationCountry}` : destinationCity || destinationCountry,
        countryCode: countryCode || inputDestinationCountryCode || 'us',
        limit: 8,
      });
      log.step(6, 'Destination images fetched from SerpApi Google Images', {
        query: imageQuery,
        count: destinationImages.length,
        sample: destinationImages.slice(0, 3).map((image: any) => ({
          title: image.title,
          source: image.source,
        })),
      });
    } catch (imageErr: any) {
      console.warn('SerpApi Google Images search error:', imageErr.message);
      log.warn('Destination image search failed', imageErr.message);
    }
    await emitProgress(sessionId, 70, 'Images loaded');

    let transport: any[] = [];
    {
      const prefetchedTransport = Array.isArray(body.transportOptions)
        ? body.transportOptions.filter((option: any) => option?.available !== false)
        : [];
      const allTransport: any[] = prefetchedTransport.length
        ? prefetchedTransport
        : [
            { id: 't1', type: 'bus', operator: 'Elite Express', price: 85, duration: '1h 30m', class: 'First Class', amenities: ['WiFi', 'Reclining Seats', 'Power Outlets', 'Refreshments'], location: `${destinationCity} Central Station`, transportType: 'private_car' },
            { id: 't2', type: 'bus', operator: 'Royal Coach', price: 45, duration: '2h 15m', class: 'Business', amenities: ['WiFi', 'Snacks', 'Extra Legroom'], location: `${destinationCity} North Terminal`, transportType: 'shared_shuttle' },
            { id: 't3', type: 'bus', operator: 'Skyline Transit', price: 25, duration: '3h 00m', class: 'Standard', amenities: ['WiFi', 'USB Charging'], location: `${destinationCity} Downtown Hub`, transportType: 'bus' },
            { id: 't4', type: 'bus', operator: 'Metro Rail Express', price: 35, duration: '1h 45m', class: 'Standard Plus', amenities: ['WiFi', 'Power Outlets', 'Scenic Route'], location: `${destinationCity} Rail Terminal`, transportType: 'train' },
          ];

      transport = prefetchedTransport.length
        ? allTransport
        : allTransport;
      if (transport.length === 0) transport = allTransport.slice(0, 2);

      transport.sort((a, b) => (a.estimatedPrice ?? a.price ?? Infinity) - (b.estimatedPrice ?? b.price ?? Infinity));
    }

    // ────────────────────────────────────────────────────────
    // STEP 7: Validate nights + compute effective budget
    //         (Budget breakdown moved to AFTER Gemini so hotel
    //          prices reflect destination-aware Gemini estimates)
    // ────────────────────────────────────────────────────────
    log.step(6, 'Transport options prepared', {
      count: transport.length,
      source: Array.isArray(body.transportOptions) && body.transportOptions.length ? 'wizard_prefetch' : 'route_fallback',
      sample: transport.slice(0, 8).map((option: any) => ({
        name: option?.displayName || option?.operator || option?.type,
        type: option?.id || option?.transportType || option?.type,
        price: getTransportOptionPrice(option),
        priceLabel: option?.priceLabel,
      })),
    });

    const effectiveBudget = budgetMode === 'total'
      ? totalBudget
      : (
          (enabledInputs.includeFlight ? Number(flightBudget) || 0 : 0) +
          (enabledInputs.includeHotel ? Number(hotelBudget) || 0 : 0) +
          (enabledInputs.includeTransport ? Number(transportBudget) || 0 : 0) +
          (enabledInputs.includePlaceVisits ? Number(dailyExpenseBudget) || 0 : 0)
        );
    // Use the user-provided nights from the wizard (no hardcoded fallback)
    const tripNights = typeof nights === 'number' && nights > 0 ? nights : null;
    if (tripNights === null) {
      return NextResponse.json({ error: 'Missing or invalid nights value. Please select the number of nights in the Stay step.' }, { status: 400 });
    }

    const travelerCount = Math.max(1, (Number(adults) || 0) + (Number(children) || 0));
    log.step(7, 'Budget validated', {
      budgetMode,
      effectiveBudget,
      totalBudget,
      categoryBudgets: { flightBudget, hotelBudget, transportBudget, dailyExpenseBudget },
      travelers: travelerCount,
      nights: tripNights,
    });

    // ────────────────────────────────────────────────────────
    // STEP 8: Call Gemini AI — with STRICT location anchoring
    // ────────────────────────────────────────────────────────
    let aiSummary = null;
    let placesToVisit: any[] = [];
    let upsellOptions: any[] = [];
    log.step(8, 'Travel content AI started', {
      model: 'gemini-2.5-flash',
      fallback: 'gemini_key_2_then_groq',
      inputs: {
        flights: flights.length,
        hotels: hotels.length,
        transport: transport.length,
        nearbyAttractions: nearbyAttractions.length,
        vibes,
      },
    });
    await emitProgress(sessionId, 75, 'AI crafting your summary...');

    try {
      // Build context from REAL LocationIQ data
      const hasVibes = vibes && Array.isArray(vibes) && vibes.length > 0;
      const mainCountryLabel = destinationCountry || countryCode || 'the destination country';
      const targetAreaLabel = `${destinationCity}, ${mainCountryLabel}`;
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
      const selectedDailyCategoryLines = selectedDailyCategories.map((category: any, index: number) => {
        const detail = category.detail ? ` - ${category.detail}` : '';
        return `${index + 1}. ${category.label}: $${category.estimatedCost} per traveler/day${detail}`;
      });
      const selectedDailyCategoryLabels = selectedDailyCategories.map((category: any) => category.label).join(', ');

      // When vibes are selected, COMPLETELY OMIT LocationIQ POI data to prevent Gemini from
      // picking aviation/transport museums that happen to be near the airport.
      const attractionContext = hasVibes
        ? `\n\nIMPORTANT: Ignore any nearby POI data. Use your own knowledge to suggest places in ${targetAreaLabel} that match ONLY the user's selected vibes listed above.`
        : nearbyAttractions.length > 0
          ? `\n\nREAL VERIFIED ATTRACTIONS found via GPS within ${destinationCity} (lat: ${geoLat}, lon: ${geoLon}):\n${nearbyAttractions.map((a, i) => `${i + 1}. "${a.name}" (${a.type}) — ${a.distance}, GPS: ${a.lat},${a.lon}`).join('\n')}\n\nYou MUST use these real GPS-verified places as the primary basis for "placesToVisit". You may add 1-2 additional WELL-KNOWN landmarks that are definitely in ${destinationCity}, ${destinationCountry}, but DO NOT invent or hallucinate places.`
          : `\n\nNo GPS-verified attractions data available. For "placesToVisit", ONLY suggest well-known, real landmarks and attractions that are definitely located within ${destinationCity}, ${destinationCountry}. Do NOT suggest places from other cities or countries.`;

      console.log(`\n📍 PLACES DATA SOURCE: ${hasVibes ? 'gemini-only (LocationIQ data OMITTED because vibes are active)' : nearbyAttractions.length > 0 ? 'combined (LocationIQ POIs fed to Gemini)' : 'gemini-only (no LocationIQ data available)'}`);

      const hotelContext = hotels.length > 0
        ? `\n\nREAL HOTELS found within 20km of ${destinationLabel} (lat: ${geoLat}, lon: ${geoLon}):\n${hotels.map((h, i) => `${i + 1}. "${h.name}" — ${h.rating}-star, $${h.price}/night, located at ${h.location}`).join('\n')}`
        : '';

      const selectedDailyCategoryContext = selectedDailyCategories.length
        ? `\n\nUSER SELECTED DAILY SPENDING CATEGORIES FROM THE BUDGET STEP:\n${selectedDailyCategoryLines.join('\n')}\n\nThese categories are already added by the server as the budget spending section. Do NOT duplicate them as generic placesToVisit items with names like "Breakfast", "Coffee", "Lunch", or similar category-only labels.\n\nUse these categories only as cost guidance for the separate placesToVisit results you generate:\n- If a vibe place/activity naturally matches a daily category, set estimatedCost near that category's per traveler/day budget.\n- If it does not match a daily category, use a realistic visitor cost for that activity.\n- The category list is dynamic; do not assume breakfast, coffee, museum, beach, or any fixed list unless those exact labels are present above.`
        : '';

      const vibeFilter = hasVibes
        ? `
*** MOST IMPORTANT INSTRUCTION - VIBE FILTER ***
The user has selected these travel vibes: ${vibeLabels}

Vibes are the source for the separate Places to Visit section.
${selectedDailyCategories.length ? `Daily spending categories selected in the budget step: ${selectedDailyCategoryLabels}. Those categories are displayed separately, so do not return category-only rows. Generate real vibe-matching places/activities, using the daily categories only to estimate costs when they naturally apply.` : 'No daily spending categories were selected, so choose places using the selected vibes only.'}

You MUST return places that match the selected travel vibes. Here is what each vibe means:
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
${selectedDailyCategories.length ? 'Do not duplicate the daily spending category rows. Return real places or concrete activities for the selected vibes.' : ''}
If you are unsure whether a place matches, do NOT include it.
`
        : '';
      const prompt = fillPromptTemplate(loadPromptTemplate('generate-trip-concierge.txt'), {
        TARGET_AREA_LABEL: targetAreaLabel,
        MAIN_COUNTRY_LABEL: mainCountryLabel,
        AIRPORT_NAME: airportName,
        DESTINATION: destination,
        DESTINATION_CITY: destinationCity,
        GEO_LAT: geoLat,
        GEO_LON: geoLon,
        VIBE_FILTER: vibeFilter,
        ORIGIN: origin,
        TRIP_TYPE: tripType,
        DEPARTURE_DATE: departureDate,
        RETURN_DATE_TEXT: returnDate ? ` / Return: ${returnDate}` : '',
        ADULTS: adults,
        CHILDREN: children,
        EFFECTIVE_BUDGET: effectiveBudget.toLocaleString(),
        BUDGET_MODE_LABEL: budgetMode === 'total' ? 'AI-allocated' : 'per-category',
        TRIP_NIGHTS: tripNights,
        TRIP_NIGHTS_SUFFIX: tripNights === 1 ? '' : 's',
        FLIGHT_COUNT: flights.length,
        MIN_FLIGHT_PRICE: flights.length > 0 ? Math.min(...flights.map((f: any) => parseFloat(f.total_amount))).toLocaleString() : '0',
        MAX_FLIGHT_PRICE: flights.length > 0 ? Math.max(...flights.map((f: any) => parseFloat(f.total_amount))).toLocaleString() : '0',
        HOTEL_CONTEXT: hotelContext,
        ATTRACTION_CONTEXT: `${attractionContext}${selectedDailyCategoryContext}`,
        SUMMARY_TITLE_AREA: destinationCity,
        PLACES_VIBE_RULE: hasVibes ? ` CRITICAL: Each place MUST match one of these vibes: ${vibes.join(', ')}. Do NOT return aviation museums, transport museums, aircraft exhibitions, or motorcycle museums. ONLY return places matching the selected vibes.` : '',
      });

      // ═══════════ STEP 6: GEMINI PROMPT CONSTRUCTION ═══════════
      console.log('\n═══════════ STEP 6: GEMINI PROMPT CONSTRUCTION ═══════════');
      console.log('🤖 Variables injected into prompt:');
      console.log('   - Destination city:', destinationCity);
      console.log('   - Main country:', mainCountryLabel);
      console.log('   - Target area:', targetAreaLabel);
      console.log('   - Coordinates:', geoLat, geoLon);
      console.log('   - Effective budget: $' + effectiveBudget);
      console.log('   - Stay nights:', tripNights);
      console.log('   - Vibes:', JSON.stringify(vibes));
      console.log('   - Has vibes:', hasVibes);
      console.log('   - Flights count passed:', flights.length);
      console.log('   - Hotels count passed:', hotels.length);
      console.log('   - POIs count passed:', nearbyAttractions.length);
      console.log('   - LocationIQ data omitted?:', hasVibes);
      log.info('Travel AI prompt prepared', { characters: prompt.length });
      if (process.env.DEBUG_FULL_AI_PROMPTS === 'true') {
        console.log(prompt);
      }
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
      const primaryKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
      const secondaryKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY_V2 || '';
      const groqKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || '';

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
                    messages: [{ role: 'user', content: prompt }],
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
              console.error('❌ No NEXT_PUBLIC_GROQ_API_KEY configured — falling back to hardcoded response');
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
                  messages: [{ role: 'user', content: prompt }],
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
      placesToVisit = mergeBudgetDailyPlaces(
        dedupedPlaces.map(({ _vibeScore, lat, lon, distance, geoSource, geoStatus, _geoOk, _geoDistanceKm, ...rest }: any) => rest),
        enabledInputs.includePlaceVisits ? buildDailyCategoryPlaces(selectedDailyCategories, destinationCity) : []
      );

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
          estimatedCost: 0,
          source: 'locationiq_nearby_attraction',
        }));
      } else {
        placesToVisit = [];
      }
      upsellOptions = [
        { extraAmount: 100, title: 'Better Hotel', description: 'Upgrade to a higher-rated hotel with more amenities.' },
        { extraAmount: 250, title: 'Premium Cabin', description: 'Switch to a premium cabin class for a more comfortable flight.' },
        { extraAmount: 500, title: 'Full Luxury Package', description: 'Unlock first-class flights, 5-star hotels, and private transfers.' },
      ];
    }

    if (enabledInputs.includePlaceVisits && selectedDailyCategories.length) {
      placesToVisit = mergeBudgetDailyPlaces(
        placesToVisit,
        buildDailyCategoryPlaces(selectedDailyCategories, destinationCity)
      );
    }

    // NOTE: We do not request or apply AI-provided hotel pricing anymore; keep hotel prices from SerpApi/fallback.
    log.step(9, 'Travel content AI finished', {
      aiSummaryTitle: aiSummary?.title || null,
      placesToVisit: placesToVisit.length,
      upsellOptions: upsellOptions.length,
    });
    await emitProgress(sessionId, 88, 'Summary complete');
    log.step(10, 'Gemini budget filter started', {
      sourceOptions: {
        flights: flights.length,
        hotels: hotels.length,
        transport: transport.length,
        placesToVisit: placesToVisit.length,
      },
      budgetMode,
      tolerancePercent: BUDGET_TOLERANCE_PERCENT,
    });
    const budgetSourceOptions = {
      flights,
      hotels,
      transport,
      placesToVisit,
    };
    const selectedHotelStarsForBudget = Array.isArray(budgetHotelStars)
      ? budgetHotelStars.map((star: any) => Math.round(Number(star))).filter((star: number) => star >= 1 && star <= 5)
      : [];
    const appliedHotelStarsForBudget = selectedHotelStarsForBudget.length
      ? selectedHotelStarsForBudget
      : [Math.max(1, Math.min(5, Math.round(Number(body.hotelStars) || 3)))];
    const budgetMatchedFlights = selectedFlightCabins.length
      ? flights.filter((flight: any) => (selectedFlightCabins as string[]).includes(getBudgetFlightCabin(flight)))
      : flights;
    const budgetMatchedHotels = appliedHotelStarsForBudget.length
      ? hotels.filter((hotel: any) => appliedHotelStarsForBudget.includes(getBudgetHotelStarCount(hotel)))
      : hotels;
    const budgetFit = await applyGeminiBudgetFilter({
      flights: enabledInputs.includeFlight ? budgetMatchedFlights : [],
      hotels: enabledInputs.includeHotel ? budgetMatchedHotels : [],
      transport: enabledInputs.includeTransport ? transport : [],
      placesToVisit: enabledInputs.includePlaceVisits ? placesToVisit : [],
      includeFlight: enabledInputs.includeFlight,
      includeHotel: enabledInputs.includeHotel,
      includeTransport: enabledInputs.includeTransport,
      includePlaceVisits: enabledInputs.includePlaceVisits,
      budgetMode: budgetMode === 'per_category' ? 'per_category' : 'total',
      totalBudget: Number(totalBudget) || 0,
      flightBudget: Number(flightBudget) || 0,
      hotelBudget: Number(hotelBudget) || 0,
      transportBudget: Number(transportBudget) || 0,
      transportBudgetSelections: body.transportBudgetSelections || {},
      dailyExpenseBudget: Number(dailyExpenseBudget) || 0,
      nights: tripNights,
      hotelRooms: Math.max(1, Number(hotelRooms) || 1),
      travelers: travelerCount,
      origin,
      destination,
      destinationCity,
      destinationCountry,
      tripType,
      departureDate,
      returnDate,
      vibes,
    });
    flights = budgetFit.flights;
    hotels = budgetFit.hotels;
    transport = budgetFit.transport;
    placesToVisit = budgetFit.placesToVisit;
    aiSummary = buildEnabledTripSummary({
      aiSummary,
      destinationCity,
      destinationCountry,
      tripType,
      nights: tripNights,
      effectiveBudget,
      ...enabledInputs,
      flights,
      hotels,
      transport,
      placesToVisit,
    });
    log.step(11, 'Gemini budget filter finished', {
      modelSource: budgetFit.budgetFitAgent.modelSource,
      selected: {
        flights: flights.length,
        hotels: hotels.length,
        transport: transport.length,
        placesToVisit: placesToVisit.length,
      },
      warnings: budgetFit.budgetFitAgent.warnings,
      summary: budgetFit.budgetFitAgent.summary,
    });
    await emitProgress(sessionId, 95, 'Budget optimized');

    // ────────────────────────────────────────────────────────
    // STEP 8c: Calculate budget breakdown from the same allocations used by filtering
    // ────────────────────────────────────────────────────────
    const finalBudgetAllocations = buildBudgetAllocations({
      flights,
      hotels,
      transport,
      placesToVisit,
      includeFlight: enabledInputs.includeFlight,
      includeHotel: enabledInputs.includeHotel,
      includeTransport: enabledInputs.includeTransport,
      includePlaceVisits: enabledInputs.includePlaceVisits,
      budgetMode: budgetMode === 'per_category' ? 'per_category' : 'total',
      totalBudget: Number(totalBudget) || 0,
      flightBudget: Number(flightBudget) || 0,
      hotelBudget: Number(hotelBudget) || 0,
      transportBudget: Number(transportBudget) || 0,
      transportBudgetSelections: body.transportBudgetSelections || {},
      dailyExpenseBudget: Number(dailyExpenseBudget) || 0,
      nights: tripNights,
      hotelRooms: Math.max(1, Number(hotelRooms) || 1),
      travelers: travelerCount,
      origin,
      destination,
      destinationCity,
      destinationCountry,
      tripType,
      departureDate,
      returnDate,
      vibes,
    });
    const breakdownTotal = Object.values(finalBudgetAllocations).reduce((sum, value) => sum + value, 0);
    const budgetBreakdown = {
      ...finalBudgetAllocations,
      nights: tripNights,
      totalBudget: breakdownTotal || effectiveBudget,
      mode: budgetMode === 'per_category' ? 'per_category' : 'fixed_total_split',
    };

    // ═══════════ STEP 9: FINAL RESPONSE TO FRONTEND ═══════════
    log.step(12, 'Budget breakdown calculated', budgetBreakdown);

    const finalResponse = {
      flights,
      hotels,
      transport,
      budgetBreakdown,
      budgetFitAgent: budgetFit.budgetFitAgent,
      budgetSourceOptions,
      destinationImages,
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
    log.step(13, 'Final response ready', {
      flights: flights.length,
      hotels: hotels.length,
      transport: transport.length,
      placesToVisit: placesToVisit.length,
      upsellOptions: upsellOptions.length,
      responseBytes: JSON.stringify(finalResponse).length,
    });
    log.done({ status: 'ok' });

    await emitProgress(sessionId, 100, 'Trip ready!');
    return NextResponse.json(finalResponse);
  } catch (error: any) {
    console.error('Planner API Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate trip plan' }, { status: 500 });
  }
}




