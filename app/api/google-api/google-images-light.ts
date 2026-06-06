const SERPAPI_KEY = process.env.SERPAPI_API_KEY || '';

export type GoogleImagesLightResult = {
  title: string;
  source: string;
  link: string;
  thumbnail: string;
  original: string;
  originalWidth?: number;
  originalHeight?: number;
};

const STOCK_IMAGE_BLOCKLIST = [
  'alamy',
  'shutterstock',
  'getty',
  'istock',
  'dreamstime',
  'depositphotos',
  'adobe stock',
  'stock.adobe',
  '123rf',
  'bigstock',
  'agefotostock',
  'panthermedia',
  'alamyimages',
  'alamy.com',
  'stock photo',
  'stock image',
  'watermark',
];

const PREFERRED_IMAGE_SOURCES = [
  'wikimedia',
  'wikipedia',
  'unsplash',
  'pexels',
  'visit',
  'tourism',
  'lonely planet',
  'tripadvisor',
  'expedia',
  'timeout',
  'culture trip',
  'national geographic',
];

function normalizeText(value: any) {
  return String(value || '').toLowerCase();
}

function imageHaystack(image: any) {
  return [
    image?.title,
    image?.source,
    image?.link,
    image?.raw_link,
    image?.original,
    image?.thumbnail,
  ].map(normalizeText).join(' ');
}

function isBlockedImage(image: any) {
  const haystack = imageHaystack(image);
  return STOCK_IMAGE_BLOCKLIST.some(term => haystack.includes(term));
}

function imageScore(image: any) {
  const haystack = imageHaystack(image);
  const width = Number(image?.original_width || 0);
  const height = Number(image?.original_height || 0);
  const sourceBoost = PREFERRED_IMAGE_SOURCES.some(term => haystack.includes(term)) ? 50 : 0;
  const wideBoost = width > height ? 25 : 0;
  const largeBoost = width >= 1000 || height >= 700 ? 15 : 0;
  const originalBoost = image?.original ? 10 : 0;
  return sourceBoost + wideBoost + largeBoost + originalBoost;
}

export async function searchGoogleImagesLight(params: {
  query: string;
  location?: string;
  countryCode?: string;
  language?: string;
  limit?: number;
}) {
  if (!SERPAPI_KEY) {
    throw new Error('SERPAPI_API_KEY is not set');
  }

  const cleanQuery = [
    params.query,
    'official tourism city view landmark skyline',
    ...STOCK_IMAGE_BLOCKLIST.map(term => term.includes(' ') ? `-"${term}"` : `-${term}`),
  ].join(' ');

  const searchParams = new URLSearchParams({
    engine: 'google_images',
    q: cleanQuery,
    hl: params.language || 'en',
    gl: (params.countryCode || 'us').toLowerCase(),
    imgar: 'w',
    imgsz: 'l',
    image_type: 'photo',
    safe: 'active',
    device: 'desktop',
    api_key: SERPAPI_KEY,
  });

  if (params.location) {
    searchParams.set('location', params.location);
  }

  const debugParams = new URLSearchParams(searchParams);
  debugParams.set('api_key', '[hidden]');
  console.log(`[SerpApi Google Images] ${debugParams.toString()}`);

  const response = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`SerpApi Google Images search failed with HTTP ${response.status}`);
  }

  const json = await response.json();
  const results = Array.isArray(json?.images_results) ? json.images_results : [];
  return results
    .filter((image: any) => !image?.unsafe && !image?.is_product)
    .filter((image: any) => !isBlockedImage(image))
    .filter((image: any) => {
      const original = String(image?.original || '');
      return !original.startsWith('x-raw-image://');
    })
    .filter((image: any) => image?.thumbnail || image?.original)
    .sort((a: any, b: any) => imageScore(b) - imageScore(a))
    .slice(0, Math.max(1, params.limit || 8))
    .map((image: any): GoogleImagesLightResult => ({
      title: image?.title || '',
      source: image?.source || '',
      link: image?.link || image?.raw_link || '',
      thumbnail: image?.thumbnail || image?.serpapi_thumbnail || image?.original || '',
      original: image?.original || image?.thumbnail || image?.serpapi_thumbnail || '',
      originalWidth: image?.original_width,
      originalHeight: image?.original_height,
    }));
}
