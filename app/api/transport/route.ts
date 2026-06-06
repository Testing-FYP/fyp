import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

type TransportMode =
  | 'metro_subway'
  | 'train'
  | 'public_bus'
  | 'taxi'
  | 'rideshare_uber'
  | 'rental_car';

type TransportDataSource =
  | 'gemini_key_1_grounded'
  | 'gemini_key_2_grounded'
  | 'groq'
  | 'static_fallback';

type TransportOption = {
  id: TransportMode;
  transportType: TransportMode;
  type: TransportMode;
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
  dataSource?: TransportDataSource;
};

const TRANSPORT_MODES: { id: TransportMode; displayName: string }[] = [
  { id: 'metro_subway', displayName: 'Metro / Subway' },
  { id: 'train', displayName: 'Train' },
  { id: 'public_bus', displayName: 'Public Bus' },
  { id: 'taxi', displayName: 'Taxi' },
  { id: 'rideshare_uber', displayName: 'Rideshare / Uber' },
  { id: 'rental_car', displayName: 'Rental Car' },
];

const MODEL = 'gemini-2.5-flash';
const REQUEST_TIMEOUT_MS = 18000;
const GEMINI_GROUNDING_TIMEOUT_MS = 40000;

function loadPromptTemplate(fileName: string) {
  return fs.readFileSync(path.join(process.cwd(), 'app', 'ai-prompts', fileName), 'utf8');
}

