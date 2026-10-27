import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { MapPin, Globe2, Navigation, Settings, ExternalLink, Lock, Unlock, Landmark } from 'lucide-react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';

import InfoModal from './InfoModal';
import { KANSAS_LOCATION, prehistoricMapOptions } from '../utils/mapData';
import type { PointOfView, LocationCoordinates, PrehistoricMapOption } from '../types';
import GlobePanel from './GlobalPanel';
import LocationSearch, { type Place } from './LocationSearch';
import { findLandmark, landmarkCoordinates, landmarks } from '../utils/landmarks';

const WIDE_LAYOUT_ALTITUDE_TARGET = KANSAS_LOCATION.altitude ?? 2.5;
const NARROW_LAYOUT_ALTITUDE_TARGET = 2;
const PLACE_ANIMATION_MS = 1000;
// Wait for the globes to animate in before looking up the user's location or zooming in
const INTRO_DELAY_MS = 1500;

// The browser's own fix is precise (GPS or Wi-Fi) but asks permission; IP lookup is only city-level
const getPreciseLocation = () => new Promise<LocationCoordinates>((resolve, reject) => {
    if (!navigator.geolocation) {
        reject(new Error('Geolocation is unavailable'));
        return;
    }
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
        reject,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
});

const getIpLocation = async (): Promise<LocationCoordinates> => {
    const data = await (await fetch('https://ipapi.co/json/')).json();
    if (data.latitude == null || data.longitude == null) throw new Error('IP geolocation returned no location');
    return { lat: data.latitude, lng: data.longitude };
};

const landmarkSuggestions: Place[] = landmarks.map(landmark => ({
    id: `landmark-${landmark.slug}`,
    label: landmark.name,
    detail: landmark.region,
    coords: landmarkCoordinates(landmark),
}));

