import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// Unmount fallback in case animationend never fires; the close animation itself
// (index.css) is 120ms
const CLOSE_FALLBACK_MS = 300;

export interface SelectOption {
  value: string;
  label: string;
  detail?: string;
}

export interface SelectGroup {
  label?: string;
  options: SelectOption[];
}

interface SelectProps {
  value: string;
  groups: SelectGroup[];
  onChange: (value: string) => void;
  ariaLabel?: string;
}

// Select-only combobox (WAI-ARIA pattern): focus stays on the trigger and the
// highlighted option is tracked with aria-activedescendant
const Select: React.FC<SelectProps> = ({ value, groups, onChange, ariaLabel }) => {
  const id = useId();
  const options = groups.flatMap(group => group.options);
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = options[selectedIndex];

  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  if (isOpen && !isMounted) setIsMounted(true);
  const isClosing = isMounted && !isOpen;

  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isClosing) return;
    const timer = setTimeout(() => setIsMounted(false), CLOSE_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [isClosing]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, activeIndex]);

  const open = () => {
    setActiveIndex(Math.max(selectedIndex, 0));
    setIsOpen(true);
  };

  const commit = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    setIsOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex(i => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        commit(activeIndex);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  const handleMenuAnimationEnd = (event: React.AnimationEvent<HTMLDivElement>) => {
    if (isClosing && event.target === event.currentTarget) setIsMounted(false);
  };

  let optionIndex = 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleKeyDown}
        className={`group w-full flex items-center gap-3 text-left text-sm rounded-xl border px-3.5 py-2.5 transition-[background-color,border-color,box-shadow] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
          isOpen
            ? 'bg-neutral-900/80 border-neutral-500 shadow-[0_0_0_4px_rgba(255,255,255,0.03)]'
            : 'bg-neutral-900/50 border-neutral-700 hover:border-neutral-500 hover:bg-neutral-900/70'
        }`}
      >
        <span className="flex-1 min-w-0 truncate text-neutral-100">{selected?.label ?? 'Select…'}</span>
        {selected?.detail && (
          <span className="text-xs text-neutral-500 tabular-nums shrink-0">{selected.detail}</span>
        )}
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition-transform duration-200 ease-out group-hover:text-neutral-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isMounted && (
        <div
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-label={ariaLabel}
          onMouseDown={e => e.preventDefault()}
          onAnimationEnd={handleMenuAnimationEnd}
          className={`absolute left-0 right-0 top-full mt-2 z-20 max-h-[min(20rem,55vh)] overflow-y-auto overscroll-contain rounded-xl border border-neutral-700/80 bg-neutral-900/95 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-black/20 ${
            isClosing ? 'pointer-events-none select-menu-out' : 'select-menu-in'
          }`}
        >
          {groups.map((group, groupIndex) => (
            <div
              key={group.label ?? groupIndex}
              role="group"
              aria-label={group.label}
              className={groupIndex > 0 ? 'mt-1.5 pt-1.5 border-t border-neutral-800' : ''}
            >
              {group.label && (
                <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                  {group.label}
                </div>
              )}
              {group.options.map(option => {
                const index = optionIndex++;
                const isSelected = option.value === value;
                const isActive = index === activeIndex;
                return (
                  <div
                    key={option.value}
                    id={`${id}-option-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onPointerMove={() => setActiveIndex(index)}
                    onClick={() => commit(index)}
                    className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm cursor-pointer transition-colors duration-100 ${
                      isActive ? 'bg-neutral-700/60 text-white' : isSelected ? 'text-white' : 'text-neutral-300'
                    }`}
                  >
                    <span className="flex-1 min-w-0 truncate">{option.label}</span>
                    {option.detail && (
                      <span className="text-xs text-neutral-500 tabular-nums shrink-0">{option.detail}</span>
                    )}
                    <Check
                      size={15}
                      className={`shrink-0 text-blue-400 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0'}`}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Select;