function fillPromptTemplate(template: string, values: Record<string, string | number | boolean>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

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

function stripJsonFences(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function extractJsonText(text: string) {
  const stripped = stripJsonFences(text);
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return stripped;
  return stripped.slice(start, end + 1);
}

function parseTransportJson(text: string) {
  try {
    return JSON.parse(extractJsonText(text));
  } catch (error: any) {
    throw new Error(`Unparseable JSON: ${error?.message || 'parse failed'}`);
  }
}

function isPriceString(value: any) {
  if (typeof value !== 'string') return false;
  const hasNumber = /\d/.test(value);
  const hasCurrency = /[$€£¥₹₩₺₽₫฿₦₱₪]|(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|AED|SAR|QAR|KWD|BHD|OMR|JOD|TRY|INR)\b/i.test(value);
  return hasNumber && hasCurrency;
}

function isDualCurrencyPriceString(value: any) {
  if (typeof value !== 'string') return false;
  const hasNumber = /\d/.test(value);
  const hasCurrency = /[\u0024\u20AC\u00A3\u00A5\u20B9\u20A9\u20BA\u20BD\u20AB\u0E3F\u20A6\u20B1\u20AA]|(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|AED|SAR|QAR|KWD|BHD|OMR|JOD|TRY|INR)\b/i.test(value);
  return hasNumber && hasCurrency;
}

function validateAiPriceFields(raw: any) {
  const options = raw?.options || raw?.transportOptions || raw?.transport || raw;
  const requiredPriceFields: Record<TransportMode, string[]> = {
    metro_subway: ['priceLabel', 'singleTicketPrice', 'dayPassPrice'],
    train: ['priceLabel', 'priceRange'],
    public_bus: ['priceLabel', 'singleTicketPrice'],
    taxi: ['priceLabel', 'estimatedFareRange'],
    rideshare_uber: ['priceLabel', 'estimatedFareRange'],
    rental_car: ['priceLabel', 'pricePerDay'],
  };

  for (const mode of TRANSPORT_MODES) {
    const option = Array.isArray(options)
      ? options.find((item: any) => item?.id === mode.id || item?.transportType === mode.id || item?.type === mode.id)
      : options?.[mode.id];

    if (!option || option.available !== true) continue;

    for (const field of requiredPriceFields[mode.id]) {
      if (!isDualCurrencyPriceString(option[field])) {
        throw new Error(`${mode.id}.${field} must contain a numeric price and currency symbol/code`);
      }
    }
  }
}

function readNumber(value: any): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Math.round(Number(match[0])) : null;
}

function priceLabelFor(option: any) {
  return String(
    option?.priceLabel ||
    option?.singleTicketPrice ||
    option?.dayPassPrice ||
    option?.priceRange ||
    option?.estimatedFareRange ||
    option?.pricePerDay ||
    (option?.estimatedPrice ? `$${option.estimatedPrice}` : 'Price varies')
  );
}

function normalizeOptions(raw: any, dataSource: TransportDataSource): TransportOption[] {
  const sourceOptions = raw?.options || raw?.transportOptions || raw?.transport || raw;

  return TRANSPORT_MODES.map(mode => {
    const option = Array.isArray(sourceOptions)
      ? sourceOptions.find((item: any) => item?.id === mode.id || item?.transportType === mode.id || item?.type === mode.id)
      : sourceOptions?.[mode.id];

    const available = option?.available === true;
    const priceLabel = priceLabelFor(option || {});
    const estimatedPrice =
      readNumber(option?.estimatedPrice) ??
      readNumber(option?.singleTicketPrice) ??
      readNumber(option?.dayPassPrice) ??
      readNumber(option?.priceRange) ??
      readNumber(option?.estimatedFareRange) ??
      readNumber(option?.pricePerDay);

    return {
      id: mode.id,
      transportType: mode.id,
      type: mode.id,
      displayName: String(option?.displayName || option?.name || mode.displayName),
      available,
      estimatedPrice,
      priceLabel: available ? priceLabel : 'Unavailable',
      singleTicketPrice: option?.singleTicketPrice ? String(option.singleTicketPrice) : undefined,
      dayPassPrice: option?.dayPassPrice ? String(option.dayPassPrice) : undefined,
      priceRange: option?.priceRange || option?.estimatedFareRange || option?.pricePerDay ? String(option.priceRange || option.estimatedFareRange || option.pricePerDay) : undefined,
      travelTimeNotes: option?.travelTimeNotes ? String(option.travelTimeNotes) : undefined,
      pricingType: option?.pricingType ? String(option.pricingType) : undefined,
      pricingNotes: option?.pricingNotes ? String(option.pricingNotes) : undefined,
      meterInfo: option?.meterInfo ? String(option.meterInfo) : undefined,
      surgePricingNotes: option?.surgePricingNotes ? String(option.surgePricingNotes) : undefined,
      extraCosts: option?.extraCosts ? String(option.extraCosts) : undefined,
      bestUseCase: option?.bestUseCase || option?.bestUseCaseNote ? String(option.bestUseCase || option.bestUseCaseNote) : undefined,
      notes: String(option?.notes || option?.pricingNotes || option?.travelTimeNotes || option?.bestUseCase || 'Check local provider details before booking.'),
      dataSource,
    };
  });
}

function staticTransportFallback(destinationCity: string, dataSource: TransportDataSource = 'static_fallback'): TransportOption[] {
  const city = destinationCity || 'your destination';
  return normalizeOptions({
    options: {
      metro_subway: {
        available: false,
        notes: `Metro availability for ${city} could not be verified.`,
      },
      train: {
        available: true,
        priceRange: '$5-25',
        travelTimeNotes: 'Regional train times vary by route.',
        pricingType: 'Distance-based or zone-based fare',
        notes: `Train service may be useful for longer transfers around ${city}.`,
      },
      public_bus: {
        available: true,
        singleTicketPrice: '$2-5',
        notes: `Public buses are usually the lowest-cost option in ${city}.`,
      },
      taxi: {
        available: true,
        estimatedFareRange: '$15-45',
        meterInfo: 'Use licensed taxis and confirm meter or fare before departure.',
        pricingNotes: 'Airport and late-night surcharges may apply.',
      },
      rideshare_uber: {
        available: true,
        estimatedFareRange: '$12-40',
        surgePricingNotes: 'Prices may rise during peak demand.',
        notes: 'Availability depends on local rideshare regulations.',
      },
      rental_car: {
        available: true,
        pricePerDay: '$35-80',
        extraCosts: 'Fuel, insurance, tolls, parking, and deposits may apply.',
        bestUseCase: 'Best for day trips or destinations with limited transit.',
      },
    },
  }, dataSource);
}

function buildTransportPrompt(destinationCity: string, destinationCountry: string, destination: string, transportPriority: string) {
  const place = [destinationCity, destinationCountry].filter(Boolean).join(', ') || destination || 'the destination city';
  return fillPromptTemplate(loadPromptTemplate('transport-pricing.txt'), {
    PLACE: place,
    TRANSPORT_PRIORITY: transportPriority || 'cheapest',
  });

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function isFetchFailedError(error: any) {
  return String(error?.message || error || '').toLowerCase().includes('fetch failed');
}

async function callGemini(apiKey: string, prompt: string, grounded: boolean) {
  if (!apiKey) throw new Error('API key is not configured');
  const ai = new GoogleGenAI({ apiKey });

  const generate = () => withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: [{ parts: [{ text: prompt }] }],
      config: grounded
        ? {
            temperature: 0.2,
            tools: [{ googleSearch: {} }],
          }
        : {
            temperature: 0.2,
          },
    } as any),
    grounded ? GEMINI_GROUNDING_TIMEOUT_MS : REQUEST_TIMEOUT_MS
  );

  let response;
  try {
    response = await generate();
  } catch (error: any) {
    if (!grounded || !isFetchFailedError(error)) throw error;
    await delay(2000);
    response = await generate();
  }

  const parsed = parseTransportJson(response.text || '{}');
  validateAiPriceFields(parsed);
  return parsed;
}

