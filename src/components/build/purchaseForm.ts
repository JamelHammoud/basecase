import type { PurchaseRecord } from '../../types/robotics';
import { type BomLine, localDate, parseAsin } from '../../utils/bom';
import { money } from './format';

export interface PurchaseForm {
  url: string;
  title: string;
  pack: number;
  price: string;
  note: string;
}

const defaultUrl = (line: BomLine) => (line.urlKind === 'product' ? (line.url ?? '') : '');

export function parsePrice(text: string): number | null {
  const digits = text.replace(/[^\d.]/g, '');

  if (!/\d/.test(digits) || digits.split('.').length > 2) return null;

  return Math.round(Number(digits) * 100) / 100;
}

export function formatPrice(text: string): string {
  const price = parsePrice(text);

  return price === null ? text : money(price);
}

export function initialPurchaseForm(line: BomLine): PurchaseForm {
  const r = line.record;

  return {
    url: r?.url ?? defaultUrl(line),
    title: r?.title ?? '',
    pack: r?.packQty ?? (line.unit === 'g' ? 1000 : 1),
    price: r ? money(r.priceUsd) : '',
    note: r?.note ?? '',
  };
}

const isLink = (url: string) => /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url);

export function linkError(url: string): string {
  const link = url.trim();

  return link && !isLink(link) ? 'Paste a full link, starting with https://.' : '';
}

export function canSave(form: Pick<PurchaseForm, 'url' | 'price'>): boolean {
  const price = parsePrice(form.price);

  return price !== null && price > 0 && !linkError(form.url);
}

function listingUrl(url: string): Pick<PurchaseRecord, 'url' | 'asin'> {
  const asin = parseAsin(url);

  if (asin) return { url: `https://www.amazon.com/dp/${asin}`, asin };

  return { url: url || undefined };
}

export function purchaseRecord(form: PurchaseForm, checkedAt = localDate()): PurchaseRecord {
  return {
    ...listingUrl(form.url.trim()),
    title: form.title.trim() || undefined,
    packQty: form.pack,
    priceUsd: parsePrice(form.price) ?? 0,
    checkedAt,
    note: form.note.trim() || undefined,
  };
}
