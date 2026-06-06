import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

function loadPromptTemplate(fileName: string) {
  return fs.readFileSync(path.join(process.cwd(), 'app', 'ai-prompts', fileName), 'utf8');
}

function fillPromptTemplate(template: string, values: Record<string, string | number | boolean>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

type SurprisePreferences = {
  origin?: string;
  departureDate?: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  budget?: number;
  region?: string;
  climate?: string;
  pace?: string;
  interests?: string[];
  includeFlight?: boolean;
  includeHotel?: boolean;
};

type SurpriseDestination = {
  city: string;
  country: string;
  iata: string;
  airportName: string;
  matchScore: number;
  headline: string;
  reasons: string[];
  tags: string[];
  bestFor: string;
  estimatedBudget: number;
  flightTimeHint: string;
};

function readBoundedNumber(value: unknown, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return null;
  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

function normalizeDestination(destination: any): SurpriseDestination | null {
  const city = String(destination?.city || '').trim();
  const country = String(destination?.country || '').trim();
  const iata = String(destination?.iata || '').trim().toUpperCase();
  const airportName = String(destination?.airportName || '').trim();
  const headline = String(destination?.headline || '').trim();
  const bestFor = String(destination?.bestFor || '').trim();
  const flightTimeHint = String(destination?.flightTimeHint || '').trim();
  const matchScore = readBoundedNumber(destination?.matchScore, 60, 99);
  const estimatedBudget = readBoundedNumber(destination?.estimatedBudget, 500, 25000);

  if (!city || !country || !/^[A-Z]{3}$/.test(iata) || !airportName || !headline || !bestFor || !flightTimeHint) return null;
  if (matchScore === null || estimatedBudget === null) return null;

  const reasons = Array.isArray(destination?.reasons)
    ? destination.reasons.map((reason: any) => String(reason).trim()).filter(Boolean).slice(0, 3)
    : [];
  const tags = Array.isArray(destination?.tags)
    ? destination.tags.map((tag: any) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 5)
    : [];

  if (reasons.length < 3 || tags.length === 0) return null;

  return {
    city,
    country,
    iata,
    airportName,
    matchScore,
    headline,
    reasons,
    tags,
    bestFor,
    estimatedBudget,
    flightTimeHint,
  };
}

function parseAiJson(raw: string) {
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(cleaned);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateAiJson(prompt: string) {
  const primaryKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  const secondaryKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY_V2 || '';
  const groqKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || '';
  const errors: string[] = [];

  const tryGemini = async (apiKey: string, label: string) => {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });

    return {
      json: parseAiJson(response.text || '{}'),
      source: label,
    };
  };

  if (primaryKey) {
    try {
      const result = await tryGemini(primaryKey, 'gemini_primary');
      console.log('Surprise Me AI succeeded with Gemini primary key');
      return result;
    } catch (error: any) {
      errors.push(`Gemini primary: ${error?.message || 'failed'}`);
      console.error('Surprise Me Gemini primary failed:', error?.message);
    }
  }

  if (secondaryKey) {
    if (primaryKey) await delay(2000);
    try {
      const result = await tryGemini(secondaryKey, 'gemini_secondary');
      console.log('Surprise Me AI succeeded with Gemini secondary key');
      return result;
    } catch (error: any) {
      errors.push(`Gemini secondary: ${error?.message || 'failed'}`);
      console.error('Surprise Me Gemini secondary failed:', error?.message);
    }
  }

  if (groqKey) {
    if (primaryKey || secondaryKey) await delay(2000);
    try {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
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
      console.log('Surprise Me AI succeeded with Groq');
      return {
        json: parseAiJson(groqContent),
        source: 'groq',
      };
    } catch (error: any) {
      errors.push(`Groq: ${error?.message || 'failed'}`);
      console.error('Surprise Me Groq failed:', error?.message);
    }
  }

  if (errors.length === 0) {
    throw new Error('AI destination generation is not configured.');
  }

  throw new Error(`All AI destination providers failed. ${errors.join(' | ')}`);
}

export async function POST(request: Request) {
  try {
    const preferences: SurprisePreferences = await request.json();

    if (!preferences.origin) {
      return NextResponse.json({ error: 'Origin airport is required.' }, { status: 400 });
    }

    const travelerCount = (preferences.adults || 0) + (preferences.children || 0);
    if (travelerCount < 1) {
      return NextResponse.json({ error: 'Add at least one traveler.' }, { status: 400 });
    }

    if (!preferences.departureDate) {
      return NextResponse.json({ error: 'Departure date is required.' }, { status: 400 });
    }

    if (!preferences.budget || preferences.budget < 1) {
      return NextResponse.json({ error: 'Budget is required.' }, { status: 400 });
    }

    if (!preferences.region || !preferences.climate || !preferences.pace) {
      return NextResponse.json({ error: 'Region, climate, and pace are required.' }, { status: 400 });
    }

    const interests = Array.isArray(preferences.interests) ? preferences.interests.join(', ') : 'balanced mix';
    const travelers = `${preferences.adults || 1} adults, ${preferences.children || 0} children`;
    const dateText = preferences.departureDate
      ? `${preferences.departureDate}${preferences.returnDate ? ` to ${preferences.returnDate}` : ''}`
      : 'flexible dates';

    const prompt = fillPromptTemplate(loadPromptTemplate('surprise-destinations.txt'), {
      ORIGIN: preferences.origin || '',
      DATES: dateText,
      TRAVELERS: travelers,
      BUDGET: preferences.budget || 'flexible',
      REGION: preferences.region || 'open',
      CLIMATE: preferences.climate || 'open',
      PACE: preferences.pace || 'balanced',
      INTERESTS: interests,
      INCLUDE_FLIGHTS: preferences.includeFlight !== false,
      INCLUDE_HOTELS: preferences.includeHotel !== false,
    });

    const { json: parsed, source } = await generateAiJson(prompt);
    const destinations = (Array.isArray(parsed?.destinations) ? parsed.destinations : [])
      .map(normalizeDestination)
      .filter(Boolean)
      .slice(0, 5);

    if (destinations.length === 0) {
      return NextResponse.json({ error: 'AI did not return usable destination options.' }, { status: 502 });
    }

    return NextResponse.json({ destinations, source });
  } catch (error: any) {
    console.error('Surprise API error:', error?.message);
    return NextResponse.json({ error: error?.message || 'AI destination generation failed.' }, { status: 503 });
  }
}
