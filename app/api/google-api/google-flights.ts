const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

export async function searchSerpApiFlights(params: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  tripType: string;
  adults: number;
  children: number;
  cabinClass: string;
  directOnly?: boolean;
  baggageCount?: number;
  departureToken?: string;
}) {
  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_API_KEY is not set');
  }

  const searchParams = new URLSearchParams({
    engine: 'google_flights',
    departure_id: params.origin,
    arrival_id: params.destination,
    outbound_date: params.departureDate,
    currency: 'USD',
    hl: 'en',
    gl: 'us',
    api_key: SERPAPI_KEY,
  });

  const tripTypeMap: Record<string, string> = {
    one_way: '2',
    round_trip: '1',
    multi_city: '3',
  };
  searchParams.set('type', tripTypeMap[params.tripType] || '1');

  if (params.returnDate && params.tripType === 'round_trip') {
    searchParams.set('return_date', params.returnDate);
  }

  const cabinMap: Record<string, string> = {
    economy: '1',
    premium_economy: '2',
    business: '3',
    first: '4',
  };
  if (cabinMap[params.cabinClass]) {
    searchParams.set('travel_class', cabinMap[params.cabinClass]);
  }

  if (params.adults > 0) searchParams.set('adults', String(params.adults));
  if (params.children > 0) searchParams.set('children', String(params.children));
  if (params.baggageCount && params.baggageCount > 0) searchParams.set('bags', String(params.baggageCount));
  if (params.directOnly) searchParams.set('stops', '1');
  if (params.departureToken) searchParams.set('departure_token', params.departureToken);

  const response = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpApi flight search failed with HTTP ${response.status}`);
  }

  return response.json();
}
