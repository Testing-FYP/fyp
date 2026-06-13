import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { searchSerpApiFlights } from '../google-api/google-flights';
import { searchSerpApiHotels } from '../google-api/google-hotels';

const MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 40000;
const HOTEL_STAR_OPTIONS = [1, 2, 3, 4, 5];
const HOTEL_STAR_FALLBACK_MULTIPLIER: Record<string, number> = {
  '1': 0.55,
  '2': 0.75,
  '3': 1,
  '4': 1.35,
  '5': 1.8,
};

function loadPromptTemplate(fileName: string) {
  return fs.readFileSync(path.join(process.cwd(), 'app', 'ai-prompts', fileName), 'utf8');
}

function fillPromptTemplate(template: string, values: Record<string, string | number | boolean>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

type TransportEstimateResult = {
  transportPerPersonPerDay: number;
  source: string;
  sampleCount: number;
  selectedModes: string[];
  options: any[];
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
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
}

function average(values: number[]) {
  const usable = values.filter(value => Number.isFinite(value) && value > 0);
  if (!usable.length) return null;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

function normalizeSuggestedPlaces(item: any, categoryCost: number) {
  const rawSuggestions = Array.isArray(item?.suggestedPlaces)
    ? item.suggestedPlaces
    : [item?.suggestedPlace || item?.place || item?.where || item?.venue].filter(Boolean);

  return rawSuggestions
    .map((suggestion: any, index: number) => {
      if (typeof suggestion === 'string') {
        return {
          name: suggestion.trim(),
          estimatedCost: categoryCost,
          detail: String(item?.detail || item?.notes || item?.description || '').trim(),
        };
      }
      const name = String(suggestion?.name || suggestion?.label || suggestion?.place || suggestion?.where || suggestion?.venue || '').trim();
      if (!name) return null;
      return {
        name,
        estimatedCost: readPositiveNumber(suggestion?.estimatedCost ?? suggestion?.cost ?? suggestion?.price ?? suggestion?.amount) ?? categoryCost,
        detail: String(suggestion?.detail || suggestion?.notes || suggestion?.description || item?.detail || '').trim(),
      };
    })
    .filter((suggestion: { name: string; estimatedCost: number; detail: string } | null): suggestion is { name: string; estimatedCost: number; detail: string } => !!suggestion)
    .slice(0, 5);
}

function normalizeDailyCategories(value: any) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item: any, index: number) => {
      const estimatedCost = readPositiveNumber(item?.estimatedCost ?? item?.cost ?? item?.price ?? item?.amount);
      if (estimatedCost === null) return null;
      const rawLabel = String(item?.label || item?.name || item?.key || `Daily item ${index + 1}`).trim();
      return {
        key: String(item?.key || rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `daily_item_${index + 1}`),
        label: rawLabel,
        estimatedCost,
        suggestedPlace: String(item?.suggestedPlace || item?.place || item?.where || item?.venue || '').trim(),
        suggestedPlaces: normalizeSuggestedPlaces(item, estimatedCost),
        detail: String(item?.detail || item?.notes || item?.description || '').trim(),
      };
    })
    .filter((item): item is { key: string; label: string; estimatedCost: number; suggestedPlace: string; suggestedPlaces: { name: string; estimatedCost: number; detail: string }[]; detail: string } => !!item)
    .slice(0, 10);
}

