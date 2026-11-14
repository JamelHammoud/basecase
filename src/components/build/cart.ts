import { parseAsin } from '../../utils/bom';
import type { BomLine } from '../../utils/bomTypes';

export interface CartItem {
  key: string;
  asin: string;
  quantity: number;
}

export interface StoreLink {
  key: string;
  name: string;
  url: string;
}

export interface StoreCart {
  store: string;
  links: StoreLink[];
}

export interface Cart {
  amazonUrl?: string;
  items: CartItem[];
  stores: StoreCart[];
  unlinked: BomLine[];
}

const AMAZON_CART = 'https://www.amazon.com/gp/aws/cart/add.html';
const AMAZON_HOST = /^(?:www\.)?amazon\.com$/i;
const GRAMS_PER_SPOOL = 1000;

function httpsUrl(url: string | undefined): URL | null {
  if (!url || !URL.canParse(url)) return null;

  const parsed = new URL(url);

  return parsed.protocol === 'https:' ? parsed : null;
}

function amazonCandidate(line: BomLine): string | undefined {
  if (line.record?.asin) return `https://www.amazon.com/dp/${line.record.asin}`;

  return line.urlKind === 'product' ? line.url : undefined;
}

function asinOf(line: BomLine): string | null {
  const parsed = httpsUrl(amazonCandidate(line));

  return parsed && AMAZON_HOST.test(parsed.hostname) ? parseAsin(parsed.href) : null;
}

function packOf(line: BomLine, asin: string): number {
  if (line.record?.asin?.toUpperCase() === asin) return line.record.packQty;

  return line.unit === 'g' ? GRAMS_PER_SPOOL : 1;
}

const packsOf = (line: BomLine, asin: string) => Math.max(1, Math.ceil(line.toBuy / Math.max(1, packOf(line, asin))));

function storeUrlOf(line: BomLine): URL | null {
  const listing = line.urlKind === 'product' ? httpsUrl(line.url) : null;
  const url = listing ?? httpsUrl(line.estimate?.url);

  return url && !AMAZON_HOST.test(url.hostname) ? url : null;
}

const storeName = (url: URL) => url.hostname.replace(/^www\./i, '').toLowerCase();

function addItem(items: CartItem[], line: BomLine, asin: string) {
  const quantity = packsOf(line, asin);
  const same = items.find((item) => item.asin === asin);

  if (same) same.quantity += quantity;
  else items.push({ key: line.key, asin, quantity });
}

function addStoreLink(stores: StoreCart[], line: BomLine, url: URL) {
  const store = storeName(url);
  const link = { key: line.key, name: line.name, url: url.href };
  const same = stores.find((s) => s.store === store);

  if (same) same.links.push(link);
  else stores.push({ store, links: [link] });
}

export function amazonCartUrl(items: CartItem[]): string | undefined {
  if (!items.length) return undefined;

  const query = items.flatMap(({ asin, quantity }, i) => [`ASIN.${i + 1}=${asin}`, `Quantity.${i + 1}=${quantity}`]);

  return `${AMAZON_CART}?${query.join('&')}`;
}

export function bomCart(lines: BomLine[]): Cart {
  const items: CartItem[] = [];
  const stores: StoreCart[] = [];
  const unlinked: BomLine[] = [];

  for (const line of lines.filter((l) => l.toBuy > 0)) {
    const asin = asinOf(line);
    const storeUrl = asin ? null : storeUrlOf(line);

    if (asin) addItem(items, line, asin);
    else if (storeUrl) addStoreLink(stores, line, storeUrl);
    else unlinked.push(line);
  }

  return { amazonUrl: amazonCartUrl(items), items, stores, unlinked };
}
