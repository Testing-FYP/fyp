import { NextRequest, NextResponse } from 'next/server';

const COUNTRY_NAMES: Record<string, string> = {
  LB: 'Lebanon', TR: 'Turkey', FR: 'France', GB: 'United Kingdom',
  US: 'United States', AE: 'United Arab Emirates', DE: 'Germany',
  IT: 'Italy', ES: 'Spain', NL: 'Netherlands', JP: 'Japan',
  SG: 'Singapore', AU: 'Australia', CA: 'Canada', BR: 'Brazil',
  EG: 'Egypt', QA: 'Qatar', SA: 'Saudi Arabia', TH: 'Thailand',
  ZA: 'South Africa', GR: 'Greece', PT: 'Portugal', CH: 'Switzerland',
  AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  PL: 'Poland', CZ: 'Czech Republic', HU: 'Hungary', RO: 'Romania',
  IN: 'India', CN: 'China', KR: 'South Korea', MX: 'Mexico',
  AR: 'Argentina', MA: 'Morocco', NG: 'Nigeria', KE: 'Kenya',
  DZ: 'Algeria', PK: 'Pakistan', ID: 'Indonesia', MY: 'Malaysia',
  PH: 'Philippines', NZ: 'New Zealand', JO: 'Jordan', KW: 'Kuwait',
  BH: 'Bahrain', OM: 'Oman', IQ: 'Iraq', IR: 'Iran',
};

export async function GET(request: NextRequest) {
  try {
    const query = String(request.nextUrl.searchParams.get('query') || '').trim();
    if (query.length < 2) return NextResponse.json({ airports: [] });

    const token = process.env.DUFFEL_ACCESS_TOKEN;
    if (!token) return NextResponse.json({ airports: [] });

    const url = `https://api.duffel.com/places/suggestions?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Duffel-Version': 'v2',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error('Duffel API error:', res.status, await res.text());
      return NextResponse.json({ airports: [] });
    }

    const json = await res.json();
    console.log('Duffel raw response:', JSON.stringify(json.data?.slice(0, 2), null, 2));

    const airports = (json.data || [])
      .filter((place: any) => /^[A-Z]{3}$/.test(String(place.iata_code || '').toUpperCase()))
      .map((place: any, index: number) => ({
        id: place.id || `${place.iata_code}-${index}`,
        name: place.name || place.city_name || place.iata_code,
        iata_code: String(place.iata_code).toUpperCase(),
        city_name: place.city_name || place.name || '',
        airport_city_name: place.city_name || '',
        country_name: COUNTRY_NAMES[place.iata_country_code || ''] || place.iata_country_code || '',
        iata_country_code: place.iata_country_code || '',
        description: [place.name, place.city_name, place.country_name].filter(Boolean).join(', '),
        type: place.type || 'airport',
        position: index + 1,
        distance: '',
      }));

    return NextResponse.json({ airports });
  } catch (error) {
    console.error('Duffel Airport Suggestions Error:', error);
    return NextResponse.json({ airports: [] });
  }
}
