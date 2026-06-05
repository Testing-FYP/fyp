import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { searchSerpApiFlights } from '../../google-api/google-flights';
import { searchSerpApiHotels } from '../../google-api/google-hotels';

const MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 40000;

type TransportEstimateResult = {
  transportPerPersonPerDay: number;
  source: string;
  sampleCount: number;
  selectedModes: string[];
};

function readEnvValue(name: string) {
  if (process.env[name]) return process.env[name];

  try {
    const envPath = path.join(process.cwd(), '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const line = envFile
      .split(/\r?\n/)
      .map(raw => raw.trim())
      .find(raw => {
        const normalized = raw.startsWith('#') ? raw.slice(1).trim() : raw;
        return normalized.startsWith(`${name}=`);
      });

    if (!line) return '';
    const normalized = line.startsWith('#') ? line.slice(1).trim() : line;
    return normalized.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
  } catch {
    return '';
  }
}

function readPositiveNumber(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const parsed = readPositiveNumber(item);
      if (parsed !== null) return parsed;
    }
  }
  if (value && typeof value === 'object') {
    return firstPositiveNumber(
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

function firstPositiveNumber(...values: any[]) {
  for (const value of values) {
    const parsed = readPositiveNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function median(values: number[]) {
  const sorted = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function getTransportDailyAllocation(option: any) {
  const price = readPositiveNumber(option?.estimatedPrice);
  if (price === null) return null;

  const mode = String(option?.id || option?.transportType || option?.type || '').trim();
  if (mode === 'rental_car') return price;
  if (mode === 'taxi' || mode === 'rideshare_uber') return Math.round(price * 2);
  if (mode === 'train') return price;
  return Math.round(price * 2);
}

function addDays(dateValue: string, days: number) {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) date.setTime(Date.now());
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getFlightPrices(response: any) {
  const itineraries = [
    ...(Array.isArray(response?.best_flights) ? response.best_flights : []),
    ...(Array.isArray(response?.other_flights) ? response.other_flights : []),
  ];

  return itineraries
    .map((itinerary: any) => firstPositiveNumber(
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
      itinerary?.price_insights?.price,
      itinerary?.price_insights?.lowest_price
    ))
    .filter((price): price is number => typeof price === 'number');
}

function getHotelNightlyPrices(response: any, nights: number) {
  const properties = [
    ...(Array.isArray(response?.properties) ? response.properties : []),
    ...(Array.isArray(response?.ads) ? response.ads : []),
  ];

  return properties
    .map((property: any) => {
      const offerPrices = Array.isArray(property?.prices)
        ? property.prices.flatMap((price: any) => [price?.extracted_price, price?.price, price?.rate_per_night, price?.total_rate])
        : [];
      const nightly = firstPositiveNumber(
        property?.rate_per_night?.extracted_lowest,
        property?.rate_per_night?.lowest,
        property?.extracted_price,
        property?.price,
        property?.displayed_price,
        property?.price_from,
        ...offerPrices
      );
      const total = firstPositiveNumber(
        property?.total_rate?.extracted_lowest,
        property?.total_rate?.lowest,
        property?.extracted_total_price,
        property?.total_price,
        property?.total,
        property?.price_total
      );
      return nightly ?? (total && nights > 0 ? Math.round(total / nights) : null);
    })
    .filter((price): price is number => typeof price === 'number');
}

function stripJsonFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function parseJsonObject(text: string) {
  const stripped = stripJsonFences(text);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  const json = start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
  return JSON.parse(json);
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function callGeminiForDailyCosts(apiKey: string, prompt: string) {
  if (!apiKey) throw new Error('Gemini API key is not configured');
  const ai = new GoogleGenAI({ apiKey });
  console.log('[Budget estimates] Gemini grounded request started');
  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        tools: [{ googleSearch: {} }],
      },
    } as any),
    REQUEST_TIMEOUT_MS
  );
  const parsed = parseJsonObject(response.text || '{}');
  const placeVisitCost = readPositiveNumber(parsed.placeVisitCost);
  if (placeVisitCost === null) {
    throw new Error('Gemini returned missing placeVisitCost');
  }
  if (placeVisitCost === 35 && String(parsed.currencyNote || '').toLowerCase().includes('short note')) {
    throw new Error('Gemini copied placeholder values instead of estimating current destination costs');
  }
  console.log('[Budget estimates] Gemini grounded response parsed:', {
    placeVisitCost,
    currencyNote: String(parsed.currencyNote || ''),
    basis: String(parsed.basis || ''),
  });
  return {
    placeVisitCost,
    currencyNote: String(parsed.currencyNote || ''),
  };
}

async function getGeminiDailyCosts(prompt: string) {
  const keys = [
    { name: 'gemini_key_1_grounded', value: readEnvValue('GEMINI_API_KEY') || readEnvValue('NEXT_PUBLIC_GEMINI_API_KEY') },
    { name: 'gemini_key_2_grounded', value: readEnvValue('GEMINI_API_KEY_2') },
    { name: 'gemini_key_3_grounded', value: readEnvValue('GEMINI_API_KEY_3') },
  ];

  for (const key of keys) {
    try {
      console.log(`[Budget estimates] Trying ${key.name}`);
      const values = await callGeminiForDailyCosts(key.value, prompt);
      console.log(`[Budget estimates] Success via ${key.name}`);
      return { ...values, source: key.name };
    } catch (error: any) {
      console.error(`[Budget estimates] ${key.name} failed: ${error?.message || error}`);
    }
  }

  return {
    placeVisitCost: 25,
    currencyNote: '',
    source: 'static_fallback',
  };
}

async function getPlannerTransportAverage(request: Request, body: any): Promise<TransportEstimateResult> {
  if (body?.allowTransportLookup !== true || body?.stepContext !== 'budget') {
    console.log('[Budget estimates] Step 3a skipped: transport lookup not allowed for this wizard step');
    return {
      transportPerPersonPerDay: 20,
      source: 'transport_lookup_blocked',
      sampleCount: 0,
      selectedModes: [],
    };
  }

  const requestOrigin = new URL(request.url).origin;
  console.log('[Budget estimates] Step 3a: Fetching planner transport route average...');

  const response = await withTimeout(
    fetch(`${requestOrigin}/api/planner/transport`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination: body.destination,
        destinationCity: body.destinationCity || body.destination,
        destinationCountry: body.destinationCountry || '',
        transportPriority: 'cheapest',
      }),
    }),
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Planner transport HTTP ${response.status}: ${await response.text()}`);
  }

  const json = await response.json();
  const options = Array.isArray(json?.options) ? json.options : [];
  const selectedModes: string[] = [];
  const selectedSet = new Set(selectedModes);
  const matchingOptions = options.filter((option: any) => {
    if (!option?.available) return false;
    const mode = String(option.id || option.transportType || option.type);
    if (selectedSet.size) return selectedSet.has(mode);
    return mode !== 'rental_car';
  });
  const pricedOptions = matchingOptions
    .map((option: any) => getTransportDailyAllocation(option))
    .filter((price: number | null): price is number => typeof price === 'number' && price > 0);

  const average = median(pricedOptions);
  if (average === null) {
    throw new Error('Planner transport route returned no usable transport prices');
  }

  const result = {
    transportPerPersonPerDay: average,
    source: json?.dataSource ? `planner_transport_${json.dataSource}` : 'planner_transport',
    sampleCount: pricedOptions.length,
    selectedModes: selectedModes.length ? selectedModes : matchingOptions.map((option: any) => String(option.id || option.transportType || option.type)).filter(Boolean),
  };

  console.log('[Budget estimates] Step 3a complete:', result);
  return result;
}

function buildDailyCostPrompt(body: any) {
  const destination = [body.destinationCity || body.destination, body.destinationCountry].filter(Boolean).join(', ') || 'the destination';
  const dates = [body.departureDate, body.returnDate].filter(Boolean).join(' to ') || 'the selected travel dates';
  const vibes = Array.isArray(body.vibes) && body.vibes.length ? body.vibes.join(', ') : 'general sightseeing';
  const regions = Array.isArray(body.destinationStates) && body.destinationStates.length ? body.destinationStates.join(', ') : 'no specific regions';

  return `Return ONLY valid JSON with no markdown.

Use current, grounded public information for tourist spending in ${destination} for travel around ${dates}. Consider seasonality, attraction entry fees, food/drink/activity patterns implied by these vibes: ${vibes}, and selected regions: ${regions}.

Estimate in USD:
- placeVisitCost: average daily spend for one traveler on one place/activity matching the selected vibes. Include typical entrance/activity costs, not hotel, flight, or local transportation.
- currencyNote: one short note about local currency/pricing confidence.
- basis: one short sentence naming the real factors you used, such as museum/activity tickets, food/drink patterns, or current attraction prices.

Return this exact JSON object shape, using real estimated numbers:
{
  "placeVisitCost": <number>,
  "currencyNote": <string>,
  "basis": <string>
}

Do not copy placeholder values. Do not use generic worldwide averages. The numeric field must be calculated from the destination, dates, season, selected vibes, and current grounded search results.`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const origin = String(body.origin || '').trim();
    const destination = String(body.destination || '').trim();
    const destinationCity = String(body.destinationCity || destination || '').trim();
    const destinationCountry = String(body.destinationCountry || '').trim();
    const departureDate = String(body.departureDate || '').trim();
    const returnDate = String(body.returnDate || '').trim();
    const tripType = String(body.tripType || 'round_trip').trim();
    const nights = Math.max(1, Number(body.nights || 1));
    const tripDays = Math.max(1, nights);
    const checkInDate = departureDate || addDays('', 14);
    const checkOutDate = returnDate || addDays(checkInDate, 1);
    const includePlaceVisits = body.includePlaceVisits !== false;

    if (!origin || !destination || !departureDate) {
      return NextResponse.json({ error: 'origin, destination, and departureDate are required' }, { status: 400 });
    }

    console.log('\n========== BUDGET AUTO ALLOCATE START ==========');
    console.log('[Budget estimates] Request:', {
      origin,
      destination,
      destinationCity,
      destinationCountry,
      departureDate,
      returnDate,
      tripType,
      nights,
      tripDays,
      adults: body.adults,
      children: body.children,
      includePlaceVisits,
      totalBudget: body.totalBudget,
    });

    console.log('[Budget estimates] Step 1: Fetching SerpAPI Google Flights average...');
    console.log('[Budget estimates] Step 2: Fetching SerpAPI Google Hotels average...');
    console.log('[Budget estimates] Step 3: Fetching transportation average through planner transport route...');
    console.log(`[Budget estimates] Step 4: ${includePlaceVisits ? 'Fetching grounded Gemini place visit average...' : 'Skipped because place visits are disabled.'}`);

    const [flightResult, hotelResult, transportResult, dailyCosts] = await Promise.allSettled([
      searchSerpApiFlights({
        origin,
        destination,
        departureDate,
        returnDate,
        tripType,
        adults: 1,
        children: 0,
      }),
      searchSerpApiHotels({
        query: [destinationCity, destinationCountry].filter(Boolean).join(', ') || destination,
        checkInDate,
        checkOutDate,
        adults: 1,
        children: 0,
        countryCode: String(body.destinationCountryCode || 'us'),
      }),
      getPlannerTransportAverage(request, body),
      includePlaceVisits ? getGeminiDailyCosts(buildDailyCostPrompt(body)) : Promise.resolve(null),
    ]);

    if (flightResult.status === 'rejected') {
      console.error('[Budget estimates] Step 1 failed:', flightResult.reason?.message || flightResult.reason);
    }
    if (hotelResult.status === 'rejected') {
      console.error('[Budget estimates] Step 2 failed:', hotelResult.reason?.message || hotelResult.reason);
    }
    if (transportResult.status === 'rejected') {
      console.error('[Budget estimates] Step 3 failed:', transportResult.reason?.message || transportResult.reason);
    }
    if (dailyCosts.status === 'rejected') {
      console.error('[Budget estimates] Step 4 failed:', dailyCosts.reason?.message || dailyCosts.reason);
    }

    const flightPrices = flightResult.status === 'fulfilled' && flightResult.value ? getFlightPrices(flightResult.value) : [];
    const hotelPrices = hotelResult.status === 'fulfilled' && hotelResult.value ? getHotelNightlyPrices(hotelResult.value, nights) : [];
    const aiCosts = includePlaceVisits && dailyCosts.status === 'fulfilled' && dailyCosts.value
      ? dailyCosts.value
      : { placeVisitCost: 25, currencyNote: '', source: 'static_fallback' };
    const transportCosts = transportResult.status === 'fulfilled' && transportResult.value
      ? transportResult.value
      : {
          transportPerPersonPerDay: 40,
          source: 'static_fallback',
          sampleCount: 0,
          selectedModes: [],
        };

    const flightPerPerson = median(flightPrices) ?? 800;
    const hotelPerPersonPerNight = median(hotelPrices) ?? 150;
    const transportPerPersonPerDay = transportCosts.transportPerPersonPerDay;
    const placeVisitCostPerDay = includePlaceVisits ? aiCosts.placeVisitCost : 0;

    console.log('[Budget estimates] Step 1 complete:', {
      samples: flightPrices.length,
      medianFlightPerPerson: flightPerPerson,
      source: flightPrices.length ? 'serpapi_google_flights' : 'fallback',
    });
    console.log('[Budget estimates] Step 2 complete:', {
      samples: hotelPrices.length,
      medianHotelPerPersonPerNight: hotelPerPersonPerNight,
      source: hotelPrices.length ? 'serpapi_google_hotels' : 'fallback',
    });
    console.log('[Budget estimates] Step 3 complete:', {
      transportPerPersonPerDay,
      source: transportCosts.source,
      sampleCount: transportCosts.sampleCount,
      selectedModes: transportCosts.selectedModes,
    });
    console.log('[Budget estimates] Step 4 complete:', {
      placeVisitCost: placeVisitCostPerDay,
      source: aiCosts.source,
      currencyNote: aiCosts.currencyNote,
    });

    const responsePayload = {
      flightPerPerson,
      hotelPerPersonPerNight,
      transportPerPerson: transportPerPersonPerDay,
      transportPerPersonPerDay,
      placeVisitCost: placeVisitCostPerDay,
      placeVisitCostPerDay,
      currencyNote: aiCosts.currencyNote,
      sources: {
        flight: flightPrices.length ? 'serpapi_google_flights' : 'fallback',
        hotel: hotelPrices.length ? 'serpapi_google_hotels' : 'fallback',
        transport: transportCosts.source,
        daily: includePlaceVisits ? aiCosts.source : 'disabled',
      },
      sampleSizes: {
        flightPrices: flightPrices.length,
        hotelPrices: hotelPrices.length,
        transportPrices: transportCosts.sampleCount,
      },
    };

    console.log('[Budget estimates] Final response:', responsePayload);
    console.log('========== BUDGET AUTO ALLOCATE END ==========\n');

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('[Budget estimates] failed:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to estimate budget' }, { status: 500 });
  }
}
