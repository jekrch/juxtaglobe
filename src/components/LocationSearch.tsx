import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Crosshair, Landmark, Loader2, MapPin, Search } from 'lucide-react';
import type { LocationCoordinates, PointOfView } from '../types';
import { isMapShortLink, parseCoordinates, parseMapLink } from '../utils/coordinates';
import { geocodeUsAddress, isStreetAddress, type AddressMatch } from '../utils/censusGeocoder';

// Photon (komoot) geocodes OpenStreetMap data with no API key and, unlike Nominatim,
// permits search-as-you-type. It parses free text like "Springfield, IL" or "Paris, France".
const PHOTON_URL = 'https://photon.komoot.io/api/';
const RESULT_LIMIT = 6;
// Suggestions matching a query, listed before the search results
const MATCHING_SUGGESTION_LIMIT = 4;
const CENSUS_ID_PREFIX = 'census-';
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;
// Rank results near the bias point first (zoom 10 is a ~40 km area) while still weighting
// prominence enough that "Paris" finds Paris, France from anywhere
const BIAS_ZOOM = 10;
const BIAS_PROMINENCE_SCALE = 0.5;

const MENU_GAP = 8;
const VIEWPORT_MARGIN = 8;
const MIN_MENU_WIDTH = 280;
// Open the menu upward when less than this fits below the box
const MIN_SPACE_BELOW = 220;

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

export interface Place {
  id: string;
  label: string;
  detail: string;
  coords: LocationCoordinates;
  isCoordinates?: boolean;
}

const toPlace = (feature: PhotonFeature, index: number): Place => {
  const { osm_type, osm_id, name, housenumber, street, city, state, country } = feature.properties;
  const label = name || [housenumber, street].filter(Boolean).join(' ') || city || state || country || 'Unnamed place';
  const detail = [city, state, country]
    .filter((part, i, parts): part is string => !!part && part !== label && parts.indexOf(part) === i)
    .join(', ');
  const [lng, lat] = feature.geometry.coordinates;
  return { id: osm_id != null ? `${osm_type}${osm_id}` : `result-${index}`, label, detail, coords: { lat, lng } };
};

type MenuPosition = { left: number; width: number; maxHeight: number } & ({ top: number } | { bottom: number });

interface LocationSearchProps {
  displayText: string;
  onSelect: (coords: LocationCoordinates) => void;
  className: string;
  ariaLabel: string;
  // Offered when the box is empty and listed first when they match the query
  suggestions?: Place[];
  // Open in search mode when mounted
  startEditing?: boolean;
  // Search results near this point rank higher
  biasPoint?: PointOfView;
}

