import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export async function POST(request: Request) {
  try {
    const { destinationCity, destinationCountry } = await request.json();

    if (!destinationCity) {
      return NextResponse.json({ error: 'Missing destinationCity' });
    }

    console.log('\nCOST ESTIMATES - fetching for:', destinationCity, destinationCountry);

    const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

    const prompt = `You are a travel cost expert. For a trip to ${destinationCity}, ${destinationCountry || ''}, provide realistic average costs in USD for a tourist. Return ONLY a JSON object with no extra text, no markdown, no backticks, in exactly this format:
{
  "dailyMeals": <average daily food cost per person in USD>,
  "dailyTransport": <average daily local transport cost per person in USD>,
  "dailyMiscellaneous": <average daily miscellaneous expenses per person in USD>,
  "averageUberOrTaxi": <average single taxi/uber ride cost in USD>,
  "averageRoundTripFlight": <average economy round-trip flight cost in USD from a major international hub>,
  "averageHotelPerNight": <average mid-range hotel nightly cost in USD for one room>,
  "currencyNote": <one short sentence about the local currency and tipping culture>
}
Base these on real current tourist averages for ${destinationCity}. Do not invent numbers.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: prompt }] }],
    });

    const raw = (response.text || '').trim();
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    console.log('📍 DESTINATION COST ESTIMATES FOR:', destinationCity);
    console.log('🍽️ Daily meals per person:', parsed.dailyMeals);
    console.log('🚌 Daily transport per person:', parsed.dailyTransport);
    console.log('💸 Daily miscellaneous per person:', parsed.dailyMiscellaneous);
    console.log('🚕 Average taxi/ride cost:', parsed.averageUberOrTaxi);
    console.log('✈️ Average round-trip flight:', parsed.averageRoundTripFlight);
    console.log('🏨 Average hotel per night:', parsed.averageHotelPerNight);
    console.log('💱 Currency note:', parsed.currencyNote);
    console.log('🔢 Total daily cost per person:', (parsed.dailyMeals || 0) + (parsed.dailyTransport || 0) + (parsed.dailyMiscellaneous || 0));

    return NextResponse.json({
      dailyMeals: parsed.dailyMeals || 50,
      dailyTransport: parsed.dailyTransport || 20,
      dailyMiscellaneous: parsed.dailyMiscellaneous || 15,
      averageUberOrTaxi: parsed.averageUberOrTaxi || 10,
      averageRoundTripFlight: parsed.averageRoundTripFlight || 800,
      averageHotelPerNight: parsed.averageHotelPerNight || 120,
      currencyNote: parsed.currencyNote || '',
      isEstimate: false,
    });
  } catch (error: any) {
    console.error('COST ESTIMATES ERROR:', error?.message);
    return NextResponse.json({
      dailyMeals: 50,
      dailyTransport: 20,
      dailyMiscellaneous: 15,
      averageUberOrTaxi: 10,
      averageRoundTripFlight: 800,
      averageHotelPerNight: 120,
      currencyNote: '',
      isEstimate: true,
      error: error?.message,
    });
  }
}