function readStarRating(value: any): number | null {
  const parsed = readPositiveNumber(value);
  if (parsed === null) return null;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function readTransportNumber(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Number(value.toFixed(2));
  if (typeof value === 'string' && value.trim()) {
    const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null;
  }
  return null;
}

function getTransportDailyAllocation(option: any) {
  const price = readTransportNumber(option?.estimatedPrice);
  if (price === null) return null;

  const mode = String(option?.id || option?.transportType || option?.type || '').trim();
  if (mode === 'rental_car') return price;
  if (mode === 'taxi' || mode === 'rideshare_uber') return price;
  if (mode === 'train') return price;
  return price;
}

function addDays(dateValue: string, days: number) {
  const date = dateValue ? new Date(`${dateValue}T00:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) date.setTime(Date.now());
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getFlightSamples(response: any, requestedCabin: string) {
  const itineraries = [
    ...(Array.isArray(response?.best_flights) ? response.best_flights : []),
    ...(Array.isArray(response?.other_flights) ? response.other_flights : []),
  ];

  return itineraries
    .map((itinerary: any, index: number) => {
      const price = firstPositiveNumber(
      itinerary?.price,
      itinerary?.extracted_price,
      itinerary?.total_price,
      itinerary?.total_amount,
      itinerary?.price_amount,
      itinerary?.displayed_price,
      itinerary?.fare?.price,
      itinerary?.fare?.amount
      );
      if (typeof price !== 'number') return null;

      const segments = Array.isArray(itinerary?.flights) ? itinerary.flights : [];
      const firstSegment = segments[0] || {};
      const lastSegment = segments[segments.length - 1] || firstSegment;
      const airline = String(firstSegment?.airline || itinerary?.airline || itinerary?.airlines?.[0] || 'Airline unavailable');
      const origin = String(firstSegment?.departure_airport?.id || firstSegment?.departure_airport?.name || '');
      const destination = String(lastSegment?.arrival_airport?.id || lastSegment?.arrival_airport?.name || '');

      return {
        index,
        price,
        airline,
        cabin: requestedCabin,
        route: [origin, destination].filter(Boolean).join(' -> '),
        stops: Math.max(0, segments.length - 1),
        duration: itinerary?.total_duration || itinerary?.duration || null,
        type: itinerary?.type || '',
      };
    })
    .filter((sample): sample is { index: number; price: number; airline: string; cabin: string; route: string; stops: number; duration: any; type: string } => !!sample);
}

function getFlightPrices(response: any, requestedCabin: string) {
  return getFlightSamples(response, requestedCabin).map(sample => sample.price);
}

function representativeAverage(values: number[]) {
  const sorted = values.filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length >= 5) {
    const marketMedian = median(sorted) ?? sorted[Math.floor(sorted.length / 2)];
    const highOutlierLimit = marketMedian * 1.8;
    const trimmed = sorted.filter(value => value <= highOutlierLimit);
    if (trimmed.length >= 3 && trimmed.length < sorted.length) {
      return representativeAverage(trimmed);
    }
  }
  if (sorted.length >= 4) {
    const middle = sorted[Math.floor(sorted.length / 2)];
    return average([sorted[0], sorted[1], middle, sorted[sorted.length - 1]]);
  }
  return average(sorted);
}

function getHotelNightlySamples(response: any, nights: number, forcedStars?: number, searchStar?: number) {
  const properties = [
    ...(Array.isArray(response?.properties) ? response.properties : []),
    ...(Array.isArray(response?.ads) ? response.ads : []),
  ];

  return properties
    .map((property: any, index: number) => {
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
      const price = nightly ?? (total && nights > 0 ? Math.round(total / nights) : null);
      if (typeof price !== 'number') return null;
      const stars = forcedStars ?? readStarRating(
        property?.extracted_hotel_class ??
        property?.hotel_class ??
        property?.class ??
        property?.stars
      );
      return {
        name: String(property?.name || property?.title || `Hotel ${index + 1}`),
        price,
        stars,
        searchStar: searchStar ?? forcedStars ?? stars,
        hotelClass: property?.hotel_class || property?.extracted_hotel_class || property?.class || '',
        displayedPrice: String(
          property?.rate_per_night?.lowest ||
          property?.rate_per_night?.extracted_lowest ||
          property?.price ||
          property?.displayed_price ||
          ''
        ),
      };
    })
    .filter((sample): sample is { name: string; price: number; stars: number | null; searchStar: number | null; hotelClass: any; displayedPrice: string } => !!sample);
}

function getHotelAveragesByStars(samples: { price: number; stars: number | null }[], fallbackPrices: number[] = []) {
  const buckets: Record<string, number[]> = { '1': [], '2': [], '3': [], '4': [], '5': [] };
  const knownStarSamples = samples.filter(sample => sample.stars !== null);

  for (const sample of knownStarSamples) {
    buckets[String(sample.stars)].push(sample.price);
  }

  const baseAverage = representativeAverage([
    ...samples.map(sample => sample.price),
    ...fallbackPrices,
  ]) ?? 150;
  const averages: Record<string, number> = {};
  for (const star of ['1', '2', '3', '4', '5']) {
    averages[star] = representativeAverage(buckets[star]) ?? Math.max(35, Math.round(baseAverage * HOTEL_STAR_FALLBACK_MULTIPLIER[star]));
  }

  return {
    averages,
    sampleCounts: Object.fromEntries(Object.entries(buckets).map(([star, prices]) => [star, prices.length])),
  };
}

function buildHotelDebugByStars(samples: { name: string; price: number; stars: number | null; searchStar: number | null; hotelClass: any; displayedPrice: string }[]) {
  const buckets: Record<string, any[]> = { '1': [], '2': [], '3': [], '4': [], '5': [] };

  for (const sample of samples) {
    const bucket = sample.searchStar ? String(sample.searchStar) : sample.stars ? String(sample.stars) : '';
    if (!buckets[bucket]) continue;
    buckets[bucket].push({
      name: sample.name,
      nightlyPrice: sample.price,
      parsedStars: sample.stars,
      searchStar: sample.searchStar,
      hotelClass: sample.hotelClass,
      displayedPrice: sample.displayedPrice,
    });
  }

  return Object.fromEntries(
    Object.entries(buckets).map(([star, starSamples]) => [
      star,
      starSamples
        .sort((a, b) => a.nightlyPrice - b.nightlyPrice)
        .slice(0, 12),
    ])
  );
}

function buildHotelQuery(destinationCity: string, destinationCountry: string, roomsPerApartment: number, star?: number) {
  const roomPhrase = roomsPerApartment > 1
    ? `${roomsPerApartment} bedroom apartment`
    : 'apartment hotel';
  return [
    destinationCity,
    destinationCountry,
    star ? `${star} star` : '',
    roomPhrase,
  ].filter(Boolean).join(' ');
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
  const dailyCategories = normalizeDailyCategories(parsed.dailyCategories);
  if (!dailyCategories.length) {
    throw new Error('Gemini returned no grounded daily categories');
  }
  console.log('[Budget estimates] Gemini grounded response parsed:', {
    placeVisitCost,
    dailyCategories: dailyCategories.length,
    currencyNote: String(parsed.currencyNote || ''),
    basis: String(parsed.basis || ''),
  });
  return {
    placeVisitCost,
    dailyCategories,
    currencyNote: String(parsed.currencyNote || ''),
  };
}

async function getGeminiDailyCosts(prompt: string) {
  const keys = [
    { name: 'gemini_key_1_grounded', value: readEnvValue('NEXT_PUBLIC_GEMINI_API_KEY') },
    { name: 'gemini_key_2_grounded', value: readEnvValue('NEXT_PUBLIC_GEMINI_API_KEY_V2') },
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

  const groqKey = readEnvValue('NEXT_PUBLIC_GROQ_API_KEY');
  if (groqKey) {
    try {
      console.log('[Budget estimates] Trying groq');
      const response = await withTimeout(
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_tokens: 1200,
            response_format: { type: 'json_object' },
          }),
        }),
        REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`Groq HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const parsed = parseJsonObject(data.choices?.[0]?.message?.content || '{}');
      const placeVisitCost = readPositiveNumber(parsed.placeVisitCost);
      if (placeVisitCost === null) {
        throw new Error('Groq returned missing placeVisitCost');
      }
      console.log('[Budget estimates] Success via groq');
      const dailyCategories = normalizeDailyCategories(parsed.dailyCategories);
      if (!dailyCategories.length) {
        throw new Error('Groq returned no grounded daily categories');
      }
      return {
        placeVisitCost,
        dailyCategories,
        currencyNote: String(parsed.currencyNote || ''),
        source: 'groq',
      };
    } catch (error: any) {
      console.error(`[Budget estimates] groq failed: ${error?.message || error}`);
    }
  }

  return {
    placeVisitCost: 0,
    dailyCategories: [],
    currencyNote: 'Grounded daily spending data unavailable.',
    source: 'grounded_unavailable',
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
      options: [],
    };
  }

  const requestOrigin = new URL(request.url).origin;
  console.log('[Budget estimates] Step 3a: Fetching planner transport route average...');

  const response = await withTimeout(
    fetch(`${requestOrigin}/api/transport`, {
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
  const selectedModes: string[] = Array.isArray(body?.transportTypes)
    ? body.transportTypes.map((mode: any) => String(mode).trim()).filter(Boolean)
    : [];
  const selectedSet = new Set(selectedModes);
  const matchingOptions = options.filter((option: any) => {
    if (!option?.available) return false;
    const mode = String(option.id || option.transportType || option.type);
    if (selectedSet.size) return selectedSet.has(mode);
    return true;
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
    options,
  };

  console.log('[Budget estimates] Step 3a complete:', result);
  return result;
}

function buildDailyCostPrompt(body: any) {
  const destination = [body.destinationCity || body.destination, body.destinationCountry].filter(Boolean).join(', ') || 'the destination';
  const dates = [body.departureDate, body.returnDate].filter(Boolean).join(' to ') || 'the selected travel dates';
  const vibes = Array.isArray(body.vibes) && body.vibes.length ? body.vibes.join(', ') : 'general sightseeing';

  return fillPromptTemplate(loadPromptTemplate('budget-estimates-daily-cost.txt'), {
    DESTINATION: destination,
    DATES: dates,
    VIBES: vibes,
  });
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
    const checkOutDate = addDays(checkInDate, nights);
    const includePlaceVisits = body.includePlaceVisits !== false;
    const adults = Math.max(1, Number(body.adults || 1));
    const children = Math.max(0, Number(body.children || 0));
    const hotelApartments = Math.max(1, Number(body.hotelRooms || 1));
    const hotelRoomsPerApartment = Math.max(1, Number(body.hotelRoomsPerApartment || 1));
    const allowedCabinClasses = new Set(['economy', 'business']);
    const requestedCabinClasses = Array.isArray(body?.cabinClasses)
      ? body.cabinClasses
          .map((cabinClass: any) => String(cabinClass).trim().toLowerCase())
          .filter((cabinClass: string) => allowedCabinClasses.has(cabinClass))
      : [];
    const flightCabinClasses: string[] = Array.from(new Set<string>(requestedCabinClasses.length ? requestedCabinClasses : ['economy', 'business']));

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
      adults,
      children,
      includePlaceVisits,
      flightCabinClasses,
      hotelApartments,
      hotelRoomsPerApartment,
      totalBudget: body.totalBudget,
    });

    console.log('[Budget estimates] Step 1: Fetching SerpAPI Google Flights average...');
    console.log('[Budget estimates] Step 2: Fetching SerpAPI Google Hotels average...');
    console.log('[Budget estimates] Step 3: Fetching transportation average through planner transport route...');
    console.log(`[Budget estimates] Step 4: ${includePlaceVisits ? 'Fetching grounded Gemini place visit average...' : 'Skipped because place visits are disabled.'}`);

    const [flightResult, hotelResult, hotelStarResult, transportResult, dailyCosts] = await Promise.allSettled([
      Promise.allSettled(
        flightCabinClasses.map(cabinClass =>
          searchSerpApiFlights({
            origin,
            destination,
            departureDate,
            returnDate,
            tripType,
            adults: 1,
            children: 0,
            cabinClass,
            includeBaggage: body.includeBaggage !== false,
          })
        )
      ),
      searchSerpApiHotels({
        query: buildHotelQuery(destinationCity, destinationCountry, hotelRoomsPerApartment) || destination,
        checkInDate,
        checkOutDate,
        adults,
        children,
        countryCode: String(body.destinationCountryCode || 'us'),
        bedrooms: hotelRoomsPerApartment,
        vacationRentals: true,
      }),
      Promise.allSettled(
        HOTEL_STAR_OPTIONS.map(star =>
          searchSerpApiHotels({
            query: buildHotelQuery(destinationCity, destinationCountry, hotelRoomsPerApartment, star) || destination,
            checkInDate,
            checkOutDate,
            adults,
            children,
            countryCode: String(body.destinationCountryCode || 'us'),
            hotelClass: star,
          })
        )
      ),
      getPlannerTransportAverage(request, body),
      includePlaceVisits ? getGeminiDailyCosts(buildDailyCostPrompt(body)) : Promise.resolve(null),
    ]);

    if (flightResult.status === 'rejected') {
      console.error('[Budget estimates] Step 1 failed:', flightResult.reason?.message || flightResult.reason);
    }
    if (flightResult.status === 'fulfilled') {
      flightResult.value.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[Budget estimates] Step 1 ${flightCabinClasses[index]} failed:`, result.reason?.message || result.reason);
        }
      });
    }
    if (hotelResult.status === 'rejected') {
      console.error('[Budget estimates] Step 2 failed:', hotelResult.reason?.message || hotelResult.reason);
    }
    if (hotelStarResult.status === 'rejected') {
      console.error('[Budget estimates] Step 2 star groups failed:', hotelStarResult.reason?.message || hotelStarResult.reason);
    }
    if (hotelStarResult.status === 'fulfilled') {
      hotelStarResult.value.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[Budget estimates] Step 2 ${HOTEL_STAR_OPTIONS[index]}-star failed:`, result.reason?.message || result.reason);
        }
      });
    }
    if (transportResult.status === 'rejected') {
      console.error('[Budget estimates] Step 3 failed:', transportResult.reason?.message || transportResult.reason);
    }
    if (dailyCosts.status === 'rejected') {
      console.error('[Budget estimates] Step 4 failed:', dailyCosts.reason?.message || dailyCosts.reason);
    }

    const flightSampleGroups = Object.fromEntries(
      flightCabinClasses.map((cabinClass, index) => {
        const samples = flightResult.status === 'fulfilled'
          ? flightResult.value[index]?.status === 'fulfilled'
            ? getFlightSamples(flightResult.value[index].value, cabinClass)
            : []
          : [];
        return [cabinClass, samples];
      })
    ) as Record<string, ReturnType<typeof getFlightSamples>>;
    const flightPriceGroups = Object.fromEntries(
      Object.entries(flightSampleGroups).map(([cabinClass, samples]) => [cabinClass, samples.map(sample => sample.price)])
    ) as Record<string, number[]>;
    const flightAverages = {
      economy: representativeAverage(flightPriceGroups.economy || []) ?? 800,
      business: representativeAverage(flightPriceGroups.business || []) ?? 2200,
    };
    const flightPrices = Object.values(flightPriceGroups).flat();
    const hotelSamples = hotelResult.status === 'fulfilled' && hotelResult.value ? getHotelNightlySamples(hotelResult.value, nights) : [];
    const hotelPrices = hotelSamples.map(sample => sample.price);
    const hotelStarSamples = hotelStarResult.status === 'fulfilled'
      ? hotelStarResult.value.flatMap((result, index) => {
          if (result.status !== 'fulfilled') return [];
          const star = HOTEL_STAR_OPTIONS[index];
          const samples = getHotelNightlySamples(result.value, nights, star >= 2 ? star : undefined, star);
          return star === 1 ? samples.filter(sample => sample.stars === 1) : samples;
        })
      : [];
    const hotelStarAverages = getHotelAveragesByStars(hotelStarSamples.length ? hotelStarSamples : hotelSamples, hotelPrices);
    const hotelDebugByStars = buildHotelDebugByStars(hotelStarSamples.length ? hotelStarSamples : hotelSamples);
    const aiCosts = includePlaceVisits && dailyCosts.status === 'fulfilled' && dailyCosts.value
      ? dailyCosts.value
      : { placeVisitCost: 0, dailyCategories: [], currencyNote: 'Grounded daily spending data unavailable.', source: 'grounded_unavailable' };
    const transportCosts = transportResult.status === 'fulfilled' && transportResult.value
      ? transportResult.value
      : {
          transportPerPersonPerDay: 40,
          source: 'static_fallback',
          sampleCount: 0,
          selectedModes: [],
          options: [],
        };

    const flightPerPerson = flightAverages.economy;
    const hotelPerApartmentPerNight = representativeAverage(hotelPrices) ?? 150;
    const transportPerPersonPerDay = transportCosts.transportPerPersonPerDay;
    const placeVisitCostPerDay = includePlaceVisits ? aiCosts.placeVisitCost : 0;
    const dailyCategories = includePlaceVisits ? aiCosts.dailyCategories : [];

    console.log('[Budget estimates] Step 1 complete:', JSON.stringify({
      samples: flightPrices.length,
      economyAveragePerPerson: flightAverages.economy,
      businessAveragePerPerson: flightAverages.business,
      cabinClasses: flightCabinClasses,
      samplesByCabin: flightSampleGroups,
      source: flightPrices.length ? 'serpapi_google_flights' : 'fallback',
    }, null, 2));
    console.log('[Budget estimates] Step 2 complete:', {
      samples: hotelPrices.length,
      averageHotelPerApartmentPerNight: hotelPerApartmentPerNight,
      hotelAveragesByStars: hotelStarAverages.averages,
      hotelApartments,
      hotelRoomsPerApartment,
      hotelBudgetFormula: 'hotelPerApartmentPerNight * hotelApartments * nights',
      source: hotelPrices.length ? 'serpapi_google_hotels' : 'fallback',
    });
    console.log('[Budget estimates] Hotel SerpApi samples by star:\n' + JSON.stringify(hotelDebugByStars, null, 2));
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
      flightAverages,
      flightSamplesByCabin: Object.fromEntries(
        Object.entries(flightSampleGroups).map(([cabinClass, samples]) => [
          cabinClass,
          samples.slice(0, 12),
        ])
      ),
      hotelPerPersonPerNight: hotelPerApartmentPerNight,
      hotelPerApartmentPerNight,
      hotelAveragesByStars: hotelStarAverages.averages,
      hotelDebugByStars,
      hotelApartments,
      hotelRoomsPerApartment,
      transportPerPerson: transportPerPersonPerDay,
      transportPerPersonPerDay,
      transportOptions: transportCosts.options,
      placeVisitCost: placeVisitCostPerDay,
      placeVisitCostPerDay,
      dailyCategories,
      currencyNote: aiCosts.currencyNote,
      sources: {
        flight: flightPrices.length ? 'serpapi_google_flights' : 'fallback',
        hotel: hotelPrices.length ? 'serpapi_google_hotels' : 'fallback',
        transport: transportCosts.source,
        daily: includePlaceVisits ? aiCosts.source : 'disabled',
      },
      sampleSizes: {
        flightPrices: flightPrices.length,
        flightPricesByCabin: {
          economy: flightPriceGroups.economy?.length || 0,
          business: flightPriceGroups.business?.length || 0,
        },
        hotelPrices: hotelPrices.length,
        hotelPricesByStars: hotelStarAverages.sampleCounts,
        transportPrices: transportCosts.sampleCount,
      },
    };

    console.log('[Budget estimates] Final response:', JSON.stringify(responsePayload, null, 2));
    console.log('========== BUDGET AUTO ALLOCATE END ==========\n');

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('[Budget estimates] failed:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Failed to estimate budget' }, { status: 500 });
  }
}
