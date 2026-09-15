'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { navFor, type OrgKind } from '@/lib/nav';

function matchScore(needle: string, haystack: string): number {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (h === n) return 0;
  if (h.startsWith(n)) return 1;
  if (h.includes(n)) return 2;
  const score = Math.min(n.length, h.length);
  for (let i = 0; i < n.length; i += 1) {
    if (!h.includes(n.charAt(i))) return -1;
  }
  return score + 10;
}

export function CommandPalette({ orgKind }: { orgKind: OrgKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => navFor(orgKind), [orgKind]);

  const results = useMemo(() => {
    const needle = query.trim();
    if (!needle) return items.map((i, index) => ({ ...i, index }));
    return items
      .map((item, index) => ({ item, index, score: matchScore(needle, `${item.label} ${item.cardLabel} ${item.shortLabel}`) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => a.score - b.score || a.index - b.index)
      .map(({ item, index }) => ({ ...item, index }));
  }, [items, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
      }
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        title="Press ⌘K to jump between sections"
        className="flex w-full items-center gap-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/55 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
      >
        <Search size={14} aria-hidden="true" />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd className="rounded border border-white/20 px-1.5 font-mono text-[10px] text-white/50">⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-2 border-b border-ink/8 px-4">
          <Search size={16} className="shrink-0 text-muted" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sections…"
            aria-label="Search sections"
            className="h-12 w-full bg-transparent text-sm text-ink placeholder:text-muted/70 focus:outline-none"
          />
          <kbd className="rounded border border-ink/15 px-1.5 font-mono text-[10px] text-muted">esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto py-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">No sections match “{query}”.</li>
          ) : (
            results.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => router.push(href)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink hover:bg-lavender"
                  >
                    <Icon size={16} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="flex-1">{label}</span>
                    {active ? <span className="text-xs font-medium text-primary">Current</span> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}