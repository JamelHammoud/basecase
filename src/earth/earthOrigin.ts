export interface EarthPlace {
  lat: number;
  lon: number;
  altitudeM: number | null;
}

export interface EarthOrigin extends EarthPlace {
  offsetM: number;
  hidden?: boolean;
}

export const MAX_OFFSET_M = 1000;

const MIN_ALTITUDE_M = -1000;
const MAX_ALTITUDE_M = 10000;
const NUMBER = String.raw`[-+]?\d+(?:\.\d+)?`;
const SEPARATOR = String.raw`\s*[,\s]\s*`;
const COORDINATES = new RegExp(
  String.raw`^\s*(${NUMBER})\s*°?\s*([NS])?${SEPARATOR}(${NUMBER})\s*°?\s*([EW])?(?:${SEPARATOR}(${NUMBER}))?\s*$`,
  'i',
);
const PIN = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const AT = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;
const QUERY_KEYS = ['q', 'query', 'll', 'center', 'destination'];
const MAPS_HOST = /^(?:www\.)?google(?:\.[a-z]{2,3}){1,2}$/i;

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const inRange = (value: number, min: number, max: number) => value >= min && value <= max;

function place(lat: number, lon: number, altitudeM: number | null): EarthPlace | null {
  if (!inRange(lat, -90, 90) || !inRange(lon, -180, 180)) return null;

  if (altitudeM !== null && !inRange(altitudeM, MIN_ALTITUDE_M, MAX_ALTITUDE_M)) return null;

  return { lat, lon, altitudeM };
}

const signed = (value: string, hemisphere: string | undefined, negative: string) =>
  hemisphere?.toUpperCase() === negative ? -Math.abs(Number(value)) : Number(value);

function coordinatesPlace(text: string): EarthPlace | null {
  const match = COORDINATES.exec(text);

  if (!match) return null;

  const [, lat, ns, lon, ew, altitude] = match;

  return place(signed(lat, ns, 'S'), signed(lon, ew, 'W'), altitude === undefined ? null : Number(altitude));
}

function mapsUrl(text: string): URL | null {
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const maps =
      url.hostname === 'maps.google.com' || (MAPS_HOST.test(url.hostname) && url.pathname.startsWith('/maps'));

    return maps ? url : null;
  } catch {
    return null;
  }
}

function linkPlace(text: string): EarthPlace | null {
  const url = mapsUrl(text.trim());

  if (!url) return null;

  const pin = PIN.exec(url.pathname);

  if (pin) return place(Number(pin[1]), Number(pin[2]), null);

  for (const key of QUERY_KEYS) {
    const found = coordinatesPlace(url.searchParams.get(key) ?? '');

    if (found) return { ...found, altitudeM: null };
  }

  const at = AT.exec(url.pathname);

  return at ? place(Number(at[1]), Number(at[2]), null) : null;
}

export const readPlace = (text: string): EarthPlace | null => coordinatesPlace(text) ?? linkPlace(text);

export function checkedOrigin(value: unknown): EarthOrigin | null {
  const origin = value as Partial<EarthOrigin> | null | undefined;

  if (!origin || !finite(origin.lat) || !finite(origin.lon) || !finite(origin.offsetM)) return null;

  if (Math.abs(origin.offsetM) > MAX_OFFSET_M) return null;

  const altitude = finite(origin.altitudeM) ? origin.altitudeM : null;
  const placed = place(origin.lat, origin.lon, altitude);

  return placed && { ...placed, offsetM: origin.offsetM, ...(origin.hidden === true ? { hidden: true } : {}) };
}

export const placeText = (origin: EarthPlace) =>
  [origin.lat, origin.lon, ...(origin.altitudeM === null ? [] : [origin.altitudeM])].join(', ');
