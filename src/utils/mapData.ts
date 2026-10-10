import type { LocationCoordinates, PrehistoricMapOption } from '../types';

export const KANSAS_LOCATION: LocationCoordinates = { lat: 39.8283, lng: -98.5795, altitude: 2.5 };

export const extractMaFromName = (name: string): number => {
  const match = name.match(/~(\d+)\s*Ma/);
  return match ? parseInt(match[1], 10) : Infinity;
};

export const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/\s*\(~?\d+\s*ma\)\s*/, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const prehistoricMapOptionsRaw: Omit<PrehistoricMapOption, 'ageMa' | 'slug'>[] = [
  { name: 'Early Jurassic (~200 Ma)', url: '/paleo/scotese-200ma.jpg', attribution: 'C. R. Scotese, PALEOMAP PaleoAtlas for GPlates v3 (2016). CC BY 4.0. Via Zenodo (doi:10.5281/zenodo.5460860).' },
  { name: 'Early Cretaceous (~120 Ma)', url: '/paleo/scotese-120ma.jpg', attribution: 'C. R. Scotese, PALEOMAP PaleoAtlas for GPlates v3 (2016). CC BY 4.0. Via Zenodo (doi:10.5281/zenodo.5460860).' },
  { name: 'Early Triassic (~240 Ma)', url: '/paleo/scotese-240ma.jpg', attribution: 'C. R. Scotese, PALEOMAP PaleoAtlas for GPlates v3 (2016). CC BY 4.0. Via Zenodo (doi:10.5281/zenodo.5460860).' },
  { name: 'Middle Jurassic (~165 Ma)', url: '/paleo/scotese-165ma.jpg', attribution: 'C. R. Scotese, PALEOMAP PaleoAtlas for GPlates v3 (2016). CC BY 4.0. Via Zenodo (doi:10.5281/zenodo.5460860).' },
];

export const prehistoricMapOptions: PrehistoricMapOption[] = prehistoricMapOptionsRaw
  .map(option => ({
    ...option,
    ageMa: extractMaFromName(option.name),
    slug: generateSlug(option.name),
  }))
  .sort((a, b) => a.ageMa - b.ageMa);