import React, { useEffect, useMemo, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import type { GlobeMethods } from 'react-globe.gl';
import type { PointOfView } from '../types';
import { Camera, ImageLoader, MathUtils, Mesh, Object3D, OrthographicCamera, PerspectiveCamera, SphereGeometry, Texture, TextureLoader, Vector3 } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Sharpen textures viewed at oblique angles (globe edges). three.js clamps this
// to the GPU's max supported anisotropy, so a high value is safe everywhere.
Texture.DEFAULT_ANISOTROPY = 16;

// Below this altitude (in globe radii) Earth globes switch from the base image to
// satellite tiles, which keep loading finer detail the further you zoom. Kept low
// because the satellite imagery has much darker oceans than the base image, which
// dominates the view when zoomed out.
const SATELLITE_TILES_MAX_ALTITUDE = 0.5;
// blankTile=false makes Esri 404 where it has no imagery (e.g. open ocean past z13)
// instead of serving a "Map data not yet available" placeholder. The tile engine
// skips failed tiles, so the previous, more zoomed-out level stays visible there.
const satelliteTileUrl = (x: number, y: number, z: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?blankTile=false`;
const streetTileUrl = (x: number, y: number, z: number) =>
  `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
// Deepest tile level each source serves. Esri has z20 in many places and 404s where it
// doesn't, which falls back to z19 as above; OSM stops at z19.
const SATELLITE_TILES_MAX_LEVEL = 20;
const STREET_TILES_MAX_LEVEL = 19;

// globe.gl's drag speed per unit altitude
const GLOBE_GL_ROTATE_FACTOR = 0.3;
// globe.gl's fixed camera near plane, which is what caps its zoom at ~3.5 km above Earth
const GLOBE_GL_CAMERA_NEAR = 0.05;
// Closest zoom, in globe radii (~32 m above Earth)
const MIN_ALTITUDE = 0.000005;
// Most tile downloads running at once, across both globes. Few enough that a new level's tiles
// start soon after a zoom, enough to keep the connection busy.
const MAX_TILE_REQUESTS_IN_FLIGHT = 8;
// How long the tile level has to hold still before a zoom counts as over
const ZOOM_SETTLE_MS = 400;

type TileUrlFn = (x: number, y: number, z: number) => string;

// three-globe's group holding the image globe mesh and the tile engine
const findGlobeGroup = (globe: GlobeMethods) => {
  let globeGroup: Object3D | undefined;
  globe.scene().traverse(obj => {
    if ((obj as Object3D & { __globeObjType?: string }).__globeObjType === 'globe') globeGroup = obj;
  });
  return globeGroup;
};

type TileEngine = Object3D & {
  level: number;
  maxLevel: number;
  tileUrl?: TileUrlFn;
  clearTiles: () => void;
  updatePov: (camera: unknown) => void;
};

const findTileEngine = (globe: GlobeMethods) =>
  findGlobeGroup(globe)?.children.find(c => 'clearTiles' in c) as TileEngine | undefined;

/**
 * The tile engine only fetches tiles for its current level, and coarser levels stay underneath
 * to fill tiles that fail (Esri 404s where it has no imagery that deep, e.g. z18+ in much of
 * the world). That only works if the coarser levels were loaded on the way down; starting
 * zoomed in, the engine jumps straight from level 0 and leaves nothing beneath the 404s. Step
 * through the skipped levels instead, so each fetches its few tiles covering the view.
 */
const fillSkippedTileLevels = (globe: GlobeMethods) => {
  const tileEngine = findTileEngine(globe);
  if (!tileEngine || tileEngine.userData.fillsSkippedLevels) return;

  // The engine only fetches tiles with their centre or a corner in view, which rules out coarse
  // tiles much larger than the view. It already limits the search to the few tiles around the
  // camera, so fetch the skipped levels from the same spot through a frustum that takes in everything.
  const seeAllCamera = new OrthographicCamera(-1e5, 1e5, 1e5, -1e5, -1e5, 1e5);
  let camera: Camera | undefined;
  let fillingSkippedLevels = false;

  const updatePov = tileEngine.updatePov;
  tileEngine.updatePov = function (cam) {
    if (cam instanceof Camera) camera = cam;
    updatePov.call(this, cam);
  };

  const { get, set } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tileEngine), 'level')!;
  Object.defineProperty(tileEngine, 'level', {
    get,
    set(level: number) {
      const prevLevel: number = get!.call(this);
      if (fillingSkippedLevels) {
        // Stop short of the target level, which the real camera's pass below sets
        for (let l = prevLevel + 1; l < level; l++) set!.call(this, l);
      } else if (level > prevLevel + 1 && camera) {
        fillingSkippedLevels = true;
        seeAllCamera.position.copy(camera.position);
        updatePov.call(this, seeAllCamera);
        fillingSkippedLevels = false;
        updatePov.call(this, camera);
      } else {
        set!.call(this, level);
      }
    },
  });
  tileEngine.userData.fillsSkippedLevels = true;
};

