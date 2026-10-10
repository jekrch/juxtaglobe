import type { LocationCoordinates } from '../types';

// One coordinate: decimal degrees or degrees-minutes(-seconds), with an optional sign or a
// hemisphere letter before or after, e.g. "-74.006", "40.7128° N", "N 40°42'46.1"", "74°0.37'W"
const DEGREES = String.raw`([-+]?\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*'\s*)?(?:(\d+(?:\.\d+)?)\s*"\s*)?`;
// A hemisphere letter goes before or after, never both, so "N 40 W 74" can't read as "N 40 W"
const COMPONENT = String.raw`(?:([NSEW])\s*${DEGREES}|${DEGREES}([NSEW])?)`;
// Two coordinates separated by a comma, semicolon, slash, or whitespace
const COORDINATES_PATTERN = new RegExp(String.raw`^${COMPONENT}(?:\s*[,;/]\s*|\s+)${COMPONENT}$`);
const GROUPS_PER_COMPONENT = 8;

interface ParsedComponent {
  value: number;
  axis: 'lat' | 'lng' | null;
}

const parseComponent = (groups: (string | undefined)[]): ParsedComponent | null => {
  const [prefixHemisphere, ...rest] = groups;
  const hemisphere = prefixHemisphere ?? rest[6];
  const [degreesText, minutesText, secondsText] = prefixHemisphere ? rest.slice(0, 3) : rest.slice(3, 6);
  if (!degreesText) return null;

  const degrees = Math.abs(parseFloat(degreesText));
  const minutes = minutesText ? parseFloat(minutesText) : 0;
  const seconds = secondsText ? parseFloat(secondsText) : 0;
  if (minutes >= 60 || seconds >= 60) return null;
  // Only the last part given may have a fraction, e.g. 40°42.5' but not 40.5°42'
  if (minutesText && degreesText.includes('.')) return null;
  if (secondsText && minutesText?.includes('.')) return null;

  const isNegative = degreesText.startsWith('-') || hemisphere === 'S' || hemisphere === 'W';
  const value = (degrees + minutes / 60 + seconds / 3600) * (isNegative ? -1 : 1);
  const axis = hemisphere === 'N' || hemisphere === 'S' ? 'lat' : hemisphere ? 'lng' : null;
  return { value, axis };
};

/**
 * Parse a latitude/longitude pair typed as text. Without hemisphere letters the order is
 * latitude then longitude; with them, either order works ("74°W 40°N").
 */
export const parseCoordinates = (input: string): LocationCoordinates | null => {
  const normalized = input
    .trim()
    .toUpperCase()
    .replace(/[º˚]/g, '°')
    .replace(/[′’‘`]/g, "'")
    .replace(/[″”“]|''/g, '"');
  const match = COORDINATES_PATTERN.exec(normalized);
  if (!match) return null;

  const first = parseComponent(match.slice(1, 1 + GROUPS_PER_COMPONENT));
  const second = parseComponent(match.slice(1 + GROUPS_PER_COMPONENT));
  if (!first || !second) return null;
  if (first.axis && first.axis === second.axis) return null;

  const isSwapped = first.axis === 'lng' || second.axis === 'lat';
  const lat = isSwapped ? second.value : first.value;
  const lng = isSwapped ? first.value : second.value;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
};
