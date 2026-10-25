import { useEffect, useState } from 'react';
import { searchSimReady, type SimReadyAsset, type SimReadyShelf } from './search';

const PAGE = 40;
const DEBOUNCE_MS = 300;
const pages = new Map<string, SimReadyAsset[]>();

export interface SimReadySearch {
  results: SimReadyAsset[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  showMore: () => void;
  retry: () => void;
  searchNow: () => void;
}

function loadedPages(base: string, wanted: number): SimReadyAsset[][] {
  const out: SimReadyAsset[][] = [];

  for (let i = 0; i < wanted; i++) {
    const page = pages.get(`${base}|${i}`);

    if (!page) break;

    out.push(page);
  }

  return out;
}

function uniqueByUrl(list: SimReadyAsset[]): SimReadyAsset[] {
  const seen = new Set<string>();

  return list.filter((a) => !seen.has(a.url) && !!seen.add(a.url));
}

export function useSimReadySearch(query: string, shelf: SimReadyShelf, enabled = true): SimReadySearch {
  const q = query.trim();
  const [debounced, setDebounced] = useState(q);
  const [paging, setPaging] = useState({ base: '', wanted: 1 });
  const [attempt, setAttempt] = useState(0);
  const [, setLoadedAt] = useState(0);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const base = `${shelf}|${debounced}`;
  const wanted = paging.base === base ? paging.wanted : 1;
  const loaded = loadedPages(base, wanted);
  const next = loaded.length < wanted ? loaded.length : null;
  const nextKey = next === null ? null : `${base}|${next}`;
  const error = failure && failure.key === nextKey ? failure.message : null;

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), q ? DEBOUNCE_MS : 0);

    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!enabled || next === null || !nextKey || pages.has(nextKey)) return;

    const ctrl = new AbortController();

    searchSimReady({ query: debounced, shelf, limit: PAGE, offset: next * PAGE, signal: ctrl.signal })
      .then((results) => {
        pages.set(nextKey, results);
        setLoadedAt(Date.now());
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setFailure({ key: nextKey, message: 'Couldn’t reach SimReady Central.' });
      });

    return () => ctrl.abort();
  }, [enabled, next, nextKey, debounced, shelf, attempt]);

  const last = loaded[loaded.length - 1];

  return {
    results: uniqueByUrl(loaded.flat()),
    loading: enabled && next !== null && !error,
    error,
    hasMore: next === null && !!last && last.length >= PAGE,
    showMore: () => setPaging({ base, wanted: loaded.length + 1 }),
    searchNow: () => setDebounced(q),
    retry: () => {
      setFailure(null);
      setAttempt((n) => n + 1);
    },
  };
}
