const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

export async function searchSerpApiHotels(params: {
  query: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  countryCode: string;
}) {
  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_API_KEY is not set');
  }

  const searchParams = new URLSearchParams({
    engine: 'google_hotels',
    q: params.query,
    check_in_date: params.checkInDate,
    check_out_date: params.checkOutDate,
    adults: String(params.adults || 2),
    children: String(params.children || 0),
    currency: 'USD',
    hl: 'en',
    gl: (params.countryCode || 'us').toLowerCase(),
    api_key: SERPAPI_KEY,
    no_cache: 'true',
  });

  const response = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpApi hotel search failed with HTTP ${response.status}`);
  }

  return response.json();
}
