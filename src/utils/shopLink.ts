export const AMAZON_HOST = /^(?:www\.)?amazon\.com$/i;

const AMAZON_SEARCH_PATH = /^\/s(?:\/|$)/;

export type ShopLinkKind = 'product' | 'search' | 'none';

function amazonPath(url: string | undefined) {
  if (!url || !URL.canParse(url)) return null;

  const parsed = new URL(url);

  return AMAZON_HOST.test(parsed.hostname) ? parsed.pathname : null;
}

export function shopLinkLabel(kind: ShopLinkKind, url?: string) {
  const path = amazonPath(url);

  if (kind === 'search' || AMAZON_SEARCH_PATH.test(path ?? '')) return 'Find on Amazon';

  return path === null ? 'Open Listing' : 'Buy on Amazon';
}
