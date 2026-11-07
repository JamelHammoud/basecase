import { publicFetch, readCapped } from '../publicFetch.mjs';

const MAX_PAGE = 3_000_000;
const STORES_WE_NEVER_FETCH = /(^|\.)amazon\.[a-z.]+$/i;
const TIMEOUT_MS = 20_000;

const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export const siteOf = (url) => hostOf(url).split('.').slice(-2).join('.');

export function assertHttps(url, label = 'The link') {
  if (!/^https:\/\//i.test(String(url))) throw new Error(`${label} must be an https address.`);
}

export function pageNamesPart(page, { mpn, name }) {
  const text = squash(page);
  const wanted = [mpn, name].map((w) => squash(w ?? '')).filter((w) => w.length >= 4);

  return wanted.some((w) => text.includes(w));
}

export async function checkProductLink({ url, mpn, name }, fetcher = publicFetch) {
  const checkedAt = new Date().toISOString();

  if (STORES_WE_NEVER_FETCH.test(hostOf(url)))
    return { status: 'store', checkedAt, note: 'Amazon link: confirm it with Add Price, or link the maker' };

  try {
    const res = await fetcher(url, {
      headers: { 'user-agent': 'Basecase link check', accept: 'text/html,*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return { status: 'unconfirmed', checkedAt, note: `the page returned ${res.status}` };

    const page = (await readCapped(res, MAX_PAGE, 'The page')).toString('utf8');

    return pageNamesPart(page, { mpn, name })
      ? { status: 'confirmed', checkedAt }
      : { status: 'unconfirmed', checkedAt, note: `the page doesn't mention ${mpn || name}` };
  } catch (err) {
    return { status: 'unconfirmed', checkedAt, note: String(err?.message ?? err).slice(0, 120) };
  }
}
