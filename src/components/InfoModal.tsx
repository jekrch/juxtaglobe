import React, { useEffect, useRef, useState } from 'react';
import { X, Info } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import type { PrehistoricMapOption } from '../types';
import Select, { type SelectGroup } from './Select';

// Unmount fallback in case animationend never fires (e.g. a background tab); the
// close animation itself (index.css) is 180ms
const CLOSE_FALLBACK_MS = 400;

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  secondaryGlobeMode: 'antipodal' | 'prehistoric_same_point' | 'dual-point';
  selectedPrehistoricMap: PrehistoricMapOption | null;
  prehistoricMapOptions: PrehistoricMapOption[];
  onSecondaryGlobeOptionChange: (value: string) => void;
  onAttributionClick: (text: string, event: React.MouseEvent) => void;
  showMapTiles: boolean;
  onMapTilesToggle: (checked: boolean) => void;
}

const InfoModal: React.FC<InfoModalProps> = ({
  isOpen,
  onClose,
  secondaryGlobeMode,
  selectedPrehistoricMap,
  prehistoricMapOptions,
  onSecondaryGlobeOptionChange,
  onAttributionClick,
  showMapTiles,
  onMapTilesToggle,
}) => {
  // Stay mounted through the close animation, then unmount
  const [isMounted, setIsMounted] = useState(isOpen);
  if (isOpen && !isMounted) setIsMounted(true);
  const isClosing = isMounted && !isOpen;

  useEffect(() => {
    if (!isClosing) return;
    const timer = setTimeout(() => setIsMounted(false), CLOSE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [isClosing]);

  const handleBackdropAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (isClosing && event.target === event.currentTarget) setIsMounted(false);
  };

  // Close only when the press both starts and ends on the backdrop, so a drag that
  // starts inside the panel (e.g. selecting text) doesn't close it
  const pressStartedOnBackdrop = useRef(false);
  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressStartedOnBackdrop.current = event.target === event.currentTarget;
  };
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (pressStartedOnBackdrop.current && event.target === event.currentTarget) onClose();
    pressStartedOnBackdrop.current = false;
  };

  if (!isMounted) return null;

  const currentYear = new Date().getFullYear();

  const getSelectValue = () => {
    switch (secondaryGlobeMode) {
      case 'antipodal':
        return 'antipodal';
      case 'dual-point':
        return 'dual-point';
      case 'prehistoric_same_point':
        return selectedPrehistoricMap?.url || '';
      default:
        return '';
    }
  };

  const selectGroups: SelectGroup[] = [
    {
      label: 'Modern Earth',
      options: [
        { value: 'antipodal', label: 'Antipodal View' },
        { value: 'dual-point', label: 'Dual Point View' },
      ],
    },
    {
      label: 'Prehistoric Earth',
      // "Early Jurassic (~200 Ma)" -> label "Early Jurassic", detail "~200 Ma"
      options: prehistoricMapOptions.map(map => {
        const match = map.name.match(/^(.*?)\s*\((.+)\)$/);
        return { value: map.url, label: match?.[1] ?? map.name, detail: match?.[2] };
      }),
    },
  ];

  const getDescriptionText = () => {
    switch (secondaryGlobeMode) {
        case 'antipodal': return "Shows the point directly opposite the primary globe's center.";
        case 'dual-point': return "Set two independent points and rotate them in sync.";
        case 'prehistoric_same_point': return "Shows the same central point as the primary globe, but on an ancient Earth map.";
        default: return '';
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-lg ${
        isClosing ? 'pointer-events-none modal-backdrop-out' : 'modal-backdrop-in'
      }`}
      onAnimationEnd={handleBackdropAnimationEnd}
      onPointerDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-neutral-800/70 backdrop-blur-xl rounded-2xl p-7 max-w-md w-full border border-neutral-700 shadow-2xl ${
          isClosing ? 'modal-panel-out' : 'modal-panel-in'
        }`}
      >
        <div className="flex justify-between items-start mb-5">
          <h2 className="text-xl font-medium text-neutral-100">Options & Info</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 transition-colors p-1 -mr-1 -mt-1 rounded-md hover:bg-neutral-700/50">
            <X size={20} />
          </button>
        </div>
        <div className="mb-6 space-y-3">
          <h3 className="text-neutral-100 font-semibold">Secondary Globe Display</h3>
          <Select
            value={getSelectValue()}
            groups={selectGroups}
            onChange={onSecondaryGlobeOptionChange}
            ariaLabel="Secondary globe display"
          />
          <p className="text-xs text-neutral-500">
            {getDescriptionText()}
          </p>
          {secondaryGlobeMode === 'prehistoric_same_point' && selectedPrehistoricMap && (
            <div className="text-xs text-neutral-500 mt-2 space-y-1">
              <div className="flex items-center gap-1">
                <button onClick={(e) => onAttributionClick(selectedPrehistoricMap.attribution, e)} className="cursor-pointer underline decoration-dotted decoration-neutral-400 hover:decoration-neutral-300 text-neutral-300 hover:text-neutral-100 flex items-center bg-transparent border-none p-0 text-xs">
                  <Info size={13} className="inline mr-1 flex-shrink-0" /> CC Attribution
                </button>
              </div>
              <p className="mt-1">Note: Prehistoric map accuracy varies. Locations are overlaid on ancient continental arrangements.</p>
            </div>
          )}
        </div>

        <div className="mb-4">
          <h3 className="text-neutral-100 font-semibold mb-2">Map Overlay</h3>
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={showMapTiles}
              onChange={(e) => onMapTilesToggle(e.target.checked)}
              className="w-4 h-4 rounded border-neutral-600 bg-neutral-700/60 text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 focus:ring-offset-neutral-800"
            />
            <div className="flex-1">
              <span className="text-sm text-neutral-100 group-hover:text-white transition-colors">
                Show street map overlay
              </span>
              <p className="text-xs text-neutral-500 mt-0.5">
                Displays OpenStreetMap data on modern Earth-based globes
              </p>
            </div>
          </label>
          <p className="text-xs text-neutral-500 mt-3">
            Zoomed-in satellite imagery: Esri, Maxar, Earthstar Geographics, and the GIS User Community
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-neutral-700/70 flex justify-between items-center text-xs -mb-2">
          <p className="text-neutral-500">
            © {currentYear}{' '}
            <a
              href="https://jacobkrch.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-neutral-200 transition-colors hover:underline ml-1"
            >
              Jacob Krch
            </a>
          </p>
          <a
            href="https://github.com/jekrch/juxtaglobe"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View source code on GitHub"
            className="text-neutral-500 hover:text-neutral-200 transition-colors -mb-4 -mt-4"
          >
            <FaGithub size={24} />
          </a>
        </div>
      </div>
    </div>
  );
};

export default InfoModal;