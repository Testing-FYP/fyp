import { NextResponse } from 'next/server';

type GeocodedCountry = {
  name?: string;
  iso2?: string;
  code?: string;
  type?: string;
};

type GeocodedState = {
  name?: string;
  iso2?: string;
  code?: string;
  stateCode?: string;
};

type GeocodedCity = {
  id?: string | number;
  name?: string;
  latitude?: string;
  longitude?: string;
};

const GEOCODED_BASE_URL = 'https://api.geocoded.me';

function asArray<T>(value: any): T[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function cleanStateName(value: string) {
  return value.trim().replace(/^[`'‘’]+/, '').trim();
}

async function geocodedFetch(path: string) {
  const response = await fetch(`${GEOCODED_BASE_URL}${path}`, {
    next: { revalidate: 60 * 60 * 24 * 7 },
  });

  if (!response.ok) {
    throw new Error(`Geocoded API failed with ${response.status}`);
  }

  return response.json();
}

async function resolveCountryCode(countryInput: string) {
  const country = countryInput.trim();
  if (/^[a-z]{2}$/i.test(country)) return country.toUpperCase();

  const normalizedCountry = normalizeText(country);
  const searchResults = asArray<GeocodedCountry>(
    await geocodedFetch(`/search?q=${encodeURIComponent(country)}&fields=name,iso2,code,type`)
  );
  const countryResults = searchResults.filter(item => !item.type || item.type === 'country');
  const match = countryResults.find(item => normalizeText(item.name || '') === normalizedCountry);
  const partialMatch = match || countryResults.find(item => normalizeText(item.name || '').includes(normalizedCountry));
  let code = partialMatch?.iso2 || partialMatch?.code;

  if (!code) {
    const countries = asArray<GeocodedCountry>(
      await geocodedFetch('/countries?fields=name,iso2,code')
    );
    const listMatch = countries.find(item => normalizeText(item.name || '') === normalizedCountry);
    const listPartialMatch = listMatch || countries.find(item => normalizeText(item.name || '').includes(normalizedCountry));
    code = listPartialMatch?.iso2 || listPartialMatch?.code;
  }

  if (!code) {
    throw new Error(`Could not find a country code for "${countryInput}".`);
  }

  return code.toUpperCase();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const country = searchParams.get('country') || '';
    const requestedLimit = Number(searchParams.get('limit') || 24);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 80) : 24;

    if (!country.trim()) {
      return NextResponse.json({ error: 'Country is required.' }, { status: 400 });
    }

    const countryCode = await resolveCountryCode(country);
    const statePayload = await geocodedFetch(`/countries/${countryCode}/states?fields=name,iso2,code,stateCode`);
    const states = asArray<GeocodedState>(statePayload);
    const stateNames = Array.from(new Set(
      states
        .map(state => cleanStateName(String(state.name || state.iso2 || state.code || state.stateCode || '')))
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));

    const cityPayloads = states.length
      ? await Promise.all(
          states.slice(0, 80).map(async state => {
            const stateCode = state.iso2 || state.code || state.stateCode;
            if (!stateCode) return [];
            try {
              return asArray<GeocodedCity>(
                await geocodedFetch(`/countries/${countryCode}/states/${encodeURIComponent(stateCode)}/cities?fields=id,name,latitude,longitude`)
              ).map(city => ({ ...city, state: cleanStateName(String(state.name || stateCode)) }));
            } catch {
              return [];
            }
          })
        )
      : [
          asArray<GeocodedCity>(
            await geocodedFetch(`/countries/${countryCode}/cities?fields=id,name,latitude,longitude`)
          ),
        ];

    const seen = new Set<string>();
    const cities = cityPayloads
      .flat()
      .map((city: GeocodedCity & { state?: string }) => ({
        id: String(city.id || `${city.name}-${city.latitude}-${city.longitude}`),
        name: String(city.name || '').trim(),
        state: city.state || '',
        latitude: city.latitude || '',
        longitude: city.longitude || '',
      }))
      .filter(city => {
        if (!city.name) return false;
        const key = normalizeText(`${city.name}-${city.state}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);

    return NextResponse.json({ countryCode, states: stateNames, cities });
  } catch (error: any) {
    console.error('Geocoded cities API error:', error?.message || error);
    return NextResponse.json({ error: error?.message || 'Could not load cities.' }, { status: 503 });
  }
}