async function callGroq(apiKey: string, prompt: string) {
  if (!apiKey) throw new Error('NEXT_PUBLIC_GROQ_API_KEY is not configured');
  const response = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      }),
    }),
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Groq HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const parsed = parseTransportJson(data.choices?.[0]?.message?.content || '{}');
  validateAiPriceFields(parsed);
  return parsed;
}

async function getTransportOptions(prompt: string, destinationCity: string) {
  const geminiKey1 = readEnvValue('NEXT_PUBLIC_GEMINI_API_KEY');
  const geminiKey2 = readEnvValue('NEXT_PUBLIC_GEMINI_API_KEY_V2');
  const groqKey = readEnvValue('NEXT_PUBLIC_GROQ_API_KEY');
  let raw: any;
  let dataSource: TransportDataSource;

  // Layer 1a: Search-grounded Gemini call using the primary key.
  console.log('🔍 [Transport] Trying Gemini Key 1 + Search Grounding...');
  try {
    raw = await callGemini(geminiKey1, prompt, true);
    dataSource = 'gemini_key_1_grounded';
    console.log('✅ [Transport] Success via Gemini Key 1 + Search Grounding');
    console.log(`📊 [Transport] Final data source used: ${dataSource}`);
    return { options: normalizeOptions(raw, dataSource), dataSource };
  } catch (error: any) {
    console.error(`❌ [Transport] Gemini Key 1 + Grounding failed: ${error?.message || error}`);
  }

  // Layer 1b: Search-grounded Gemini retry using the secondary key.
  console.log('🔍 [Transport] Trying Gemini Key 2 + Search Grounding...');
  try {
    raw = await callGemini(geminiKey2, prompt, true);
    dataSource = 'gemini_key_2_grounded';
    console.log('✅ [Transport] Success via Gemini Key 2 + Search Grounding');
    console.log(`📊 [Transport] Final data source used: ${dataSource}`);
    return { options: normalizeOptions(raw, dataSource), dataSource };
  } catch (error: any) {
    console.error(`❌ [Transport] Gemini Key 2 + Grounding failed: ${error?.message || error}`);
  }

  // Layer 3: Groq fallback with the same transport prompt.
  console.log('🔍 [Transport] Trying Groq AI fallback...');
  try {
    raw = await callGroq(groqKey, prompt);
    dataSource = 'groq';
    console.log('✅ [Transport] Success via Groq AI');
    console.log(`📊 [Transport] Final data source used: ${dataSource}`);
    return { options: normalizeOptions(raw, dataSource), dataSource };
  } catch (error: any) {
    console.error(`❌ [Transport] Groq failed: ${error?.message || error}`);
  }

  // Layer 4: Static fallback so the UI always has transport cards.
  dataSource = 'static_fallback';
  console.warn('⚠️ [Transport] All layers failed. Using static hardcoded fallback data.');
  console.log(`📊 [Transport] Final data source used: ${dataSource}`);
  return { options: staticTransportFallback(destinationCity, dataSource), dataSource };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const destination = String(body?.destination || '').trim();
    const destinationCity = String(body?.destinationCity || destination || '').trim();
    const destinationCountry = String(body?.destinationCountry || '').trim();
    const transportPriority = String(body?.transportPriority || 'cheapest').trim();
    const prompt = buildTransportPrompt(destinationCity, destinationCountry, destination, transportPriority);
    const result = await getTransportOptions(prompt, destinationCity);

    return NextResponse.json({
      ...result,
      destination,
      destinationCity,
      destinationCountry,
    });
  } catch (error: any) {
    console.error(`❌ [Transport] Request handler failed: ${error?.message || error}`);
    const dataSource: TransportDataSource = 'static_fallback';
    console.warn('⚠️ [Transport] All layers failed. Using static hardcoded fallback data.');
    console.log(`📊 [Transport] Final data source used: ${dataSource}`);
    return NextResponse.json({
      options: staticTransportFallback('', dataSource),
      dataSource,
    });
  }
}
