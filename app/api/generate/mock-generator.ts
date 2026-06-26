type MockSource = 'groq' | 'deepseek';

type FlightParams = {
  origin: string;
  destination: string;
  destinationCity?: string;
  destinationCountry?: string;
  departureDate: string;
  returnDate?: string;
  tripType?: string;
  adults?: number;
  children?: number;
  cabinClass?: string;
};

type HotelParams = FlightParams & {
  nights?: number;
  hotelStars?: number;
  hotelRooms?: number;
  hotelRoomsPerApartment?: number;
};

export function buildFlightsPrompt(params: FlightParams) {
  return `Return exactly one JSON object with a "flights" array containing exactly 5 realistic flight offers. Do not include markdown or commentary.

Route: ${params.origin} to ${params.destination} (${params.destinationCity || params.destination}, ${params.destinationCountry || 'destination country'}).
Trip: ${params.tripType || 'round_trip'}, departure date ${params.departureDate}, return date ${params.returnDate || 'not applicable'}, ${params.adults || 1} adult(s), ${params.children || 0} child(ren), ${params.cabinClass || 'economy'} cabin.

Use real airlines that actually fly this route, correct IATA airport and airline codes, realistic USD prices and realistic travel durations for this distance. Use the departure date in actual ISO 8601 departing_at and arriving_at timestamps. Airline logo URLs must use https://logo.clearbit.com/{lowercased-airline-name}.com.

Schema: {"flights":[{"id":"","slices":[{"id":"","duration":"PT2H","segments":[{"id":"","departing_at":"${params.departureDate}T08:00:00","arriving_at":"${params.departureDate}T10:00:00","duration":"PT2H","origin":{"iata_code":"","name":"","city_name":""},"destination":{"iata_code":"","name":"","city_name":""},"origin_name":"","destination_name":"","origin_terminal":"","destination_terminal":"","aircraft_name":"","marketing_carrier":{"name":"","iata_code":"","logo_symbol_url":"https://logo.clearbit.com/airline.com","logo_url":"https://logo.clearbit.com/airline.com"},"marketing_carrier_flight_number":"","cabin_class":"","legroom":"","amenities":[],"carbon_emissions":0,"notes":[]}],"layovers":[]}],"passengers":[{"type":"adult"}],"total_amount":0,"display_price":0,"priceSource":"provider","raw_price":0,"baggage_metadata":{"carry_on":1,"checked":0},"estimated_baggage_fee":0,"total_included_baggage":0,"owner":{"name":"","iata_code":"","logo_symbol_url":"https://logo.clearbit.com/airline.com","logo_url":"https://logo.clearbit.com/airline.com"},"currency":"USD","trip_type":"","booking_token":"","departure_token":"","airline_logo":"https://logo.clearbit.com/airline.com","price_insights":null,"dataSource":""}]}`;
}

export function buildHotelsPrompt(params: HotelParams) {
  return `Return exactly one JSON object with a "hotels" array containing exactly 5 realistic hotel offers. Do not include markdown or commentary.

Destination: ${params.destinationCity || params.destination}, ${params.destinationCountry || 'destination country'}. Check-in: ${params.departureDate}. Nights: ${params.nights || 1}. Requested hotel class: ${params.hotelStars || 3}. Use believable local hotel names, locations, ratings, review counts, and nightly USD prices.

Schema: {"hotels":[{"id":"","type":"hotel","name":"","price":0,"totalPrice":0,"nights":${params.nights || 1},"apartments":1,"roomsPerApartment":1,"bedsRequested":1,"priceSource":"estimated","priceLabel":"Estimated nightly price","rating":0,"overallRating":0,"reviews":0,"description":"","location":"","amenities":[],"nearbyPlaces":[],"images":[{"thumbnail":"https://picsum.photos/seed/hotel/800/600","original_image":"https://picsum.photos/seed/hotel/800/600"}],"lat":0,"lon":0,"source":"mock","verified":false,"hotelClass":3,"deal":"","address":"","website":"","propertyToken":"","checkInTime":"15:00","checkOutTime":"12:00","locationRating":null,"reviewBreakdown":[],"excludedAmenities":[],"essentialInfo":[],"gpsCoordinates":{"latitude":0,"longitude":0},"raw":null,"dataSource":""}]}`;
}

async function callJsonApi(url: string, key: string | undefined, model: string, prompt: string, provider: string) {
  if (!key) return '{}';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) throw new Error(`${provider} returned ${response.status}`);
    const json = await response.json();
    return json?.choices?.[0]?.message?.content || '{}';
  } catch (error) {
    console.error(`${provider} mock generation error:`, error);
    return '{}';
  }
}

export function callGroq(prompt: string): Promise<string> {
  return callJsonApi('https://api.groq.com/openai/v1/chat/completions', process.env.NEXT_PUBLIC_GROQ_API_KEY, 'llama-3.3-70b-versatile', prompt, 'Groq');
}

export function callDeepSeek(prompt: string): Promise<string> {
  return callJsonApi('https://api.deepseek.com/chat/completions', process.env.DEEPSEEK_API_KEY, 'deepseek-chat', prompt, 'DeepSeek');
}

function readItems(content: string, key: 'flights' | 'hotels') {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed?.[key]) ? parsed[key] : [];
  } catch {
    return [];
  }
}

async function generateMock<T extends FlightParams>(params: T, source: MockSource, key: 'flights' | 'hotels', prompt: string) {
  let actualSource: 'groq' | 'deepseek' | 'groq-fallback' = source;
  let items = readItems(source === 'deepseek' ? await callDeepSeek(prompt) : await callGroq(prompt), key);

  if (source === 'deepseek' && items.length === 0) {
    actualSource = 'groq-fallback';
    items = readItems(await callGroq(prompt), key);
  }

  return items.map((item: any) => ({ ...item, dataSource: actualSource }));
}

export function generateMockFlights(params: FlightParams, source: MockSource) {
  return generateMock(params, source, 'flights', buildFlightsPrompt(params));
}

export function generateMockHotels(params: HotelParams, source: MockSource) {
  return generateMock(params, source, 'hotels', buildHotelsPrompt(params));
}
