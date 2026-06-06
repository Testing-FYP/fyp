import { NextRequest, NextResponse } from 'next/server';

const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

const COUNTRY_CODE_BY_NAME: Record<string, string> = {
  afghanistan: 'AF',
  albania: 'AL',
  algeria: 'DZ',
  andorra: 'AD',
  angola: 'AO',
  argentina: 'AR',
  armenia: 'AM',
  australia: 'AU',
  austria: 'AT',
  azerbaijan: 'AZ',
  bahrain: 'BH',
  bangladesh: 'BD',
  belgium: 'BE',
  brazil: 'BR',
  bulgaria: 'BG',
  canada: 'CA',
  china: 'CN',
  croatia: 'HR',
  cyprus: 'CY',
  czechia: 'CZ',
  'czech republic': 'CZ',
  denmark: 'DK',
  egypt: 'EG',
  estonia: 'EE',
  finland: 'FI',
  france: 'FR',
  georgia: 'GE',
  germany: 'DE',
  greece: 'GR',
  'hong kong': 'HK',
  hungary: 'HU',
  india: 'IN',
  indonesia: 'ID',
  ireland: 'IE',
  israel: 'IL',
  italy: 'IT',
  japan: 'JP',
  jordan: 'JO',
  kuwait: 'KW',
  lebanon: 'LB',
  malaysia: 'MY',
  mexico: 'MX',
  morocco: 'MA',
  netherlands: 'NL',
  'new zealand': 'NZ',
  norway: 'NO',
  oman: 'OM',
  pakistan: 'PK',
  philippines: 'PH',
  poland: 'PL',
  portugal: 'PT',
  qatar: 'QA',
  romania: 'RO',
  russia: 'RU',
  'saudi arabia': 'SA',
  singapore: 'SG',
  'south africa': 'ZA',
  'south korea': 'KR',
  spain: 'ES',
  'sri lanka': 'LK',
  sweden: 'SE',
  switzerland: 'CH',
  taiwan: 'TW',
  thailand: 'TH',
  tunisia: 'TN',
  turkey: 'TR',
  turkiye: 'TR',
  uae: 'AE',
  'united arab emirates': 'AE',
  'united kingdom': 'GB',
  uk: 'GB',
  'united states': 'US',
  'united states of america': 'US',
  usa: 'US',
  vietnam: 'VN',
};

function parseLocationLabel(name: string) {
  const parts = String(name || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  return {
    city_name: parts[0] || '',
    country_name: parts.length >= 2 ? parts.slice(1).join(', ') : '',
  };
}

function parseCountryFromDescription(description: string) {
  const text = String(description || '').trim();
  const match = text.match(/\b(?:in|of)\s+(.+)$/i);
  return match?.[1]?.trim().replace(/[.。]$/, '') || '';
}

function getCountryCode(countryName: string) {
  return COUNTRY_CODE_BY_NAME[countryName.trim().toLowerCase()] || '';
}

function isValidAirportSuggestion(suggestion: any) {
  const iata = String(suggestion?.iata_code || '').trim().toUpperCase();
  const cityName = String(suggestion?.city_name || '').trim();
  const airportName = String(suggestion?.name || '').trim();

  return /^[A-Z]{3}$/.test(iata) && cityName.length > 0 && airportName.length > 0;
}

function getRelevanceScore(suggestion: any, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const haystack = [
    suggestion?.city_name,
    suggestion?.airport_city_name,
    suggestion?.name,
    suggestion?.iata_code,
    suggestion?.country_name,
    suggestion?.description,
  ].map(value => String(value || '').toLowerCase());

  if (haystack.some(value => value === normalizedQuery)) return 0;
  if (haystack.some(value => value.startsWith(normalizedQuery))) return 1;
  if (haystack.some(value => value.includes(normalizedQuery))) return 2;
  return 3;
}

function normalizeAirportSuggestion(params: {
  airport: any;
  suggestion: any;
  suggestionIndex: number;
  airportIndex: number;
}) {
  const { airport, suggestion, suggestionIndex, airportIndex } = params;
  const suggestionName = String(suggestion?.name || '').trim();
  const description = String(suggestion?.description || '').trim();
  const parsedLocation = parseLocationLabel(suggestionName);
  const airportName = String(airport?.name || '').trim();
  const airportCityName = String(airport?.city || '').trim();
  const cityName = String(parsedLocation.city_name || airportCityName).trim();
  const countryName = String(parsedLocation.country_name || parseCountryFromDescription(description)).trim();
  const countryCode = getCountryCode(countryName);
  const iataCode = String(airport?.id || '').trim().toUpperCase();

  return {
    id: `${iataCode}-${suggestionIndex}-${airportIndex}`,
    name: airportName,
    iata_code: iataCode,
    city_name: cityName,
    airport_city_name: airportCityName,
    country_name: countryName,
    country_code: countryCode,
    iata_country_code: countryCode,
    description,
    type: String(suggestion?.type || 'city').trim(),
    position: Number(suggestion?.position || suggestionIndex + 1),
    distance: String(airport?.distance || '').trim(),
  };
}

export async function GET(request: NextRequest) {
  try {
    const query = String(request.nextUrl.searchParams.get('query') || '').trim();

    if (query.length < 2) {
      return NextResponse.json([]);
    }

    if (!SERPAPI_KEY) {
      return NextResponse.json({ error: 'SERPAPI_API_KEY is not set' }, { status: 500 });
    }

    const serpParams = new URLSearchParams({
      engine: 'google_flights_autocomplete',
      q: query,
      hl: 'en',
      gl: 'us',
      exclude_regions: 'true',
      api_key: SERPAPI_KEY,
    });

    const response = await fetch(`https://serpapi.com/search.json?${serpParams.toString()}`);
    if (!response.ok) {
      throw new Error(`SerpApi autocomplete failed with HTTP ${response.status}`);
    }

    const data = await response.json();
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : [];

    const airports = suggestions
      .flatMap((suggestion: any, suggestionIndex: number) => {
        const airportList = Array.isArray(suggestion?.airports) ? suggestion.airports : [];
        return airportList.map((airport: any, airportIndex: number) =>
          normalizeAirportSuggestion({ airport, suggestion, suggestionIndex, airportIndex })
        );
      })
      .filter(isValidAirportSuggestion)
      .filter((suggestion: any, index: number, list: any[]) =>
        index === list.findIndex(item => item.iata_code === suggestion.iata_code)
      )
      .sort((a: any, b: any) =>
        getRelevanceScore(a, query) - getRelevanceScore(b, query) ||
        Number(a.position || 999) - Number(b.position || 999)
      );

    const normalizedQuery = query.toUpperCase();
    const exactIataMatches = /^[A-Z]{3}$/.test(normalizedQuery)
      ? airports.filter((airport: any) => airport.iata_code === normalizedQuery)
      : [];

    const exactCityMatches = airports.filter((airport: any) =>
      String(airport.city_name || '').trim().toLowerCase() === query.toLowerCase()
    );

    return NextResponse.json(exactIataMatches.length ? exactIataMatches : exactCityMatches.length ? exactCityMatches : airports);
  } catch (error: any) {
    console.error('SerpApi Airport Suggestions Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