/**
 * Tiles are built in globe coordinates, where float32 vertex positions are only accurate to about
 * a metre, so near the surface the imagery wobbles as the camera moves. Give each tile its own
 * origin at its centre instead: three.js combines the camera and object transforms in float64,
 * so the GPU only sees small, precise camera-relative numbers.
 */
const recenterTilesOnAdd = (globe: GlobeMethods) => {
  const tileEngine = findTileEngine(globe);
  if (!tileEngine || tileEngine.userData.recentersTiles) return;

  const add = tileEngine.add;
  tileEngine.add = function (...objects: Object3D[]) {
    objects.forEach(obj => {
      if (!(obj instanceof Mesh) || !(obj.geometry instanceof SphereGeometry) || obj.userData.recentered) return;
      const geometry = obj.geometry;
      geometry.computeBoundingBox();
      const center = geometry.boundingBox!.getCenter(new Vector3());
      geometry.translate(-center.x, -center.y, -center.z);
      obj.position.copy(center);
      // Coarser levels stay underneath the current one, which relies on them drawing first. They
      // used to share one origin and draw in creation order; now three.js would sort by distance.
      obj.renderOrder = Math.round(Math.log2((2 * Math.PI) / geometry.parameters.phiLength));
      obj.userData.recentered = true;
    });
    return add.apply(this, objects);
  };
  tileEngine.userData.recentersTiles = true;
};

interface TileRequest {
  engine: TileEngine;
  level: number;
  order: number;
  start: () => HTMLImageElement;
  // Hands the engine an empty result, so it clears its loading flag and refetches the tile if needed
  drop: () => void;
  image?: HTMLImageElement;
}

// Tile URLs the engines are about to load, with the engine and level each is for
const pendingTileRequests = new Map<string, { engine: TileEngine; level: number }>();
const queuedTileRequests: TileRequest[] = [];
const inFlightTileRequests = new Set<TileRequest>();
let tileRequestCount = 0;

const cancelTileRequest = (request: TileRequest) => {
  if (inFlightTileRequests.delete(request)) request.image!.src = ''; // aborts the download
  else queuedTileRequests.splice(queuedTileRequests.indexOf(request), 1);
  request.drop();
};

// Stops a running request and puts it back in the queue, to finish once more urgent ones have
const pauseTileRequest = (request: TileRequest) => {
  inFlightTileRequests.delete(request);
  request.image!.src = '';
  queuedTileRequests.push(request);
};

// Requests for an engine's current level go first, then the coarser levels beneath it, finest first.
// While zooming, the level it's working through goes ahead of them all.
const tileRequestDepth = (request: TileRequest) => {
  const { engine } = request;
  if (engine.userData.zooming && request.level === engine.userData.progressLevel) return -1;
  return engine.level - request.level;
};