const GlobeViewer: React.FC = () => {
    // Globe references
    const globeEl = useRef<GlobeMethods | undefined>(undefined);
    const secondaryGlobeEl = useRef<GlobeMethods | undefined>(undefined);
    const secondaryGlobePanelRef = useRef<HTMLDivElement>(null);
    const primaryGlobePanelRef = useRef<HTMLDivElement>(null);

    // Globe state
    const [globeReady, setGlobeReady] = useState(false);
    const [secondaryGlobeReady, setSecondaryGlobeReady] = useState(false);
    const [primaryGlobeDimensions, setPrimaryGlobeDimensions] = useState({ width: 400, height: 400 });
    const [secondaryGlobeDimensions, setSecondaryGlobeDimensions] = useState({ width: 400, height: 400 });

    // UI state
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [attributionPopover, setAttributionPopover] = useState<{ text: string; x: number; y: number } | null>(null);
    const attributionPopoverRef = useRef<HTMLDivElement>(null);

    // View state
    const [pointOfView, setPointOfView] = useState<PointOfView>(KANSAS_LOCATION);
    const [secondaryPointOfView, setSecondaryPointOfView] = useState<PointOfView>(getAntipodal(KANSAS_LOCATION));
    const latestPovs = useRef({ primary: pointOfView, secondary: secondaryPointOfView });

    // Routing
    const { mapSlug: mapSlugFromParams } = useParams<{ mapSlug?: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [showMapTiles, setShowMapTiles] = useState(() => searchParams.get('map') === 't');

    // Globe mode state
    const [isDualModeLocked, setIsDualModeLocked] = useState(() => searchParams.get('lock') !== 'f');
    // Once the user sets the lock themselves, searching no longer unlocks it
    const lockChosenByUser = useRef(false);
    const povOffset = useRef({ lat: 0, lng: 0 });
    const [secondaryGlobeMode, setSecondaryGlobeMode] = useState<'antipodal' | 'prehistoric_same_point' | 'dual-point'>('antipodal');
    const [selectedPrehistoricMap, setSelectedPrehistoricMap] = useState<PrehistoricMapOption | null>(null);
    // Opens the secondary search when "Compare Sizes" switches to dual-point mode
    const [openSecondarySearch, setOpenSecondarySearch] = useState(false);

    // Layout state
    const [isNarrowLayout, setIsNarrowLayout] = useState(window.innerWidth < 1024);

    // Animation and interaction tracking
    const initialAnimationDone = useRef(false);
    const urlCoordsApplied = useRef(false);
    const ipLookupAttempted = useRef(false);
    const expectAnimatedMoveRef = useRef(false);
    const activeInteractionGlobeRef = useRef<'main' | 'secondary' | null>(null);
    const programmaticMoveInProgressRef = useRef(false);
    const syncThrottle = useRef<NodeJS.Timeout | null>(null);
    const placeMoveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    // The latest goToPlace, for callbacks scheduled from an earlier render
    const goToPlaceRef = useRef<(coords: LocationCoordinates, globeIdentifier: 'main' | 'secondary') => void>(() => {});

    /**
     * Calculate antipodal coordinates (opposite point on Earth)
     */
    function getAntipodal(coords: LocationCoordinates): LocationCoordinates {
        return { 
            lat: -coords.lat, 
            lng: coords.lng < 0 ? coords.lng + 180 : coords.lng - 180, 
            altitude: coords.altitude 
        };
    }

    /**
     * Normalize coordinates to valid ranges
     * Lat: [-89.9, 89.9], Lng: [-180, 180]
     */
    function normalizeCoordinates(lat: number, lng: number): { lat: number; lng: number } {
        const MAX_LAT = 89.9;
        const MIN_LAT = -89.9;
        let normalizedLat = Math.max(MIN_LAT, Math.min(MAX_LAT, lat));
        let normalizedLng = lng;
        while (normalizedLng > 180) normalizedLng -= 360;
        while (normalizedLng < -180) normalizedLng += 360;
        return { lat: normalizedLat, lng: normalizedLng };
    }

    // Keep latest POV values in sync with state
    useEffect(() => {
        latestPovs.current = { primary: pointOfView, secondary: secondaryPointOfView };
    }, [pointOfView, secondaryPointOfView]);

    // Sync globe state to URL parameters
    useEffect(() => {
        if (!initialAnimationDone.current) return;

        const handler = setTimeout(() => {
            const newSearchParams = new URLSearchParams(searchParams);
            // ?compare=<landmark> only applies on load; the coordinates below take over from it
            newSearchParams.delete('compare');

            if (pointOfView.lat != null && pointOfView.lng != null && pointOfView.altitude != null) {
                newSearchParams.set('lat', pointOfView.lat.toFixed(5));
                newSearchParams.set('lng', pointOfView.lng.toFixed(5));
                newSearchParams.set('alt', pointOfView.altitude.toPrecision(3));
            }

            if (secondaryGlobeMode === 'dual-point') {
                if (secondaryPointOfView.lat != null && secondaryPointOfView.lng != null && secondaryPointOfView.altitude != null) {
                    newSearchParams.set('lat2', secondaryPointOfView.lat.toFixed(5));
                    newSearchParams.set('lng2', secondaryPointOfView.lng.toFixed(5));
                    newSearchParams.set('alt2', secondaryPointOfView.altitude.toPrecision(3));
                }
                // Locked is the default, so only an unlocked view is recorded
                if (isDualModeLocked) newSearchParams.delete('lock');
                else newSearchParams.set('lock', 'f');
            } else {
                newSearchParams.delete('lat2');
                newSearchParams.delete('lng2');
                newSearchParams.delete('alt2');
                newSearchParams.delete('lock');
            }

            setSearchParams(newSearchParams, { replace: true });
        }, 300);

        return () => clearTimeout(handler);
    }, [pointOfView, secondaryPointOfView, secondaryGlobeMode, isDualModeLocked, setSearchParams, searchParams]);

    // Handle map tiles toggle from URL
    useEffect(() => {
        const tilesParam = searchParams.get('map');
        const shouldShowTiles = tilesParam === 't';
        if (shouldShowTiles !== showMapTiles) setShowMapTiles(shouldShowTiles);
    }, [searchParams]);

    const handleMapTilesToggle = (checked: boolean) => {
        setShowMapTiles(checked);
        const newSearchParams = new URLSearchParams(searchParams);
        if (checked) newSearchParams.set('map', 't');
        else newSearchParams.delete('map');
        setSearchParams(newSearchParams, { replace: true });
    };

    // Handle route-based mode changes
    useEffect(() => {
        const slug = mapSlugFromParams?.toLowerCase() || 'antipodal';
        let newMode: 'antipodal' | 'prehistoric_same_point' | 'dual-point' = 'antipodal';
        let newMap: PrehistoricMapOption | null = null;
        let targetPath = `/${slug}`;

        if (slug === 'antipodal') { /* Default */ }
        else if (slug === 'dual-point') newMode = 'dual-point';
        else {
            const map = prehistoricMapOptions.find(m => m.slug === slug);
            if (map) {
                newMode = 'prehistoric_same_point';
                newMap = map;
            } else targetPath = '/antipodal';
        }

        setSecondaryGlobeMode(newMode);
        setSelectedPrehistoricMap(newMap);

        const currentPath = window.location.pathname.endsWith('/')
            ? window.location.pathname.slice(0, -1)
            : window.location.pathname;

        if (currentPath.toLowerCase() !== targetPath) navigate(targetPath, { replace: true });
    }, [mapSlugFromParams, navigate]);

    // Calculate offset for dual-point mode
    useEffect(() => {
        if (secondaryGlobeMode === 'dual-point' && 
            pointOfView.lat != null && pointOfView.lng != null && 
            secondaryPointOfView.lat != null && secondaryPointOfView.lng != null) {
            povOffset.current = { 
                lat: secondaryPointOfView.lat - pointOfView.lat, 
                lng: secondaryPointOfView.lng - pointOfView.lng 
            };
        }
    }, [pointOfView.lat, pointOfView.lng, secondaryPointOfView.lat, secondaryPointOfView.lng, secondaryGlobeMode]);

    // Globe point data generators
    const primaryGlobePointData = (): any[] => 
        (pointOfView.lat != null && pointOfView.lng != null) 
            ? [{ ...pointOfView, name: 'Current Location', color: '#3b82f6', size: 0.8 }] 
            : [];

    const secondaryGlobePointData = (): any[] => {
        if (secondaryGlobeMode === 'dual-point') 
            return (secondaryPointOfView.lat != null && secondaryPointOfView.lng != null) 
                ? [{ ...secondaryPointOfView, name: 'Secondary Point', color: '#eab308', size: 0.8 }] 
                : [];
        if (pointOfView.lat == null || pointOfView.lng == null) return [];
        if (secondaryGlobeMode === 'prehistoric_same_point') 
            return [{ ...pointOfView, name: `Location on ${selectedPrehistoricMap?.name.split('(')[0].trim() || 'Prehistoric Map'}`, color: '#f97316', size: 0.8 }];
        return [{ ...getAntipodal(pointOfView as LocationCoordinates), name: 'Antipodal Point', color: '#10b981', size: 0.8 }];
    };

    /**
     * Handle user-initiated globe rotation/zoom
     * Synchronizes both globes based on current mode and lock state
     */
    const handleUserPovChange = (newPovFromEvent: PointOfView, globeIdentifier: 'main' | 'secondary') => {
        if (programmaticMoveInProgressRef.current) return;
        if (newPovFromEvent.lat == null || newPovFromEvent.lng == null || newPovFromEvent.altitude == null) return;

        const newPov = newPovFromEvent as LocationCoordinates;
        if (globeIdentifier === 'main') {
            latestPovs.current.primary = newPov;
        } else {
            latestPovs.current.secondary = newPov;
        }

        expectAnimatedMoveRef.current = false;
        activeInteractionGlobeRef.current = globeIdentifier;

        // Synchronize globes based on mode
        if (secondaryGlobeMode === 'dual-point') {
            if (isDualModeLocked) {
                if (globeIdentifier === 'main') {
                    const targetPos = normalizeCoordinates(newPov.lat + povOffset.current.lat, newPov.lng + povOffset.current.lng);
                    secondaryGlobeEl.current?.pointOfView({ ...targetPos, altitude: newPov.altitude }, 0);
                } else {
                    const targetPos = normalizeCoordinates(newPov.lat - povOffset.current.lat, newPov.lng - povOffset.current.lng);
                    globeEl.current?.pointOfView({ ...targetPos, altitude: newPov.altitude }, 0);
                }
            } else {
                // Unlocked mode: only sync altitude
                if (globeIdentifier === 'main') {
                    secondaryGlobeEl.current?.pointOfView({ ...latestPovs.current.secondary, altitude: newPov.altitude }, 0);
                } else {
                    globeEl.current?.pointOfView({ ...latestPovs.current.primary, altitude: newPov.altitude }, 0);
                }
            }
        } else {
            const targetPov = secondaryGlobeMode === 'prehistoric_same_point' ? newPov : getAntipodal(newPov);
            const otherGlobe = globeIdentifier === 'main' ? secondaryGlobeEl : globeEl;
            otherGlobe.current?.pointOfView(targetPov, 0);
        }

        // Throttle state updates to prevent jitter
        if (syncThrottle.current) clearTimeout(syncThrottle.current);
        syncThrottle.current = setTimeout(() => {
            const lastMoved = activeInteractionGlobeRef.current;

            if (secondaryGlobeMode === 'dual-point') {
                if (isDualModeLocked) {
                    if (lastMoved === 'main') {
                        const finalPrimary = latestPovs.current.primary as LocationCoordinates;
                        setPointOfView(finalPrimary);
                        const normalizedSecondary = normalizeCoordinates(finalPrimary.lat + povOffset.current.lat, finalPrimary.lng + povOffset.current.lng);
                        setSecondaryPointOfView({ ...normalizedSecondary, altitude: finalPrimary.altitude });
                    } else {
                        const finalSecondary = latestPovs.current.secondary as LocationCoordinates;
                        setSecondaryPointOfView(finalSecondary);
                        const normalizedPrimary = normalizeCoordinates(finalSecondary.lat - povOffset.current.lat, finalSecondary.lng - povOffset.current.lng);
                        setPointOfView({ ...normalizedPrimary, altitude: finalSecondary.altitude });
                    }
                } else {
                    const finalPrimary = { ...latestPovs.current.primary as LocationCoordinates };
                    const finalSecondary = { ...latestPovs.current.secondary as LocationCoordinates };
                    if (lastMoved === 'main') finalSecondary.altitude = finalPrimary.altitude;
                    else finalPrimary.altitude = finalSecondary.altitude;
                    setPointOfView(finalPrimary);
                    setSecondaryPointOfView(finalSecondary);
                }
            } else {
                if (lastMoved === 'main') {
                    setPointOfView(latestPovs.current.primary);
                } else {
                    const pov = latestPovs.current.secondary as LocationCoordinates;
                    setPointOfView(secondaryGlobeMode === 'prehistoric_same_point' ? pov : getAntipodal(pov));
                }
            }
            syncThrottle.current = null;
        }, 100);
    };

    const handleDualModeLockToggle = () => {
        if (!isDualModeLocked) {
            // Transitioning to locked: calculate current offset
            if (syncThrottle.current) { clearTimeout(syncThrottle.current); syncThrottle.current = null; }
            const currentPrimary = latestPovs.current.primary;
            const currentSecondary = latestPovs.current.secondary;
            if (currentPrimary.lat != null && currentPrimary.lng != null && currentSecondary.lat != null && currentSecondary.lng != null) {
                const newOffset = { 
                    lat: currentSecondary.lat - currentPrimary.lat, 
                    lng: currentSecondary.lng - currentPrimary.lng 
                };
                povOffset.current = newOffset;
                setPointOfView(currentPrimary);
                setSecondaryPointOfView(currentSecondary);
            }
        }
        lockChosenByUser.current = true;
        setIsDualModeLocked(prev => !prev);
    };

    /**
     * Initialize globes from URL parameters or default location
     * Attempts IP geolocation if no URL coordinates present
     */
    useEffect(() => {
        if (!globeReady || !secondaryGlobeReady || initialAnimationDone.current || urlCoordsApplied.current) return;

        const slug = mapSlugFromParams?.toLowerCase() || 'antipodal';
        programmaticMoveInProgressRef.current = true;
        
        const lat = parseFloat(searchParams.get('lat') || '');
        const lng = parseFloat(searchParams.get('lng') || '');
        const alt = parseFloat(searchParams.get('alt') || '');
        // ?compare=<landmark> makes the landmark the secondary point and zooms both globes in to frame it
        const compareLandmark = slug === 'dual-point' ? findLandmark(searchParams.get('compare')) : undefined;
        const compareAltitude = compareLandmark && landmarkCoordinates(compareLandmark).altitude;

        let initialPrimaryPov: LocationCoordinates | null = null;
        let initialSecondaryPov: LocationCoordinates | null = null;
        
        if (!isNaN(lat) && !isNaN(lng) && !isNaN(alt)) {
            urlCoordsApplied.current = true;
            initialPrimaryPov = { lat, lng, altitude: alt };

            if (slug === 'dual-point') {
                const lat2 = parseFloat(searchParams.get('lat2') || '');
                const lng2 = parseFloat(searchParams.get('lng2') || '');
                const alt2 = parseFloat(searchParams.get('alt2') || '');
                if (compareLandmark) {
                    initialSecondaryPov = { lat: compareLandmark.lat, lng: compareLandmark.lng, altitude: alt };
                } else if (!isNaN(lat2) && !isNaN(lng2) && !isNaN(alt2)) {
                    initialSecondaryPov = { lat: lat2, lng: lng2, altitude: alt2 };
                } else { 
                    initialSecondaryPov = { ...initialPrimaryPov };
                }
            } else { 
                const isPrehistoric = prehistoricMapOptions.some(m => m.slug === slug);
                const baseSecondary = isPrehistoric ? initialPrimaryPov : getAntipodal(initialPrimaryPov);
                initialSecondaryPov = { ...baseSecondary, altitude: alt };
            }
        }
        
        if (slug === 'dual-point' && initialPrimaryPov && initialSecondaryPov) {
            povOffset.current = {
                lat: initialSecondaryPov.lat - initialPrimaryPov.lat,
                lng: initialSecondaryPov.lng - initialPrimaryPov.lng,
            };
        }
        
        // Default to Kansas if no valid URL coordinates
        if (!initialPrimaryPov || !initialSecondaryPov) {
            const initialAltitude = isNarrowLayout ? NARROW_LAYOUT_ALTITUDE_TARGET : WIDE_LAYOUT_ALTITUDE_TARGET;
            initialPrimaryPov = { ...KANSAS_LOCATION, altitude: initialAltitude };
            
            const isPrehistoric = prehistoricMapOptions.some(m => m.slug === slug);
            const baseSecondary = compareLandmark ?? ((slug === 'dual-point' || isPrehistoric) 
                ? KANSAS_LOCATION 
                : getAntipodal(KANSAS_LOCATION));
                
            initialSecondaryPov = { lat: baseSecondary.lat, lng: baseSecondary.lng, altitude: initialAltitude };

            // Attempt IP geolocation after brief delay
            setTimeout(() => {
                if (ipLookupAttempted.current || urlCoordsApplied.current) return;
                ipLookupAttempted.current = true;
                setIsLoading(true);
                let located = false;
                fetch('https://ipapi.co/json/')
                    .then(res => res.json())
                    .then(data => {
                        if (data.latitude && data.longitude) {
                            located = true;
                            // The effect that moves the primary globe skips dual-point mode, so move it directly
                            if (slug === 'dual-point') {
                                goToPlaceRef.current({ lat: data.latitude, lng: data.longitude, altitude: compareAltitude }, 'main');
                                return;
                            }
                            // Only animate if map tiles aren't showing
                            if (!showMapTiles) {
                                expectAnimatedMoveRef.current = true;
                            }
                            setPointOfView(prev => ({ lat: data.latitude, lng: data.longitude, altitude: prev.altitude }));
                        }
                    })
                    .catch(e => console.warn('IP-based geolocation failed.', e))
                    .finally(() => {
                        setIsLoading(false);
                        // Still zoom in to the comparison, from the default location
                        if (!located && compareAltitude != null) {
                            goToPlaceRef.current({ lat: KANSAS_LOCATION.lat, lng: KANSAS_LOCATION.lng, altitude: compareAltitude }, 'main');
                        }
                    });
            }, INTRO_DELAY_MS);
        }

        // Set initial positions
        globeEl.current?.pointOfView(initialPrimaryPov, 0);
        secondaryGlobeEl.current?.pointOfView(initialSecondaryPov, 0);
        setPointOfView(initialPrimaryPov);
        setSecondaryPointOfView(initialSecondaryPov);
        latestPovs.current = { primary: initialPrimaryPov, secondary: initialSecondaryPov };

        initialAnimationDone.current = true;
        setTimeout(() => { programmaticMoveInProgressRef.current = false; }, 100);

        // A comparison link with coordinates zooms in on them; without, the location lookup above does
        if (compareAltitude != null && urlCoordsApplied.current) {
            const primary = initialPrimaryPov;
            setTimeout(() => goToPlaceRef.current({ ...primary, altitude: compareAltitude }, 'main'), INTRO_DELAY_MS);
        }
    }, [globeReady, secondaryGlobeReady, isNarrowLayout, searchParams, mapSlugFromParams, showMapTiles]);

    // Update primary globe position (non-dual-point modes)
    useEffect(() => {
        if (secondaryGlobeMode === 'dual-point' || !initialAnimationDone.current || 
            activeInteractionGlobeRef.current !== null || programmaticMoveInProgressRef.current) return;
        
        const pov = pointOfView as LocationCoordinates;
        if (pov.lat == null || pov.lng == null || pov.altitude == null) return;
        
        const duration = expectAnimatedMoveRef.current ? 1000 : 0;
        globeEl.current?.pointOfView(pov, duration);
        
        const targetPov = secondaryGlobeMode === 'prehistoric_same_point' ? pov : getAntipodal(pov);
        secondaryGlobeEl.current?.pointOfView(targetPov, duration);
        
        if (expectAnimatedMoveRef.current) expectAnimatedMoveRef.current = false;
    }, [pointOfView, secondaryGlobeMode]);

    // Update secondary globe position (dual-point mode only)
    useEffect(() => {
        if (secondaryGlobeMode !== 'dual-point' || !initialAnimationDone.current || 
            activeInteractionGlobeRef.current !== null || programmaticMoveInProgressRef.current) return;
        
        secondaryGlobeEl.current?.pointOfView(secondaryPointOfView, expectAnimatedMoveRef.current ? 1000 : 0);
    }, [secondaryPointOfView, secondaryGlobeMode]);

    // Handle window resize and layout changes
    useEffect(() => {
        const handleResize = () => {
            setTimeout(() => {
                if (secondaryGlobePanelRef.current) {
                    const rect = secondaryGlobePanelRef.current.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) 
                        setSecondaryGlobeDimensions({ width: rect.width, height: rect.height });
                }
                if (primaryGlobePanelRef.current) {
                    const rect = primaryGlobePanelRef.current.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) 
                        setPrimaryGlobeDimensions({ width: rect.width, height: rect.height });
                }
            }, 50);
            
            const currentlyNarrow = window.innerWidth < 1024;
            if (currentlyNarrow !== isNarrowLayout) setIsNarrowLayout(currentlyNarrow);
        };

        setTimeout(handleResize, 100);
        window.addEventListener('resize', handleResize);
        
        const resizeObserver = new ResizeObserver(handleResize);
        if (secondaryGlobePanelRef.current) resizeObserver.observe(secondaryGlobePanelRef.current);
        if (primaryGlobePanelRef.current) resizeObserver.observe(primaryGlobePanelRef.current);

        return () => { 
            window.removeEventListener('resize', handleResize); 
            resizeObserver.disconnect(); 
        };
    }, [isNarrowLayout]);

    /**
     * Move the primary point to the user's location: precise if they allow it, else from their
     * IP address. In dual-point mode the secondary point stays put, like a search.
     */
    const resetToUserLocation = async () => {
        setIsLoading(true);
        try {
            const location = await getPreciseLocation().catch(error => {
                console.warn('Precise geolocation failed, falling back to IP.', error);
                return getIpLocation();
            });
            goToPlaceRef.current(location, 'main');
        } catch (error) {
            console.warn('Failed to reset to user location.', error);
            goToPlaceRef.current({ lat: KANSAS_LOCATION.lat, lng: KANSAS_LOCATION.lng }, 'main');
        } finally { 
            setIsLoading(false); 
        }
    };

    /**
     * Move to a searched place. In dual-point mode only the searched globe moves and the
     * lock offset is recalculated, so search sets each point independently. A place with its
     * own altitude (a landmark) zooms both globes to it, keeping them at the same scale.
     */
    const goToPlace = (coords: LocationCoordinates, globeIdentifier: 'main' | 'secondary') => {
        if (!initialAnimationDone.current) return;
        if (syncThrottle.current) { clearTimeout(syncThrottle.current); syncThrottle.current = null; }
        if (placeMoveTimer.current) clearTimeout(placeMoveTimer.current);
        activeInteractionGlobeRef.current = null;
        ipLookupAttempted.current = true;

        // Drive the globes directly and hold off the POV sync effects and zoom handler until the animation ends
        programmaticMoveInProgressRef.current = true;
        const target = { ...coords, altitude: coords.altitude ?? latestPovs.current.primary.altitude };

        if (secondaryGlobeMode === 'dual-point') {
            const primary = globeIdentifier === 'main' ? target : { ...latestPovs.current.primary as LocationCoordinates, altitude: target.altitude };
            const secondary = globeIdentifier === 'secondary' ? target : { ...latestPovs.current.secondary as LocationCoordinates, altitude: target.altitude };
            povOffset.current = { lat: secondary.lat - primary.lat, lng: secondary.lng - primary.lng };
            globeEl.current?.pointOfView(primary, PLACE_ANIMATION_MS);
            secondaryGlobeEl.current?.pointOfView(secondary, PLACE_ANIMATION_MS);
            setPointOfView(primary);
            setSecondaryPointOfView(secondary);
        } else {
            globeEl.current?.pointOfView(target, PLACE_ANIMATION_MS);
            const secondaryTarget = secondaryGlobeMode === 'prehistoric_same_point' ? target : getAntipodal(target);
            secondaryGlobeEl.current?.pointOfView(secondaryTarget, PLACE_ANIMATION_MS);
            setPointOfView(target);
        }

        placeMoveTimer.current = setTimeout(() => {
            programmaticMoveInProgressRef.current = false;
            placeMoveTimer.current = null;
        }, PLACE_ANIMATION_MS + 100);
    };
    goToPlaceRef.current = goToPlace;

    /**
     * Searched points are usually unrelated places to explore side by side (a house and a
     * landmark), so unlock the globes for them unless the user has set the lock themselves.
     */
    const goToSearchedPlace = (coords: LocationCoordinates, globeIdentifier: 'main' | 'secondary') => {
        if (secondaryGlobeMode === 'dual-point' && !lockChosenByUser.current) setIsDualModeLocked(false);
        goToPlace(coords, globeIdentifier);
    };

    /**
     * Switch to dual-point mode with the secondary search open on the landmark list. The
     * secondary point starts at the primary one until a place is picked.
     */
    const startComparison = () => {
        setSecondaryPointOfView({ ...latestPovs.current.primary });
        setOpenSecondarySearch(true);
        handleSecondaryGlobeOptionChange('dual-point');
    };

    useEffect(() => {
        if (secondaryGlobeMode !== 'dual-point') setOpenSecondarySearch(false);
    }, [secondaryGlobeMode]);

    const handleSecondaryGlobeOptionChange = (value: string) => {
        const slug = (value === 'antipodal' || value === 'dual-point') 
            ? value 
            : prehistoricMapOptions.find(m => m.url === value)?.slug || 'antipodal';

        const newPath = `/${slug}?${searchParams.toString()}`;

        if (window.location.pathname.toLowerCase() !== `/${slug}`) {
            activeInteractionGlobeRef.current = null;
            expectAnimatedMoveRef.current = true;
            navigate(newPath);
        }
    };

    // Attribution popover handlers
    const handleAttributionClick = (text: string, event: React.MouseEvent) => { 
        event.stopPropagation(); 
        setAttributionPopover({ text, x: event.clientX, y: event.clientY }); 
    };

    useEffect(() => { 
        const handleClickOutside = (event: MouseEvent) => { 
            if (attributionPopoverRef.current && !attributionPopoverRef.current.contains(event.target as Node)) 
                setAttributionPopover(null); 
        }; 
        if (attributionPopover) document.addEventListener('mousedown', handleClickOutside); 
        else document.removeEventListener('mousedown', handleClickOutside); 
        return () => document.removeEventListener('mousedown', handleClickOutside); 
    }, [attributionPopover]);

    useEffect(() => { 
        if (!showInfoModal) setAttributionPopover(null); 
    }, [showInfoModal]);

    // The info modal's backdrop blur re-filters both globe canvases on every frame they
    // redraw, which makes its animation stutter. Freeze the globes while it's open.
    useEffect(() => {
        const globes = [globeEl.current, secondaryGlobeEl.current];
        if (showInfoModal) globes.forEach(globe => globe?.pauseAnimation());
        else globes.forEach(globe => globe?.resumeAnimation());
    }, [showInfoModal]);

    // Clean up interaction state on mouse/touch release
    useEffect(() => {
        const handleInteractionEnd = () => { 
            if (syncThrottle.current) clearTimeout(syncThrottle.current); 
            setTimeout(() => { activeInteractionGlobeRef.current = null; }, 150); 
        };
        
        window.addEventListener('mouseup', handleInteractionEnd);
        window.addEventListener('touchend', handleInteractionEnd);
        window.addEventListener('touchcancel', handleInteractionEnd);
        
        return () => { 
            window.removeEventListener('mouseup', handleInteractionEnd); 
            window.removeEventListener('touchend', handleInteractionEnd); 
            window.removeEventListener('touchcancel', handleInteractionEnd); 
            if (syncThrottle.current) clearTimeout(syncThrottle.current); 
        };
    }, []);

    // Compute display properties
    const secondaryGlobeImageUrl = secondaryGlobeMode === 'prehistoric_same_point' && selectedPrehistoricMap 
        ? selectedPrehistoricMap.url 
        : "//unpkg.com/three-globe/example/img/earth-day.jpg";
    
    const secondaryGlobeAtmosphereColor = secondaryGlobeMode === 'prehistoric_same_point' 
        ? '#f97316' 
        : (secondaryGlobeMode === 'dual-point' ? '#eab308' : '#10b981');
    
    const secondaryGlobeLabel = secondaryGlobeMode === 'antipodal' 
        ? 'Antipodal' 
        : (secondaryGlobeMode === 'dual-point' 
            ? 'Secondary' 
            : selectedPrehistoricMap?.name.split('(')[0].trim() || 'Prehistoric');
    
    const secondaryGlobeLabelColor = secondaryGlobeMode === 'antipodal' 
        ? 'bg-emerald-500' 
        : (secondaryGlobeMode === 'dual-point' ? 'bg-yellow-500' : 'bg-orange-500');

    let juxtaGlobeSubtitle = "Compare Earth's present with its past or its opposite point.";
    if (secondaryGlobeMode === 'antipodal') {
        juxtaGlobeSubtitle = "Showing modern Earth alongside its antipodal point.";
    } else if (secondaryGlobeMode === 'dual-point') {
        juxtaGlobeSubtitle = "Set two independent points and rotate them in sync.";
    } else if (selectedPrehistoricMap) {
        const mapNamePart = selectedPrehistoricMap.name.split('(')[0].trim();
        const mapAgePart = selectedPrehistoricMap.name.match(/\(([^)]+)\)/)?.[1];
        juxtaGlobeSubtitle = `Comparing modern Earth with the ${mapNamePart}${mapAgePart ? ` (${mapAgePart})` : ''}.`;
    }

    let displaySecondaryLat: number | undefined, displaySecondaryLng: number | undefined;
    if (secondaryGlobeMode === 'dual-point') {
        displaySecondaryLat = secondaryPointOfView.lat;
        displaySecondaryLng = secondaryPointOfView.lng;
    } else if (pointOfView.lat != null && pointOfView.lng != null) {
        if (secondaryGlobeMode === 'antipodal') {
            const antipodalPoint = getAntipodal(pointOfView as LocationCoordinates);
            displaySecondaryLat = antipodalPoint.lat;
            displaySecondaryLng = antipodalPoint.lng;
        } else {
            displaySecondaryLat = pointOfView.lat;
            displaySecondaryLng = pointOfView.lng;
        }
    }

    const secondaryCoordsText = displaySecondaryLat != null && displaySecondaryLng != null 
        ? `${displaySecondaryLat.toFixed(3)}°, ${displaySecondaryLng.toFixed(3)}°` 
        : '---.-° ---.-°';

    const coordsBoxClassName = 'bg-neutral-800/50 backdrop-blur-md rounded-lg sm:rounded-xl p-2.5 sm:p-3 border border-neutral-700/80 transition-all duration-300';

    const getSecondaryClassNames = (base: 'hover' | 'icon' | 'link') => {
        switch (secondaryGlobeMode) {
            case 'antipodal': 
                return base === 'hover' 
                    ? 'group-hover:border-emerald-500/70 group-hover:shadow-emerald-500/10' 
                    : base === 'icon' ? 'text-emerald-400' : 'hover:text-emerald-400';
            case 'prehistoric_same_point': 
                return base === 'hover' 
                    ? 'group-hover:border-orange-500/70 group-hover:shadow-orange-500/10' 
                    : base === 'icon' ? 'text-orange-400' : 'hover:text-orange-400';
            case 'dual-point': 
                return base === 'hover' 
                    ? 'group-hover:border-yellow-500/70 group-hover:shadow-yellow-500/10' 
                    : base === 'icon' ? 'text-yellow-400' : 'hover:text-yellow-400';
            default: 
                return '';
        }
    };

    const secondaryBoxName = secondaryGlobeMode === 'antipodal' 
        ? 'Antipodal Point' 
        : secondaryGlobeMode === 'prehistoric_same_point' 
            ? selectedPrehistoricMap?.name.split('(')[0].trim() || 'Historic Point' 
            : 'Secondary Point';

    return (
        <div className="fixed inset-0 w-full h-full bg-neutral-950 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-neutral-950/30 to-neutral-950 pointer-events-none" />
            <div className="relative h-full flex flex-col lg:flex-row gap-0 select-none">
                <GlobePanel 
                    panelRef={secondaryGlobePanelRef as any} 
                    globeRef={secondaryGlobeEl} 
                    globeImageUrl={secondaryGlobeImageUrl} 
                    bumpImageUrl={(secondaryGlobeMode !== 'prehistoric_same_point') ? "//unpkg.com/three-globe/example/img/earth-topology.png" : ""} 
                    pointsData={secondaryGlobePointData()} 
                    onGlobeReady={() => setSecondaryGlobeReady(true)} 
                    onZoom={(pov) => handleUserPovChange(pov, 'secondary')} 
                    atmosphereColor={secondaryGlobeAtmosphereColor} 
                    dimensions={secondaryGlobeDimensions} 
                    labelText={secondaryGlobeLabel} 
                    labelColorIndicatorClass={secondaryGlobeLabelColor} 
                    showMapTiles={showMapTiles} 
                />
                <GlobePanel 
                    panelRef={primaryGlobePanelRef as any} 
                    globeRef={globeEl} 
                    globeImageUrl="//unpkg.com/three-globe/example/img/earth-day.jpg" 
                    bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png" 
                    pointsData={primaryGlobePointData()} 
                    onGlobeReady={() => setGlobeReady(true)} 
                    onZoom={(pov) => handleUserPovChange(pov, 'main')} 
                    atmosphereColor="#3b82f6" 
                    dimensions={primaryGlobeDimensions} 
                    labelText="Primary" 
                    labelColorIndicatorClass="bg-blue-500" 
                    showMapTiles={showMapTiles} 
                />
                <div className="flex-1 lg:flex-1 relative overflow-hidden">
                    <div className="h-full flex flex-col justify-center items-center p-4 md:p-6 lg:p-10">
                        <div className="mb-4 md:mb-6 lg:mb-10 text-center select-none">
                            <div className="flex flex-row items-center justify-center gap-x-4 md:gap-x-4 lg:flex-col lg:items-center lg:gap-x-0">
                                <h1 className="text-xl md:text-2xl lg:text-4xl font-light text-neutral-100 lg:mb-2 whitespace-nowrap">JuxtaGlobe</h1>
                                <div className="h-4 md:h-5 w-px bg-neutral-600 lg:hidden"></div>
                                <p className="text-sm md:text-sm lg:text-base text-neutral-400 font-normal max-w-[200px] md:max-w-[250px] lg:max-w-none text-left">{juxtaGlobeSubtitle}</p>
                            </div>
                        </div>
                        <div className="w-full max-w-xl lg:max-w-xs">
                            <div className="flex flex-row items-stretch gap-x-4 lg:flex-col lg:items-stretch lg:gap-x-0 lg:gap-y-4">
                                <div className="flex-1 w-full lg:flex-none space-y-3 lg:space-y-4">
                                    <div className="group">
                                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                                            <div className="flex items-center gap-2">
                                                <Globe2 size={12} className={getSecondaryClassNames('icon')} />
                                                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{secondaryBoxName}</span>
                                            </div>
                                            {displaySecondaryLat != null && displaySecondaryLng != null && (
                                                <a 
                                                    href={`https://www.google.com/maps/search/?api=1&query=${displaySecondaryLat},${displaySecondaryLng}`}
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    title="Open in Google Maps" 
                                                    className={`text-neutral-500 ${getSecondaryClassNames('link')} transition-colors`} 
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <ExternalLink size={13} strokeWidth={2.25} />
                                                </a>
                                            )}
                                        </div>
                                        {secondaryGlobeMode === 'dual-point' ? (
                                            <LocationSearch 
                                                displayText={secondaryCoordsText} 
                                                onSelect={(coords) => goToSearchedPlace(coords, 'secondary')} 
                                                className={`${coordsBoxClassName} ${getSecondaryClassNames('hover')}`} 
                                                ariaLabel="Secondary point" 
                                                suggestions={landmarkSuggestions} 
                                                startEditing={openSecondarySearch} 
                                                biasPoint={secondaryPointOfView} 
                                            />
                                        ) : (
                                            <div className={`${coordsBoxClassName} ${getSecondaryClassNames('hover')}`}>
                                                <div className="font-mono text-xs sm:text-sm text-neutral-100 tabular-nums">
                                                    {secondaryCoordsText}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="group">
                                        <div className="flex items-center justify-between mb-1 sm:mb-2">
                                            <div className="flex items-center gap-2">
                                                <MapPin size={12} className="text-blue-400" />
                                                <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Primary View</span>
                                            </div>
                                            {pointOfView.lat != null && pointOfView.lng != null && (
                                                <a 
                                                    href={`https://www.google.com/maps/search/?api=1&query=${pointOfView.lat},${pointOfView.lng}`}
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    title="Open in Google Maps" 
                                                    className="text-neutral-500 hover:text-blue-400 transition-colors" 
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <ExternalLink size={13} strokeWidth={2.25} />
                                                </a>
                                            )}
                                        </div>
                                        <LocationSearch 
                                            displayText={`${pointOfView.lat?.toFixed(3) ?? '---.-'}°, ${pointOfView.lng?.toFixed(3) ?? '---.-'}°`} 
                                            onSelect={(coords) => goToSearchedPlace(coords, 'main')} 
                                            biasPoint={pointOfView}
                                            suggestions={landmarkSuggestions}
                                            className={`${coordsBoxClassName} group-hover:border-blue-500/70 group-hover:shadow-xl group-hover:shadow-blue-500/10`} 
                                            ariaLabel="Primary view" 
                                        />
                                    </div>
                                </div>
                                {/* Side by side, the top padding matches the label rows above the coordinate boxes,
                                    so the buttons span from the top of the first box to the bottom of the last */}
                                <div className="flex-1 w-full lg:flex-none flex flex-col gap-1.5 pt-5 sm:pt-6 lg:pt-0 lg:gap-2.5">
                                    {secondaryGlobeMode === 'dual-point' ? (
                                        <button 
                                            onClick={() => handleDualModeLockToggle()} 
                                            className="w-full flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-yellow-600/20 hover:bg-yellow-600/40 backdrop-blur-sm rounded-md sm:rounded-lg text-xs sm:text-sm font-medium text-yellow-200 hover:text-yellow-100 transition-all duration-300 border border-yellow-500/40 hover:border-yellow-500/60"
                                        >
                                            {isDualModeLocked ? <Lock size={13} /> : <Unlock size={13} />} 
                                            {isDualModeLocked ? 'Unlock Globes' : 'Lock Globes'}
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={startComparison} 
                                            title="Compare your location with a famous place at the same scale" 
                                            className="w-full flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-yellow-600/20 hover:bg-yellow-600/40 backdrop-blur-sm rounded-md sm:rounded-lg text-xs sm:text-sm font-medium text-yellow-200 hover:text-yellow-100 transition-all duration-300 border border-yellow-500/40 hover:border-yellow-500/60"
                                        >
                                            <Landmark size={13} /> 
                                            Compare Sizes
                                        </button>
                                    )}
                                    <button 
                                        onClick={resetToUserLocation} 
                                        disabled={isLoading} 
                                        className="w-full flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600/80 hover:bg-blue-500/90 backdrop-blur-sm rounded-md sm:rounded-lg text-xs sm:text-sm font-medium text-blue-100 hover:text-white transition-all duration-300 border border-blue-500/50 hover:border-blue-400/70 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-blue-500/40"
                                    >
                                        <Navigation size={13} className={isLoading ? 'animate-spin' : ''} /> 
                                        My Location
                                    </button>
                                    <button 
                                        onClick={() => setShowInfoModal(true)} 
                                        className="w-full flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-neutral-700/40 hover:bg-neutral-700/60 backdrop-blur-sm rounded-md sm:rounded-lg text-xs sm:text-sm font-medium text-neutral-300 hover:text-neutral-100 transition-all duration-300 border border-neutral-600/70 hover:border-neutral-500/90"
                                    >
                                        <Settings size={13} /> 
                                        Display Options
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <InfoModal 
                isOpen={showInfoModal} 
                onClose={() => setShowInfoModal(false)} 
                secondaryGlobeMode={secondaryGlobeMode} 
                selectedPrehistoricMap={selectedPrehistoricMap} 
                prehistoricMapOptions={prehistoricMapOptions} 
                onSecondaryGlobeOptionChange={handleSecondaryGlobeOptionChange} 
                onAttributionClick={handleAttributionClick} 
                showMapTiles={showMapTiles} 
                onMapTilesToggle={handleMapTilesToggle} 
            />
            
            {attributionPopover && (
                <div 
                    ref={attributionPopoverRef} 
                    style={{ 
                        position: 'fixed', 
                        top: `${attributionPopover.y + 10}px`, 
                        left: `${attributionPopover.x + 10}px`, 
                        zIndex: 60 
                    }} 
                    className="bg-neutral-700/90 backdrop-blur-sm border border-neutral-600 p-3 rounded-lg shadow-xl text-xs text-neutral-100 max-w-[280px] sm:max-w-xs animate-fadeIn"
                >
                    <div className="flex justify-between items-center mb-2">
                        <span className="font-semibold text-sm text-neutral-100">Map Attribution</span>
                        <button 
                            onClick={() => setAttributionPopover(null)} 
                            className="text-neutral-400 hover:text-neutral-100 bg-transparent border-none p-0 leading-none text-xl hover:bg-neutral-600/50 rounded-full w-5 h-5 flex items-center justify-center" 
                            aria-label="Close attribution"
                        >
                            ×
                        </button>
                    </div>
                    <p className="text-neutral-200 leading-normal">{attributionPopover.text}</p>
                </div>
            )}
        </div>
    );
};

export default GlobeViewer;