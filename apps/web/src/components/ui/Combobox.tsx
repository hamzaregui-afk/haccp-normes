/**
 * Combobox — champ de sélection avec recherche intégrée (autocomplete).
 *
 * Usage avec react-hook-form :
 *   <Controller name="templateId" control={control} rules={{ required: true }}
 *     render={({ field }) => (
 *       <Combobox label="Modèle" options={opts} value={field.value}
 *                 onChange={field.onChange} placeholder="Chercher…" />
 *     )}
 *   />
 */
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Texte secondaire affiché en gris sous le label */
  sublabel?: string;
}

interface ComboboxProps {
  options:      ComboboxOption[];
  value:        string;
  onChange:     (value: string) => void;
  label?:       string;
  placeholder?: string;
  required?:    boolean;
  disabled?:    boolean;
  loading?:     boolean;
  error?:       string;
  className?:   string;
}

export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder = 'Rechercher…',
  required,
  disabled,
  loading,
  error,
  className,
}: ComboboxProps) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const containerRef        = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);
  const listRef             = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(-1);

  // Label of currently selected value
  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  // Filtered options based on search query
  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : options;

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
        setActive(-1);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Scroll active option into view
  useEffect(() => {
    if (active >= 0 && listRef.current) {
      const item = listRef.current.children[active] as HTMLElement | undefined;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [active]);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActive(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const select = (opt: ComboboxOption) => {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
    setActive(-1);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((p) => Math.min(p + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((p) => Math.max(p - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (active >= 0 && filtered[active]) select(filtered[active]);
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        setActive(-1);
        break;
    }
  };

  return (
    <div className={cn('flex flex-col gap-1.5', className)} ref={containerRef}>
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}

      {/* Trigger button */}
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={openDropdown}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-brand-medium',
          'select-none transition-colors',
          open  ? 'border-brand-medium ring-2 ring-brand-medium/20' : 'border-surface-muted',
          error ? 'border-red-400 focus:ring-red-400' : '',
          disabled && 'cursor-not-allowed opacity-50 bg-gray-50',
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
        )}

        <span className={cn('flex-1 truncate', !selectedLabel && 'text-gray-400')}>
          {selectedLabel || placeholder}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          {value && !disabled && (
            <button
              type="button"
              onClick={clear}
              className="rounded p-0.5 text-gray-400 hover:text-gray-700"
              tabIndex={-1}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown
            className={cn('h-4 w-4 text-gray-400 transition-transform duration-150', open && 'rotate-180')}
          />
        </div>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="relative z-50">
          <div className="absolute left-0 right-0 top-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            {/* Search input */}
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Tapez pour filtrer…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
              {query && (
                <button type="button" onClick={() => { setQuery(''); setActive(-1); }}>
                  <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Options list */}
            <ul
              ref={listRef}
              role="listbox"
              className="max-h-64 overflow-y-auto py-1"
            >
              {loading ? (
                <li className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement…
                </li>
              ) : filtered.length === 0 ? (
                <li className="py-6 text-center text-sm text-gray-400">
                  Aucun résultat pour « {query} »
                </li>
              ) : (
                filtered.map((opt, idx) => (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={opt.value === value}
                    onClick={() => select(opt)}
                    onMouseEnter={() => setActive(idx)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors',
                      idx === active   ? 'bg-brand-lighter text-brand-dark' : 'hover:bg-gray-50',
                      opt.value === value && 'font-semibold',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm">{opt.label}</p>
                      {opt.sublabel && (
                        <p className="truncate text-xs text-gray-400">{opt.sublabel}</p>
                      )}
                    </div>
                    {opt.value === value && (
                      <Check className="h-4 w-4 shrink-0 text-brand-medium" />
                    )}
                  </li>
                ))
              )}
            </ul>

            {/* Count footer */}
            {!loading && filtered.length > 0 && (
              <div className="border-t border-gray-100 px-3 py-1.5 text-right text-xs text-gray-400">
                {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