const startTileRequests = () => {
  // Zooming out removes the finer levels' tiles, so their downloads are wasted
  [...inFlightTileRequests, ...queuedTileRequests]
    .filter(request => request.level > request.engine.level)
    .forEach(cancelTileRequest);

  // The current level changes faster than its tiles load during a long zoom, so always chasing it
  // would leave every level half loaded. Finish one level instead, then jump to wherever the zoom
  // has got to, so the view keeps sharpening a full level at a time.
  const requests = [...inFlightTileRequests, ...queuedTileRequests];
  new Set(requests.map(request => request.engine)).forEach(engine => {
    const { userData } = engine;
    if (!userData.zooming) userData.progressLevel = undefined;
    else if (!requests.some(request => request.engine === engine && request.level === userData.progressLevel)) {
      userData.progressLevel = engine.level;
    }
  });

  while (inFlightTileRequests.size < MAX_TILE_REQUESTS_IN_FLIGHT) {
    // Newest first within a level, as those cover where the camera is now. Hold off while tiles are off.
    let next: TileRequest | undefined;
    for (const request of queuedTileRequests) {
      if (!request.engine.tileUrl) continue;
      const depth = tileRequestDepth(request);
      const nextDepth = next && tileRequestDepth(next);
      if (!next || depth < nextDepth! || (depth === nextDepth && request.order > next.order)) next = request;
    }
    if (!next) break;
    queuedTileRequests.splice(queuedTileRequests.indexOf(next), 1);
    inFlightTileRequests.add(next);
    next.image = next.start();
  }
};

/**
 * The tile engine starts loading every tile of each level it passes through as soon as it gets
 * there, and never cancels any, so after a zoom the tiles for the level in view wait behind all
 * the coarser ones on the way down. Queue its loads instead, a few at a time, starting with the
 * current level, and cancel those for levels it has zoomed back out of.
 */
const loadTexture = TextureLoader.prototype.load;
TextureLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  const pending = pendingTileRequests.get(url);
  if (!pending) return loadTexture.call(this, url, onLoad, onProgress, onError);
  pendingTileRequests.delete(url);

  const texture = new Texture();
  const request: TileRequest = {
    ...pending,
    order: tileRequestCount++,
    // A paused request restarts with a new image, so ignore events from the one it abandoned
    start: () => {
      const image: HTMLImageElement = new ImageLoader(this.manager).setCrossOrigin(this.crossOrigin).setPath(this.path).load(
        url,
        () => {
          if (request.image !== image || !inFlightTileRequests.delete(request)) return;
          texture.image = image;
          texture.needsUpdate = true;
          onLoad?.(texture);
          startTileRequests();
        },
        undefined,
        error => {
          if (request.image !== image || !inFlightTileRequests.delete(request)) return;
          onError?.(error);
          startTileRequests();
        },
      );
      return image;
    },
    drop: () => onLoad?.(texture),
  };
  queuedTileRequests.push(request);
  startTileRequests();
  return texture;
};

