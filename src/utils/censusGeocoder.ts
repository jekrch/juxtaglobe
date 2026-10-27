import type { LocationCoordinates } from '../types';

// The US Census Bureau geocodes US street addresses from its address range data, with no API key.
// It has houses OpenStreetMap is missing, but sends no CORS headers, so it's called as JSONP.
const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const TIMEOUT_MS = 8000;
// A house number followed by at least a street name and type, e.g. "2759 Garfield St"
const STREET_ADDRESS_PATTERN = /^\d+[a-z]?\s+\S+\s+\S+/i;
// Directions stay capitalized, e.g. "2759 NE Garfield St"
const UPPERCASE_WORDS = /^(N|S|E|W|NE|NW|SE|SW)$/;

export interface AddressMatch {
  address: string;
  locality: string;
  coords: LocationCoordinates;
}

interface CensusResponse {
  result?: {
    addressMatches?: { matchedAddress: string; coordinates: { x: number; y: number } }[];
  };
}

export const isStreetAddress = (query: string): boolean => STREET_ADDRESS_PATTERN.test(query.trim());

const titleCase = (text: string) => text
  .split(' ')
  .map(word => UPPERCASE_WORDS.test(word) ? word : word.charAt(0) + word.slice(1).toLowerCase())
  .join(' ');

let callbackCount = 0;

const fetchJsonp = <T>(url: string, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
  const callbackName = `censusGeocoderCallback${callbackCount++}`;
  const callbacks = window as unknown as Record<string, unknown>;
  const script = document.createElement('script');
  const cleanUp = () => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    script.remove();
    delete callbacks[callbackName];
  };
  const onAbort = () => {
    cleanUp();
    reject(new DOMException('Aborted', 'AbortError'));
  };
  const timer = setTimeout(() => {
    cleanUp();
    reject(new Error('Census geocoder timed out'));
  }, TIMEOUT_MS);

  callbacks[callbackName] = (data: T) => {
    cleanUp();
    resolve(data);
  };
  script.onerror = () => {
    cleanUp();
    reject(new Error('Census geocoder request failed'));
  };
  signal.addEventListener('abort', onAbort);
  script.src = `${url}&callback=${callbackName}`;
  document.head.appendChild(script);
});

/** Find a US street address, e.g. "2759 Garfield St NE, Minneapolis, MN" */
export const geocodeUsAddress = async (query: string, signal: AbortSignal): Promise<AddressMatch[]> => {
  const params = new URLSearchParams({ address: query, benchmark: 'Public_AR_Current', format: 'jsonp' });
  const data = await fetchJsonp<CensusResponse>(`${CENSUS_URL}?${params}`, signal);
  return (data.result?.addressMatches ?? []).map(({ matchedAddress, coordinates }) => {
    // e.g. "2759 NE GARFIELD ST, MINNEAPOLIS, MN, 55418"
    const [street, city, state, zip] = matchedAddress.split(', ');
    return {
      address: titleCase(street),
      locality: [city && titleCase(city), [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      coords: { lat: coordinates.y, lng: coordinates.x },
    };
  });
};
