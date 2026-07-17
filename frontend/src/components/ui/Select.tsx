import {
  useState,
  useRef,
  useEffect,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  hint?: string;
  searchable?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
  required?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  label,
  error,
  hint,
  searchable = false,
  disabled = false,
  fullWidth = true,
  className,
  required = false,
}: SelectProps) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState('');
  const containerRef        = useRef<HTMLDivElement>(null);
  const searchRef           = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  const handleSelect = (opt: SelectOption) => {
    if (opt.disabled) return;
    onChange?.(opt.value);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    if (e.key === 'Enter' || e.key === ' ') { if (!open) setOpen(true); }
  };

  return (
    <div className={cn('relative flex flex-col gap-1.5', fullWidth && 'w-full')} ref={containerRef}>
      {label && (
        <label className="text-sm font-medium text-slate-700 font-body">
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        className={cn(
          'flex items-center justify-between gap-2 px-3 py-2.5',
          'bg-white/80 border rounded-xl text-sm font-body text-left',
          'transition-all duration-200 outline-none',
          error
            ? 'border-danger ring-1 ring-danger/20'
            : open
            ? 'border-ocean-500 shadow-input-focus'
            : 'border-border hover:border-ocean-400',
          disabled && 'opacity-50 cursor-not-allowed bg-slate-50',
          className,
        )}
      >
        <span className={cn('flex items-center gap-2', !selected && 'text-slate-400')}>
          {selected?.icon}
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          className={cn('flex-shrink-0 text-slate-400 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-1 w-full glass-lg overflow-hidden shadow-glass-lg"
            style={{ top: '100%' }}
            role="listbox"
          >
            {searchable && (
              <div className="p-2 border-b border-border">
                <div className="flex items-center gap-2 px-2">
                  <Search size={13} className="text-slate-400 flex-shrink-0" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="flex-1 py-1 bg-transparent text-sm font-body text-slate-800 placeholder:text-slate-400 outline-none"
                  />
                </div>
              </div>
            )}

            <div className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-400 font-body text-center">No results</p>
              ) : (
                filtered.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    disabled={opt.disabled}
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2',
                      'text-sm font-body text-left transition-colors duration-100',
                      opt.value === value
                        ? 'bg-ocean-50 text-ocean-700'
                        : 'text-slate-700 hover:bg-slate-50',
                      opt.disabled && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {opt.icon}
                      {opt.label}
                    </span>
                    {opt.value === value && (
                      <Check size={13} className="flex-shrink-0 text-ocean-600" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p role="alert" className="text-xs text-danger font-body">{error}</p>}
      {!error && hint && <p className="text-xs text-slate-400 font-body">{hint}</p>}
    </div>
  );
}