const prioritizeTileRequests = (globe: GlobeMethods) => {
  const tileEngine = findTileEngine(globe);
  if (!tileEngine || tileEngine.userData.prioritizesTiles) return;

  // Note which engine and level each tile URL is for, as the loader only gets the URL
  const { get, set } = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(tileEngine), 'tileUrl')!;
  Object.defineProperty(tileEngine, 'tileUrl', {
    get,
    set(tileUrl?: TileUrlFn) {
      set!.call(this, tileUrl && ((x: number, y: number, z: number) => {
        const url = tileUrl(x, y, z);
        pendingTileRequests.set(url, { engine: tileEngine, level: z });
        return url;
      }));
    },
  });
  tileEngine.tileUrl = get!.call(tileEngine);

  // Once the zoom lands, the level in view is all that matters, so pause the coarser levels still
  // downloading if its tiles are waiting. They finish afterwards, as fallback beneath it.
  const settleZoom = () => {
    tileEngine.userData.zooming = false;
    const landedLevelWaiting = queuedTileRequests.some(r => r.engine === tileEngine && r.level === tileEngine.level);
    if (landedLevelWaiting) {
      [...inFlightTileRequests]
        .filter(request => request.engine === tileEngine && request.level < tileEngine.level)
        .forEach(pauseTileRequest);
    }
    startTileRequests();
  };

  // Level changes happen here, which can make queued and running requests obsolete
  const updatePov = tileEngine.updatePov;
  tileEngine.updatePov = function (cam) {
    const prevLevel = this.level;
    updatePov.call(this, cam);
    if (this.level !== prevLevel) {
      this.userData.zooming = true;
      clearTimeout(this.userData.settleTimer);
      this.userData.settleTimer = setTimeout(settleZoom, ZOOM_SETTLE_MS);
    }
    startTileRequests();
  };

  // Cleared tiles are never shown, even if their requests finish
  const clearTiles = tileEngine.clearTiles;
  tileEngine.clearTiles = () => {
    clearTiles();
    [...inFlightTileRequests, ...queuedTileRequests]
      .filter(request => request.engine === tileEngine)
      .forEach(cancelTileRequest);
  };
  tileEngine.userData.prioritizesTiles = true;
};

/**
 * three-globe hides the image globe whenever tiles are on, which shows black while
 * tiles load and at the poles (tiles stop at ±85°). Add a slightly smaller copy of
 * the image globe beneath the tile layer so those gaps show the image instead.
 */
const addBaseImageUnderlay = (globe: GlobeMethods) => {
  const globeGroup = findGlobeGroup(globe);
  const globeObj = globeGroup?.children.find((c): c is Mesh => c instanceof Mesh);
  if (!globeGroup || !globeObj || globeGroup.userData.hasUnderlay) return;

  const underlay = globeObj.clone(); // shares geometry & material, so it tracks image changes
  underlay.scale.setScalar(0.995);
  globeGroup.add(underlay);
  globeGroup.userData.hasUnderlay = true;
};

interface GlobePanelProps {
  panelRef: React.RefObject<HTMLDivElement>;
  globeRef: React.RefObject<GlobeMethods | undefined>;
  globeImageUrl: string;
  bumpImageUrl?: string;
  pointsData: any[];
  onGlobeReady: () => void;
  onZoom: (pov: PointOfView) => void;
  atmosphereColor: string;
  dimensions: { width: number; height: number };
  labelText: string;
  labelColorIndicatorClass: string;
  showMapTiles?: boolean;
}

