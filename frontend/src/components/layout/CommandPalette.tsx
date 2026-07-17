/**
 * Command palette — ⌘K / Ctrl-K anywhere in the app. Fuzzy-jump to any page plus
 * a few quick actions. Keyboard-first (↑ ↓ to move, ↵ to run, Esc to close), and
 * dressed in the same ocean/teal system as the rest of the shell.
 *
 * Opens on the keyboard shortcut or a window 'open-command-palette' event (fired
 * by the header search button), so the trigger and the palette stay decoupled.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, CornerDownLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { NAV_SECTIONS } from '@/config/nav';
import { cn } from '@/lib/utils';

interface Command {
  id: string;
  label: string;
  section: string;
  to: string;
  icon: typeof Search;
  keywords: string;
}

const RECENT_KEY = 'mpt-recent-cmds';
function readRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; }
}
function pushRecent(id: string) {
  try {
    const next = [id, ...readRecent().filter((x) => x !== id)].slice(0, 4);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* storage disabled — recents just won't persist */ }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

  const commands = useMemo<Command[]>(() =>
    NAV_SECTIONS.flatMap((s) =>
      s.items
        .filter((i) => !i.adminOnly || role === 'ADMIN')
        .map((i) => ({
          id: i.to, label: i.label, section: s.title, to: i.to, icon: i.icon,
          keywords: `${i.label} ${s.title} ${i.keywords ?? ''}`.toLowerCase(),
        })),
    ), [role]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return commands.filter((c) => q.split(/\s+/).every((t) => c.keywords.includes(t)));
    // Empty query: recently-used first, then the rest.
    const rec = recent.map((id) => commands.find((c) => c.id === id)).filter(Boolean) as Command[];
    const rest = commands.filter((c) => !recent.includes(c.id));
    return [...rec, ...rest];
  }, [query, commands, recent]);
  const recentCount = query.trim() ? 0 : Math.min(recent.length, results.length);

  // Global open shortcut + custom event from the header trigger.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setRecent(readRecent());
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => { setActive(0); }, [query]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    pushRecent(c.id);
    setOpen(false);
    navigate(c.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }} transition={{ duration: 0.16 }}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/70 bg-white shadow-glass"
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b border-border/70 px-4">
              <Search size={18} className="text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Jump to…"
                className="w-full bg-transparent py-4 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                aria-label="Search pages and actions"
              />
              <kbd className="hidden rounded-md border border-border bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:block">Esc</kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 && (
                <div className="px-3 py-8 text-center text-sm text-slate-400">No matches for “{query}”.</div>
              )}
              {results.map((c, i) => {
                const Icon = c.icon;
                const showLabel = !query.trim() && (i === 0 || i === recentCount);
                const labelText = i === 0 && recentCount > 0 ? 'Recent' : (i === recentCount ? 'Go to' : null);
                return (
                  <div key={c.id}>
                  {showLabel && labelText && (
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{labelText}</p>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(c)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                      i === active ? 'bg-ocean-600 text-white' : 'text-slate-700 hover:bg-ocean-50',
                    )}
                  >
                    <Icon size={16} className={i === active ? 'text-white' : 'text-ocean-500'} />
                    <span className="flex-1 font-medium">{c.label}</span>
                    <span className={cn('text-[11px]', i === active ? 'text-white/70' : 'text-slate-400')}>{c.section}</span>
                    {i === active && <CornerDownLeft size={13} className="text-white/80" />}
                  </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