// Shows a coordinate readout that turns into a place or coordinate search (WAI-ARIA combobox) when clicked
const LocationSearch: React.FC<LocationSearchProps> = ({ displayText, onSelect, className, ariaLabel, suggestions = [], startEditing = false, biasPoint }) => {
  const id = useId();
  const [isEditing, setIsEditing] = useState(startEditing);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error' | 'short-link'>('idle');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  // Read when a search runs, so panning the globe doesn't refetch
  const biasPointRef = useRef(biasPoint);
  biasPointRef.current = biasPoint;

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const isCoordinateResult = places[0]?.isCoordinates ?? false;
  const lowerQuery = trimmedQuery.toLowerCase();
  const matchingSuggestions = isCoordinateResult ? [] : !lowerQuery ? suggestions : suggestions
    .filter(place => place.label.toLowerCase().includes(lowerQuery) || place.detail.toLowerCase().includes(lowerQuery))
    .slice(0, MATCHING_SUGGESTION_LIMIT);
  const options = [...matchingSuggestions, ...places];
  const showMenu = isEditing && (isSearching || matchingSuggestions.length > 0);

  useEffect(() => {
    // On touch screens the field isn't focused on open, so the keyboard only comes up when it's tapped
    if (isEditing) {
      if (!window.matchMedia('(hover: none) and (pointer: coarse)').matches) inputRef.current?.focus();
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isEditing]);

  // Blurring the field closes the search, but it may never have been focused, so a press outside also does
  useEffect(() => {
    if (!isEditing) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (boxRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setIsEditing(false);
      setQuery('');
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isEditing]);

  // Debounced search; earlier results stay listed until the new ones arrive
  useEffect(() => {
    if (!isEditing || trimmedQuery.length < MIN_QUERY_LENGTH) {
      setPlaces([]);
      setStatus('idle');
      return;
    }
    // Typed coordinates and map links are offered directly rather than geocoded
    const typedCoords = parseCoordinates(trimmedQuery);
    const coords = typedCoords ?? parseMapLink(trimmedQuery);
    if (coords) {
      const label = `${coords.lat.toFixed(4)}°, ${coords.lng.toFixed(4)}°`;
      const detail = typedCoords ? 'Go to coordinates' : 'Go to map link location';
      setPlaces([{ id: 'coordinates', label, detail, coords, isCoordinates: true }]);
      setActiveIndex(0);
      setStatus('done');
      return;
    }
    if (isMapShortLink(trimmedQuery)) {
      setPlaces([]);
      setStatus('short-link');
      return;
    }
    setStatus('loading');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      // Census only knows US street addresses, so a failure there just leaves Photon's results
      const addressSearch: Promise<AddressMatch[]> = isStreetAddress(trimmedQuery)
        ? geocodeUsAddress(trimmedQuery, controller.signal).catch(error => {
          if (!controller.signal.aborted) console.warn('Address search failed.', error);
          return [];
        })
        : Promise.resolve([]);
      let photonPlaces: Place[] | null = null;
      try {
        const params = new URLSearchParams({ q: trimmedQuery, limit: String(RESULT_LIMIT), lang: 'en' });
        const bias = biasPointRef.current;
        if (bias?.lat != null && bias.lng != null) {
          params.set('lat', bias.lat.toFixed(4));
          params.set('lon', bias.lng.toFixed(4));
          params.set('zoom', String(BIAS_ZOOM));
          params.set('location_bias_scale', String(BIAS_PROMINENCE_SCALE));
        }
        const response = await fetch(`${PHOTON_URL}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Photon responded with ${response.status}`);
        const data: { features?: PhotonFeature[] } = await response.json();
        const results = (data.features ?? []).map(toPlace);
        photonPlaces = results.filter((place, i) => results.findIndex(p => p.id === place.id) === i);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Place search failed.', error);
      }
      const addressPlaces = (await addressSearch).map((match, i): Place => ({
        id: `${CENSUS_ID_PREFIX}${i}`,
        label: match.address,
        detail: match.locality,
        coords: match.coords,
      }));
      if (controller.signal.aborted) return;
      if (!photonPlaces && addressPlaces.length === 0) {
        setPlaces([]);
        setStatus('error');
        return;
      }
      // Exact address matches first, as Photon may only have the street
      setPlaces([...addressPlaces, ...(photonPlaces ?? [])]);
      setActiveIndex(0);
      setStatus('done');
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, isEditing]);

  // The menu is portaled with fixed positioning so the control panel's overflow-hidden can't clip it
  useLayoutEffect(() => {
    if (!showMenu) return;
    const updatePosition = () => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box) return;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const width = Math.min(Math.max(box.width, MIN_MENU_WIDTH), window.innerWidth - 2 * VIEWPORT_MARGIN);
      const left = Math.min(Math.max(box.left, VIEWPORT_MARGIN), window.innerWidth - VIEWPORT_MARGIN - width);
      const spaceBelow = viewportHeight - box.bottom - MENU_GAP - VIEWPORT_MARGIN;
      const spaceAbove = box.top - MENU_GAP - VIEWPORT_MARGIN;
      setMenuPosition(spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow
        ? { left, width, bottom: window.innerHeight - box.top + MENU_GAP, maxHeight: spaceAbove }
        : { left, width, top: box.bottom + MENU_GAP, maxHeight: spaceBelow });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('resize', updatePosition);
    };
  }, [showMenu]);

  const stopEditing = (restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus;
    setIsEditing(false);
    setQuery('');
  };

  const select = (place: Place | undefined, restoreFocus: boolean) => {
    if (!place) return;
    onSelect(place.coords);
    stopEditing(restoreFocus);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex(i => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        select(options[activeIndex], true);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        stopEditing(true);
        break;
    }
  };

  const hasOptions = showMenu && options.length > 0;
  let statusMessage: string | null = null;
  if (isSearching) {
    if (status === 'error') statusMessage = 'Search is unavailable right now';
    else if (status === 'short-link') statusMessage = "Short links can't be read here. Open the link, then paste the full one from the address bar.";
    else if (status !== 'done' && places.length === 0) statusMessage = 'Searching…';
    else if (status === 'done' && options.length === 0) statusMessage = 'No places found';
  }

  if (!isEditing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsEditing(true)}
        title="Choose a famous place, search for any place, enter coordinates, or paste a map link"
        aria-label={`${ariaLabel}: ${displayText}. Choose a famous place, search for any place, enter coordinates, or paste a map link`}
        className={`${className} w-full flex items-center gap-2 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50`}
      >
        <span className="flex-1 min-w-0 truncate font-mono text-xs sm:text-sm text-neutral-100 tabular-nums">{displayText}</span>
        {/* The same chevron as the settings dropdowns, so the readout reads as a menu; it becomes a search box when opened */}
        <ChevronDown size={15} className="shrink-0 text-neutral-400 group-hover:text-neutral-200 transition-colors" />
      </button>
    );
  }

  return (
    <div ref={boxRef} className={`${className} flex items-center gap-2 border-neutral-500!`}>
      {/* 16px on phones so iOS doesn't zoom in on focus. w-0 drops the input's default ~20ch width,
          which would otherwise widen the panel column and squeeze the buttons beside it */}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={`Search for a place, enter coordinates, or paste a map link to set the ${ariaLabel.toLowerCase()}`}
        aria-autocomplete="list"
        aria-expanded={hasOptions}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={hasOptions ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Place or lat, lng…"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => stopEditing(false)}
        className="flex-1 min-w-0 w-0 bg-transparent border-0 p-0 outline-none text-base leading-4 sm:text-sm sm:leading-5 text-neutral-100 placeholder:text-neutral-500"
      />
      {status === 'loading'
        ? <Loader2 size={13} className="shrink-0 text-neutral-400 animate-spin" />
        : <Search size={13} className="shrink-0 text-neutral-500" />}

      {showMenu && menuPosition && createPortal(
        <div
          ref={menuRef}
          // Keep focus in the input so clicking an option doesn't blur and close the search first
          onMouseDown={e => e.preventDefault()}
          style={{ position: 'fixed', ...menuPosition }}
          className="z-50 flex flex-col overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-900/95 shadow-2xl shadow-black/60 ring-1 ring-black/20 select-menu-in"
        >
          {!trimmedQuery && (
            <div className="shrink-0 border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">
              Famous places, or search for any place
            </div>
          )}
          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-label="Places"
            className={`min-h-0 overflow-y-auto overscroll-contain ${options.length > 0 ? 'p-1.5' : ''}`}
          >
            {options.map((place, index) => (
              <div
                key={place.id}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => select(place, false)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors duration-100 ${
                  index === activeIndex ? 'bg-neutral-700/60' : ''
                }`}
              >
                {place.isCoordinates
                  ? <Crosshair size={14} className="shrink-0 text-neutral-500" />
                  : index < matchingSuggestions.length
                    ? <Landmark size={14} className="shrink-0 text-neutral-500" />
                    : <MapPin size={14} className="shrink-0 text-neutral-500" />}
                <div className="flex-1 min-w-0">
                  <div className={`truncate text-sm text-neutral-100 ${place.isCoordinates ? 'font-mono tabular-nums' : ''}`}>{place.label}</div>
                  {place.detail && <div className="truncate text-xs text-neutral-500">{place.detail}</div>}
                </div>
              </div>
            ))}
          </div>
          {statusMessage && (
            <div role="status" className="px-4 py-3 text-sm text-neutral-400">{statusMessage}</div>
          )}
          {isSearching && !isCoordinateResult && status !== 'short-link' && (
            <div className="shrink-0 border-t border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
              Search by Photon · © OpenStreetMap contributors
              {places.some(place => place.id.startsWith(CENSUS_ID_PREFIX)) && ' · US Census Bureau'}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default LocationSearch;
