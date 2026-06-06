const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

export async function searchSerpApiHotels(params: {
  query: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  children: number;
  countryCode: string;
  bedrooms?: number;
  hotelClass?: number | string;
  vacationRentals?: boolean;
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

  const useVacationRentals = !!params.vacationRentals;

  if (useVacationRentals) {
    searchParams.set('vacation_rentals', 'true');
  }
  if (useVacationRentals && Number(params.bedrooms || 0) > 0) {
    searchParams.set('bedrooms', String(Math.max(1, Number(params.bedrooms))));
  }
  if (!useVacationRentals && params.hotelClass) {
    searchParams.set('hotel_class', String(params.hotelClass));
  }

  const debugParams = new URLSearchParams(searchParams);
  debugParams.set('api_key', '[hidden]');
  console.log(`[SerpApi Google Hotels] ${debugParams.toString()}`);

  const response = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpApi hotel search failed with HTTP ${response.status}`);
  }

  return response.json();
}
