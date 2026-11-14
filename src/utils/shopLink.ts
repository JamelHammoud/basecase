export const AMAZON_HOST = /^(?:www\.)?amazon\.com$/i;

export type ShopLinkKind = 'product' | 'search' | 'none';

const onAmazon = (url: string | undefined) => !!url && URL.canParse(url) && AMAZON_HOST.test(new URL(url).hostname);

export function shopLinkLabel(kind: ShopLinkKind, url?: string) {
  if (kind === 'search') return 'Find on Amazon';

  return onAmazon(url) ? 'Buy on Amazon' : 'Open listing';
}
