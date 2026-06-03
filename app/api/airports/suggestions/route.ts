import { NextResponse } from 'next/server';
import { duffel } from '@/lib/duffel';

const countryNameFormatter = new Intl.DisplayNames(['en'], { type: 'region' });

function isValidAirportSuggestion(suggestion: any) {
  const iata = String(suggestion?.iata_code || '').trim();
  const cityName = String(suggestion?.city_name || '').trim();
  const airportName = String(suggestion?.name || '').trim();
  const countryCode = String(suggestion?.iata_country_code || suggestion?.country_code || '').trim();

  return (
    /^[A-Z]{3}$/.test(iata) &&
    cityName.length > 0 &&
    airportName.length > 0 &&
    countryCode.length > 0 &&
    airportName.toLowerCase() !== 'none' &&
    cityName.toLowerCase() !== 'none'
  );
}

function normalizeAirportSuggestion(suggestion: any) {
  const countryCode = String(suggestion?.iata_country_code || suggestion?.country_code || '').trim().toUpperCase();
  return {
    ...suggestion,
    iata_code: String(suggestion?.iata_code || '').trim().toUpperCase(),
    city_name: String(suggestion?.city_name || '').trim(),
    name: String(suggestion?.name || '').trim(),
    country_code: countryCode,
    iata_country_code: countryCode,
    country_name: String(suggestion?.country_name || countryNameFormatter.of(countryCode) || countryCode).trim(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query');

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    const suggestions = await duffel.suggestions.list({
      query,
    });

    const filteredSuggestions = (suggestions.data || [])
      .filter(isValidAirportSuggestion)
      .map(normalizeAirportSuggestion);
    return NextResponse.json(filteredSuggestions);
  } catch (error: any) {
    console.error('Duffel Suggestions Error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch suggestions' }, { status: 500 });
  }
}
