import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, Loader2, MapPin, Search } from 'lucide-react';
import type { LocationCoordinates } from '../types';
import { parseCoordinates } from '../utils/coordinates';

// Photon (komoot) geocodes OpenStreetMap data with no API key and, unlike Nominatim,
// permits search-as-you-type. It parses free text like "Springfield, IL" or "Paris, France".
const PHOTON_URL = 'https://photon.komoot.io/api/';
const RESULT_LIMIT = 6;
const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

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

interface Place {
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
}

// Shows a coordinate readout that turns into a place or coordinate search (WAI-ARIA combobox) when clicked
const LocationSearch: React.FC<LocationSearchProps> = ({ displayText, onSelect, className, ariaLabel }) => {
  const id = useId();
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  const trimmedQuery = query.trim();
  const showMenu = isEditing && trimmedQuery.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
    else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [isEditing]);

  // Debounced search; earlier results stay listed until the new ones arrive
  useEffect(() => {
    if (!isEditing || trimmedQuery.length < MIN_QUERY_LENGTH) {
      setPlaces([]);
      setStatus('idle');
      return;
    }
    // Typed coordinates are offered directly rather than geocoded
    const coords = parseCoordinates(trimmedQuery);
    if (coords) {
      const label = `${coords.lat.toFixed(4)}°, ${coords.lng.toFixed(4)}°`;
      setPlaces([{ id: 'coordinates', label, detail: 'Go to coordinates', coords, isCoordinates: true }]);
      setActiveIndex(0);
      setStatus('done');
      return;
    }
    setStatus('loading');
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmedQuery, limit: String(RESULT_LIMIT), lang: 'en' });
        const response = await fetch(`${PHOTON_URL}?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Photon responded with ${response.status}`);
        const data: { features?: PhotonFeature[] } = await response.json();
        const results = (data.features ?? []).map(toPlace);
        setPlaces(results.filter((place, i) => results.findIndex(p => p.id === place.id) === i));
        setActiveIndex(0);
        setStatus('done');
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn('Place search failed.', error);
        setPlaces([]);
        setStatus('error');
      }
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
        setActiveIndex(i => Math.min(i + 1, places.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        select(places[activeIndex], true);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        stopEditing(true);
        break;
    }
  };

  const hasOptions = showMenu && places.length > 0;
  let statusMessage: string | null = null;
  if (status !== 'done' && status !== 'error' && places.length === 0) statusMessage = 'Searching…';
  else if (status === 'done' && places.length === 0) statusMessage = 'No places found';
  else if (status === 'error') statusMessage = 'Search is unavailable right now';

  if (!isEditing) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsEditing(true)}
        title="Search for a place or enter coordinates"
        aria-label={`${ariaLabel}: ${displayText}. Search for a place or enter coordinates`}
        className={`${className} w-full flex items-center gap-2 text-left cursor-text outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50`}
      >
        <span className="flex-1 min-w-0 truncate font-mono text-xs sm:text-sm text-neutral-100 tabular-nums">{displayText}</span>
        <Search size={13} className="shrink-0 text-neutral-500 group-hover:text-neutral-300 transition-colors" />
      </button>
    );
  }

  return (
    <div ref={boxRef} className={`${className} flex items-center gap-2 border-neutral-500!`}>
      {/* 16px on phones so iOS doesn't zoom in on focus */}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={`Search for a place or enter coordinates to set the ${ariaLabel.toLowerCase()}`}
        aria-autocomplete="list"
        aria-expanded={hasOptions}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={hasOptions ? `${id}-option-${activeIndex}` : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Place or lat, lng…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => stopEditing(false)}
        className="flex-1 min-w-0 bg-transparent border-0 p-0 outline-none text-base leading-4 sm:text-sm sm:leading-5 text-neutral-100 placeholder:text-neutral-500"
      />
      {status === 'loading'
        ? <Loader2 size={13} className="shrink-0 text-neutral-400 animate-spin" />
        : <Search size={13} className="shrink-0 text-neutral-500" />}

      {showMenu && menuPosition && createPortal(
        <div
          // Keep focus in the input so clicking an option doesn't blur and close the search first
          onMouseDown={e => e.preventDefault()}
          style={{ position: 'fixed', ...menuPosition }}
          className="z-50 flex flex-col overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-900/95 shadow-2xl shadow-black/60 ring-1 ring-black/20 select-menu-in"
        >
          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-label="Places"
            className={`min-h-0 overflow-y-auto overscroll-contain ${places.length > 0 ? 'p-1.5' : ''}`}
          >
            {places.map((place, index) => (
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
          {!places[0]?.isCoordinates && (
            <div className="shrink-0 border-t border-neutral-800 px-3 py-1.5 text-[11px] text-neutral-500">
              Search by Photon · © OpenStreetMap contributors
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default LocationSearch;
