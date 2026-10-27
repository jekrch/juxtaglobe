import type { LocationCoordinates } from '../types';

export interface Landmark {
  slug: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  // Height of ground to show, in km, chosen to frame the whole landmark
  spanKm: number;
}

const EARTH_RADIUS_KM = 6371;
// globe.gl keeps three.js's default 50° vertical field of view
const CAMERA_FOV_DEGREES = 50;

/** Globe altitude (in Earth radii) at which the view shows spanKm of ground top to bottom */
export const altitudeForSpan = (spanKm: number): number =>
  spanKm / (2 * Math.tan((CAMERA_FOV_DEGREES / 2) * Math.PI / 180)) / EARTH_RADIUS_KM;

export const landmarkCoordinates = ({ lat, lng, spanKm }: Landmark): LocationCoordinates =>
  ({ lat, lng, altitude: altitudeForSpan(spanKm) });

export const landmarks: Landmark[] = [
  { slug: 'abu-simbel', name: 'Abu Simbel', region: 'Aswan, Egypt', lat: 22.3372, lng: 31.6258, spanKm: 0.5 },
  { slug: 'acropolis', name: 'Acropolis of Athens', region: 'Athens, Greece', lat: 37.9715, lng: 23.7257, spanKm: 0.5 },
  { slug: 'alcatraz', name: 'Alcatraz Island', region: 'San Francisco, USA', lat: 37.8267, lng: -122.4230, spanKm: 0.8 },
  { slug: 'alhambra', name: 'Alhambra', region: 'Granada, Spain', lat: 37.1761, lng: -3.5881, spanKm: 0.9 },
  { slug: 'angel-falls', name: 'Angel Falls', region: 'Bolívar, Venezuela', lat: 5.9701, lng: -62.5362, spanKm: 2 },
  { slug: 'angkor-wat', name: 'Angkor Wat', region: 'Siem Reap, Cambodia', lat: 13.4125, lng: 103.8670, spanKm: 2 },
  { slug: 'arc-de-triomphe', name: 'Arc de Triomphe', region: 'Paris, France', lat: 48.8738, lng: 2.2950, spanKm: 0.5 },
  { slug: 'bora-bora', name: 'Bora Bora', region: 'French Polynesia', lat: -16.5004, lng: -151.7415, spanKm: 14 },
  { slug: 'borobudur', name: 'Borobudur', region: 'Central Java, Indonesia', lat: -7.6079, lng: 110.2038, spanKm: 0.4 },
  { slug: 'brandenburg-gate', name: 'Brandenburg Gate', region: 'Berlin, Germany', lat: 52.5163, lng: 13.3777, spanKm: 0.4 },
  { slug: 'brooklyn-bridge', name: 'Brooklyn Bridge', region: 'New York, USA', lat: 40.7061, lng: -73.9969, spanKm: 2 },
  { slug: 'burj-al-arab', name: 'Burj Al Arab', region: 'Dubai, UAE', lat: 25.1412, lng: 55.1852, spanKm: 0.4 },
  { slug: 'burj-khalifa', name: 'Burj Khalifa', region: 'Dubai, UAE', lat: 25.1972, lng: 55.2744, spanKm: 0.6 },
  { slug: 'central-park', name: 'Central Park', region: 'New York, USA', lat: 40.7829, lng: -73.9654, spanKm: 4.5 },
  { slug: 'chernobyl', name: 'Chernobyl Nuclear Power Plant', region: 'Pripyat, Ukraine', lat: 51.3890, lng: 30.0992, spanKm: 1.5 },
  { slug: 'chichen-itza', name: 'Chichén Itzá', region: 'Yucatán, Mexico', lat: 20.6829, lng: -88.5686, spanKm: 0.6 },
  { slug: 'christ-the-redeemer', name: 'Christ the Redeemer', region: 'Rio de Janeiro, Brazil', lat: -22.9519, lng: -43.2105, spanKm: 0.3 },
  { slug: 'cliffs-of-moher', name: 'Cliffs of Moher', region: 'County Clare, Ireland', lat: 52.9715, lng: -9.4309, spanKm: 4 },
  { slug: 'cn-tower', name: 'CN Tower', region: 'Toronto, Canada', lat: 43.6426, lng: -79.3871, spanKm: 0.4 },
  { slug: 'colosseum', name: 'Colosseum', region: 'Rome, Italy', lat: 41.8902, lng: 12.4922, spanKm: 0.4 },
  { slug: 'crater-lake', name: 'Crater Lake', region: 'Oregon, USA', lat: 42.9446, lng: -122.1090, spanKm: 10 },
  { slug: 'denver-airport', name: 'Denver International Airport', region: 'Colorado, USA', lat: 39.8561, lng: -104.6737, spanKm: 12 },
  { slug: 'diamond-head', name: 'Diamond Head', region: 'Honolulu, USA', lat: 21.2614, lng: -157.8056, spanKm: 2.5 },
  { slug: 'disneyland', name: 'Disneyland Park', region: 'Anaheim, USA', lat: 33.8121, lng: -117.9190, spanKm: 1.2 },
  { slug: 'dubrovnik', name: 'Dubrovnik Old Town', region: 'Dubrovnik, Croatia', lat: 42.6410, lng: 18.1100, spanKm: 0.8 },
  { slug: 'easter-island', name: 'Easter Island', region: 'Rapa Nui, Chile', lat: -27.1127, lng: -109.3497, spanKm: 26 },
  { slug: 'edinburgh-castle', name: 'Edinburgh Castle', region: 'Edinburgh, Scotland', lat: 55.9486, lng: -3.1999, spanKm: 0.5 },
  { slug: 'eiffel-tower', name: 'Eiffel Tower', region: 'Paris, France', lat: 48.8584, lng: 2.2945, spanKm: 0.5 },
  { slug: 'empire-state-building', name: 'Empire State Building', region: 'New York, USA', lat: 40.7484, lng: -73.9857, spanKm: 0.4 },
  { slug: 'forbidden-city', name: 'Forbidden City', region: 'Beijing, China', lat: 39.9163, lng: 116.3972, spanKm: 1.3 },
  { slug: 'gateway-arch', name: 'Gateway Arch', region: 'St. Louis, USA', lat: 38.6247, lng: -90.1848, spanKm: 0.8 },
  { slug: 'giants-causeway', name: "Giant's Causeway", region: 'County Antrim, Northern Ireland', lat: 55.2408, lng: -6.5116, spanKm: 0.6 },
  { slug: 'gibraltar', name: 'Rock of Gibraltar', region: 'Gibraltar', lat: 36.1320, lng: -5.3480, spanKm: 6 },
  { slug: 'golden-gate-bridge', name: 'Golden Gate Bridge', region: 'San Francisco, USA', lat: 37.8199, lng: -122.4783, spanKm: 3.2 },
  { slug: 'golden-temple', name: 'Golden Temple', region: 'Amritsar, India', lat: 31.6200, lng: 74.8765, spanKm: 0.4 },
  { slug: 'grand-canyon', name: 'Grand Canyon', region: 'Arizona, USA', lat: 36.1288, lng: -112.0802, spanKm: 22 },
  { slug: 'grand-prismatic-spring', name: 'Grand Prismatic Spring', region: 'Yellowstone, USA', lat: 44.5251, lng: -110.8382, spanKm: 0.6 },
  { slug: 'great-pyramid', name: 'Great Pyramid of Giza', region: 'Giza, Egypt', lat: 29.9792, lng: 31.1342, spanKm: 0.6 },
  { slug: 'great-wall', name: 'Great Wall at Mutianyu', region: 'Beijing, China', lat: 40.4319, lng: 116.5704, spanKm: 3 },
  { slug: 'hagia-sophia', name: 'Hagia Sophia', region: 'Istanbul, Turkey', lat: 41.0086, lng: 28.9802, spanKm: 0.4 },
  { slug: 'half-dome', name: 'Half Dome', region: 'Yosemite, USA', lat: 37.7459, lng: -119.5332, spanKm: 4 },
  { slug: 'hollywood-sign', name: 'Hollywood Sign', region: 'Los Angeles, USA', lat: 34.1341, lng: -118.3215, spanKm: 0.6 },
  { slug: 'hoover-dam', name: 'Hoover Dam', region: 'Nevada and Arizona, USA', lat: 36.0161, lng: -114.7377, spanKm: 1.5 },
  { slug: 'hyde-park', name: 'Hyde Park', region: 'London, England', lat: 51.5073, lng: -0.1657, spanKm: 2.5 },
  { slug: 'iguazu-falls', name: 'Iguazu Falls', region: 'Argentina and Brazil', lat: -25.6953, lng: -54.4367, spanKm: 3 },
  { slug: 'kilauea', name: 'Kīlauea Caldera', region: 'Hawaii, USA', lat: 19.4069, lng: -155.2834, spanKm: 6 },
  { slug: 'kilimanjaro', name: 'Mount Kilimanjaro', region: 'Kilimanjaro, Tanzania', lat: -3.0674, lng: 37.3556, spanKm: 12 },
  { slug: 'kremlin', name: 'Kremlin and Red Square', region: 'Moscow, Russia', lat: 55.7520, lng: 37.6175, spanKm: 1.5 },
  { slug: 'lake-tahoe', name: 'Lake Tahoe', region: 'California and Nevada, USA', lat: 39.0968, lng: -120.0324, spanKm: 40 },
  { slug: 'las-vegas-strip', name: 'Las Vegas Strip', region: 'Nevada, USA', lat: 36.1147, lng: -115.1728, spanKm: 7 },
  { slug: 'louvre', name: 'Louvre', region: 'Paris, France', lat: 48.8606, lng: 2.3376, spanKm: 0.8 },
  { slug: 'machu-picchu', name: 'Machu Picchu', region: 'Cusco, Peru', lat: -13.1631, lng: -72.5450, spanKm: 0.8 },
  { slug: 'magic-kingdom', name: 'Magic Kingdom', region: 'Orlando, USA', lat: 28.4177, lng: -81.5812, spanKm: 1.5 },
  { slug: 'mall-of-america', name: 'Mall of America', region: 'Bloomington, USA', lat: 44.8549, lng: -93.2422, spanKm: 1 },
  { slug: 'manhattan', name: 'Manhattan', region: 'New York, USA', lat: 40.7831, lng: -73.9712, spanKm: 22 },
  { slug: 'manicouagan-crater', name: 'Manicouagan Crater', region: 'Quebec, Canada', lat: 51.3833, lng: -68.7000, spanKm: 85 },
  { slug: 'marina-bay-sands', name: 'Marina Bay Sands', region: 'Singapore', lat: 1.2834, lng: 103.8607, spanKm: 0.8 },
  { slug: 'masjid-al-haram', name: 'Masjid al-Haram', region: 'Mecca, Saudi Arabia', lat: 21.4225, lng: 39.8262, spanKm: 0.8 },
  { slug: 'matterhorn', name: 'Matterhorn', region: 'Switzerland and Italy', lat: 45.9763, lng: 7.6586, spanKm: 6 },
  { slug: 'meteor-crater', name: 'Meteor Crater', region: 'Arizona, USA', lat: 35.0272, lng: -111.0225, spanKm: 2.5 },
  { slug: 'monaco', name: 'Monaco', region: 'Monaco', lat: 43.7384, lng: 7.4246, spanKm: 3 },
  { slug: 'mont-saint-michel', name: 'Mont-Saint-Michel', region: 'Normandy, France', lat: 48.6361, lng: -1.5115, spanKm: 0.8 },
  { slug: 'monument-valley', name: 'Monument Valley', region: 'Arizona and Utah, USA', lat: 36.9980, lng: -110.0985, spanKm: 12 },
  { slug: 'mount-everest', name: 'Mount Everest', region: 'Nepal and China', lat: 27.9881, lng: 86.9250, spanKm: 12 },
  { slug: 'mount-fuji', name: 'Mount Fuji', region: 'Honshu, Japan', lat: 35.3606, lng: 138.7274, spanKm: 15 },
  { slug: 'mount-rainier', name: 'Mount Rainier', region: 'Washington, USA', lat: 46.8523, lng: -121.7603, spanKm: 15 },
  { slug: 'mount-rushmore', name: 'Mount Rushmore', region: 'South Dakota, USA', lat: 43.8791, lng: -103.4591, spanKm: 0.8 },
  { slug: 'mount-st-helens', name: 'Mount St. Helens', region: 'Washington, USA', lat: 46.1912, lng: -122.1944, spanKm: 10 },
  { slug: 'national-mall', name: 'National Mall', region: 'Washington, D.C., USA', lat: 38.8895, lng: -77.0297, spanKm: 3 },
  { slug: 'nazca-lines', name: 'Nazca Lines Hummingbird', region: 'Ica, Peru', lat: -14.6922, lng: -75.1489, spanKm: 0.4 },
  { slug: 'neuschwanstein', name: 'Neuschwanstein Castle', region: 'Bavaria, Germany', lat: 47.5576, lng: 10.7498, spanKm: 0.5 },
  { slug: 'niagara-falls', name: 'Niagara Falls', region: 'Canada and USA', lat: 43.0806, lng: -79.0731, spanKm: 2 },
  { slug: 'old-faithful', name: 'Old Faithful', region: 'Yellowstone, USA', lat: 44.4605, lng: -110.8281, spanKm: 0.5 },
  { slug: 'palace-of-westminster', name: 'Palace of Westminster', region: 'London, England', lat: 51.4995, lng: -0.1248, spanKm: 0.5 },
  { slug: 'palm-jumeirah', name: 'Palm Jumeirah', region: 'Dubai, UAE', lat: 25.1124, lng: 55.1390, spanKm: 7 },
  { slug: 'panama-canal', name: 'Panama Canal Miraflores Locks', region: 'Panama City, Panama', lat: 8.9967, lng: -79.5914, spanKm: 1.5 },
  { slug: 'pentagon', name: 'The Pentagon', region: 'Virginia, USA', lat: 38.8719, lng: -77.0563, spanKm: 0.7 },
  { slug: 'petra', name: 'Petra', region: "Ma'an, Jordan", lat: 30.3222, lng: 35.4514, spanKm: 2.5 },
  { slug: 'petronas-towers', name: 'Petronas Towers', region: 'Kuala Lumpur, Malaysia', lat: 3.1579, lng: 101.7116, spanKm: 0.5 },
  { slug: 'pisa', name: 'Leaning Tower of Pisa', region: 'Pisa, Italy', lat: 43.7230, lng: 10.3966, spanKm: 0.5 },
  { slug: 'pompeii', name: 'Pompeii', region: 'Campania, Italy', lat: 40.7500, lng: 14.4861, spanKm: 1.5 },
  { slug: 'potala-palace', name: 'Potala Palace', region: 'Lhasa, China', lat: 29.6578, lng: 91.1172, spanKm: 0.6 },
  { slug: 'pyramid-of-the-sun', name: 'Pyramid of the Sun', region: 'Teotihuacan, Mexico', lat: 19.6925, lng: -98.8438, spanKm: 0.5 },
  { slug: 'sagrada-familia', name: 'Sagrada Família', region: 'Barcelona, Spain', lat: 41.4036, lng: 2.1744, spanKm: 0.3 },
  { slug: 'salar-de-uyuni', name: 'Salar de Uyuni', region: 'Potosí, Bolivia', lat: -20.1338, lng: -67.4891, spanKm: 120 },
  { slug: 'santorini', name: 'Santorini Caldera', region: 'Cyclades, Greece', lat: 36.4040, lng: 25.3960, spanKm: 16 },
  { slug: 'shibuya-crossing', name: 'Shibuya Crossing', region: 'Tokyo, Japan', lat: 35.6595, lng: 139.7005, spanKm: 0.3 },
  { slug: 'sigiriya', name: 'Sigiriya', region: 'Central Province, Sri Lanka', lat: 7.9570, lng: 80.7603, spanKm: 1 },
  { slug: 'space-needle', name: 'Space Needle', region: 'Seattle, USA', lat: 47.6205, lng: -122.3493, spanKm: 0.4 },
  { slug: 'statue-of-liberty', name: 'Statue of Liberty', region: 'New York, USA', lat: 40.6892, lng: -74.0445, spanKm: 0.5 },
  { slug: 'stonehenge', name: 'Stonehenge', region: 'Wiltshire, England', lat: 51.1789, lng: -1.8262, spanKm: 0.3 },
  { slug: 'sydney-opera-house', name: 'Sydney Opera House', region: 'Sydney, Australia', lat: -33.8568, lng: 151.2153, spanKm: 0.5 },
  { slug: 'table-mountain', name: 'Table Mountain', region: 'Cape Town, South Africa', lat: -33.9628, lng: 18.4098, spanKm: 5 },
  { slug: 'taj-mahal', name: 'Taj Mahal', region: 'Agra, India', lat: 27.1739, lng: 78.0421, spanKm: 0.8 },
  { slug: 'three-gorges-dam', name: 'Three Gorges Dam', region: 'Hubei, China', lat: 30.8208, lng: 111.0022, spanKm: 3 },
  { slug: 'times-square', name: 'Times Square', region: 'New York, USA', lat: 40.7580, lng: -73.9855, spanKm: 0.5 },
  { slug: 'tokyo-imperial-palace', name: 'Tokyo Imperial Palace', region: 'Tokyo, Japan', lat: 35.6852, lng: 139.7528, spanKm: 2.5 },
  { slug: 'tower-of-london', name: 'Tower of London', region: 'London, England', lat: 51.5081, lng: -0.0759, spanKm: 0.5 },
  { slug: 'uluru', name: 'Uluru', region: 'Northern Territory, Australia', lat: -25.3444, lng: 131.0369, spanKm: 5 },
  { slug: 'valley-of-the-kings', name: 'Valley of the Kings', region: 'Luxor, Egypt', lat: 25.7402, lng: 32.6014, spanKm: 1.2 },
  { slug: 'vatican-city', name: 'Vatican City', region: 'Rome, Italy', lat: 41.9029, lng: 12.4534, spanKm: 1.2 },
  { slug: 'venice', name: 'Venice', region: 'Veneto, Italy', lat: 45.4375, lng: 12.3358, spanKm: 4 },
  { slug: 'versailles', name: 'Palace of Versailles', region: 'Versailles, France', lat: 48.8049, lng: 2.1204, spanKm: 3 },
  { slug: 'victoria-falls', name: 'Victoria Falls', region: 'Zambia and Zimbabwe', lat: -17.9243, lng: 25.8572, spanKm: 2.5 },
  { slug: 'white-house', name: 'White House', region: 'Washington, D.C., USA', lat: 38.8977, lng: -77.0365, spanKm: 0.6 },
  { slug: 'willis-tower', name: 'Willis Tower', region: 'Chicago, USA', lat: 41.8789, lng: -87.6359, spanKm: 0.4 },
];

export const findLandmark = (slug: string | null): Landmark | undefined =>
  slug ? landmarks.find(landmark => landmark.slug === slug.toLowerCase()) : undefined;
