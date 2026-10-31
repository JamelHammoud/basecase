import type { PurchaseRecord } from '../../types/robotics';
import { type BomLine, localDate, parseAsin } from '../../utils/bom';
import { type Money, USD_MONEY } from '../../utils/currency';

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

export function formatPrice(text: string, money: Money = USD_MONEY): string {
  const price = parsePrice(text);

  return price === null ? text : money.formatAmount(price);
}

const shownPrice = (r: PurchaseRecord, money: Money) =>
  money.formatAmount(Math.round(money.amountOf(r.priceUsd, r.entered) * 100) / 100);

export function initialPurchaseForm(line: BomLine, money: Money = USD_MONEY): PurchaseForm {
  const r = line.record;

  return {
    url: r?.url ?? defaultUrl(line),
    title: r?.title ?? '',
    pack: r?.packQty ?? (line.unit === 'g' ? 1000 : 1),
    price: r ? shownPrice(r, money) : '',
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

export function purchaseRecord(form: PurchaseForm, money: Money = USD_MONEY, checkedAt = localDate()): PurchaseRecord {
  const { usd, entered } = money.enter(parsePrice(form.price) ?? 0);

  return {
    ...listingUrl(form.url.trim()),
    title: form.title.trim() || undefined,
    packQty: form.pack,
    priceUsd: usd,
    ...(entered && { entered }),
    checkedAt,
    note: form.note.trim() || undefined,
  };
}