const GlobePanel: React.FC<GlobePanelProps> = ({
  panelRef,
  globeRef,
  globeImageUrl,
  bumpImageUrl = "",
  pointsData,
  onGlobeReady,
  onZoom,
  atmosphereColor,
  dimensions,
  labelText,
  labelColorIndicatorClass,
  showMapTiles = false,
}) => {
  const isEligibleForMapTiles = globeImageUrl.toLowerCase().includes('earth');
  const [isZoomedIn, setIsZoomedIn] = useState(false);

  let tileUrl: TileUrlFn | undefined;
  if (isEligibleForMapTiles) {
    if (showMapTiles) tileUrl = streetTileUrl;
    else if (isZoomedIn) tileUrl = satelliteTileUrl;
  }

  // The tile engine keeps cached tiles when its URL changes, so switching between
  // street and satellite tiles would leave the old ones on screen. Clear and refetch,
  // starting back from level 0 so the coarser fallback levels are refetched too.
  const lastTileUrlRef = useRef<TileUrlFn | undefined>(undefined);
  useEffect(() => {
    if (!tileUrl) return;
    const globe = globeRef.current;
    const tileEngine = globe && findTileEngine(globe);
    if (tileEngine && lastTileUrlRef.current && lastTileUrlRef.current !== tileUrl) {
      tileEngine.clearTiles();
      tileEngine.level = 0;
      tileEngine.updatePov(globe.camera());
    }
    lastTileUrlRef.current = tileUrl;
  }, [tileUrl, globeRef]);

  // react-globe.gl doesn't pass globeTileEngineMaxLevel through, so set it on the engine
  const tileMaxLevel = showMapTiles ? STREET_TILES_MAX_LEVEL : SATELLITE_TILES_MAX_LEVEL;
  const applyTileMaxLevel = () => {
    const tileEngine = globeRef.current && findTileEngine(globeRef.current);
    if (tileEngine) tileEngine.maxLevel = tileMaxLevel;
  };
  useEffect(applyTileMaxLevel, [tileMaxLevel, globeRef]);

  const handleZoom = (pov: PointOfView) => {
    if (pov.altitude != null) setIsZoomedIn(pov.altitude < SATELLITE_TILES_MAX_ALTITUDE);
    onZoom(pov);
  };

  const handleGlobeReady = () => {
    if (globeRef.current) {
      addBaseImageUnderlay(globeRef.current);
      recenterTilesOnAdd(globeRef.current);
      fillSkippedTileLevels(globeRef.current);
      prioritizeTileRequests(globeRef.current);
    }
    applyTileMaxLevel();
    onGlobeReady();
  };

  // 1. Determine if the globe should animate based on the URL parameters.
  //    useMemo ensures this logic runs only once when the component mounts.
  //    Skip it when tiles show from the start: animateIn scales and spins the globe after
  //    onGlobeReady, and the tile engine, seeing a shrunken, rotated globe, requests
  //    thousands of tiles in the wrong place that hold up the ones actually in view.
  const shouldAnimateIn = useMemo(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const startsWithTiles = urlParams.get('map') === 't'
      || parseFloat(urlParams.get('alt') ?? '') < SATELLITE_TILES_MAX_ALTITUDE;
    return !startsWithTiles;
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls() as OrbitControls;
    const camera = globe.camera() as PerspectiveCamera;

    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enablePan = false;
    controls.autoRotate = false;
    // globe.gl enables zoom-to-cursor, which drags the centre point toward the cursor while
    // zooming. Zoom straight in/out instead so the current location stays put.
    controls.zoomToCursor = false;

    // Add pole angle restrictions to prevent gimbal lock
    // These values prevent the camera from going directly over the poles
    controls.minPolarAngle = 0.1; // ~5.7 degrees from north pole
    controls.maxPolarAngle = Math.PI - 0.1; // ~5.7 degrees from south pole

    const globeRadius = globe.getGlobeRadius();
    controls.minDistance = globeRadius * (1 + MIN_ALTITUDE);

    // globe.gl resets both speeds on every camera change (rotate ∝ altitude, zoom ∝ √altitude).
    // Its zoom speed is far too coarse near the surface: OrbitControls scales the distance to the
    // globe centre, not the altitude, so at altitude 0.001 a 2× pinch changes altitude ~12×.
    // This listener runs after globe.gl's, so it overrides them.
    const tuneControlSpeeds = () => {
      const altitude = globe.pointOfView().altitude;
      // Pinch scales altitude 1:1 (and a wheel notch ~5%, as globe.gl does at altitude 1)
      controls.zoomSpeed = altitude / (1 + altitude);
      // Near the surface, keep the ground under the cursor instead of globe.gl's 2× drag. Blend back
      // to globe.gl's faster spin by altitude 1, where the globe is seen whole.
      const groundLockedFactor = Math.tan(MathUtils.degToRad(camera.fov / 2)) / Math.PI;
      const factor = groundLockedFactor + (GLOBE_GL_ROTATE_FACTOR - groundLockedFactor) * Math.min(1, altitude);
      controls.rotateSpeed = altitude * factor;
      // Pull the near plane in with the camera so it never clips the surface below. Keep
      // globe.gl's value further out, where a smaller one would only cost depth precision.
      camera.near = Math.min(GLOBE_GL_CAMERA_NEAR, altitude * globeRadius * 0.5);
      camera.updateProjectionMatrix();
    };
    tuneControlSpeeds();
    controls.addEventListener('change', tuneControlSpeeds);

    // OrbitControls only emits 'change' once the camera has moved 0.001 units (~64 m) since the last
    // one. Near the surface each frame moves far less, so everything hanging off it (the other
    // globe's sync, tile loading, the tuning above) lags and then jumps. Emit it from ~0.1 px instead.
    const update = controls.update;
    const lastPosition = camera.position.clone();
    controls.update = function (deltaTime) {
      let changed = update.call(this, deltaTime);
      const threshold = (camera.position.length() - globeRadius) * 1e-4;
      if (!changed && camera.position.distanceToSquared(lastPosition) > threshold ** 2) {
        this.dispatchEvent({ type: 'change' });
        changed = true;
      }
      if (changed) lastPosition.copy(camera.position);
      return changed;
    };

    // OrbitControls tracks each finger by pointer id and only forgets one on a pointerup/pointercancel
    // at its canvas. Mobile browsers sometimes drop that event at the end of a pinch, and the leftover
    // pointer makes every later one-finger drag count as the second finger of a pinch, so dragging
    // zooms instead of rotating. Once no fingers are left on the screen, drop any it still holds.
    // (Replaying a pointerup won't do: it releases pointer capture, which throws for a gone pointer.)
    const internals = controls as unknown as {
      _pointers: number[];
      _pointerPositions: Record<number, unknown>;
      _onPointerMove: (event: PointerEvent) => void;
      _onPointerUp: (event: PointerEvent) => void;
      state: number;
    };
    const releaseStalePointers = (event: TouchEvent) => {
      if (event.touches.length > 0 || internals._pointers.length === 0) return;
      internals._pointers.length = 0;
      internals._pointerPositions = {};
      controls.domElement?.removeEventListener('pointermove', internals._onPointerMove);
      controls.domElement?.removeEventListener('pointerup', internals._onPointerUp);
      internals.state = -1; // _STATE.NONE
      controls.dispatchEvent({ type: 'end' });
    };
    window.addEventListener('touchend', releaseStalePointers);
    window.addEventListener('touchcancel', releaseStalePointers);

    return () => {
      controls.removeEventListener('change', tuneControlSpeeds);
      controls.update = update;
      window.removeEventListener('touchend', releaseStalePointers);
      window.removeEventListener('touchcancel', releaseStalePointers);
    };
  }, [globeRef]);

  return (
    <div className="flex-1 relative overflow-hidden border-b lg:border-b-0 lg:border-r border-neutral-800">
      <div className="absolute top-0 left-0 right-0 z-10 p-4 lg:p-6 flex justify-between items-center pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto bg-black/40 backdrop-blur-sm pr-3 pl-2 py-1 rounded-lg">
          <div className={`w-2 h-2 ${labelColorIndicatorClass} rounded-full`} />
          <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
            {labelText}
          </h2>
        </div>
      </div>
      <div ref={panelRef} className="h-full flex-1 relative select-none">
        {(dimensions.width > 0 && dimensions.height > 0) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Globe
              ref={globeRef as React.MutableRefObject<GlobeMethods | undefined>}
              globeImageUrl={globeImageUrl}
              bumpImageUrl={bumpImageUrl}
              backgroundImageUrl=""
              backgroundColor="rgba(0,0,0,0)"
              pointsData={[]}
              pointLat="lat"
              pointLng="lng"
              pointLabel="name"
              pointColor="color"
              pointAltitude={0.01}
              pointRadius="size"
              onGlobeReady={handleGlobeReady}
              onZoom={handleZoom}
              enablePointerInteraction={true}
              atmosphereColor={atmosphereColor}
              atmosphereAltitude={0.18}
              width={dimensions.width}
              height={dimensions.height}
              rendererConfig={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
              globeTileEngineUrl={tileUrl}
              animateIn={shouldAnimateIn}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className={`w-3 h-3 rounded-full shadow-lg shadow-red-500/50 ${labelColorIndicatorClass}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobePanel;