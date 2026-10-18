import type { PurchaseRecord } from '../../types/robotics';
import { type BomLine, localDate, parseAsin } from '../../utils/bom';

export interface PurchaseForm {
  url: string;
  title: string;
  pack: number;
  price: number;
  note: string;
}

const defaultUrl = (line: BomLine) => (line.urlKind === 'product' ? (line.url ?? '') : '');

export function initialPurchaseForm(line: BomLine): PurchaseForm {
  const r = line.record;

  return {
    url: r?.url ?? defaultUrl(line),
    title: r?.title ?? '',
    pack: r?.packQty ?? (line.unit === 'g' ? 1000 : 1),
    price: r?.priceUsd ?? 0,
    note: r?.note ?? '',
  };
}

export function purchaseFormError(form: Pick<PurchaseForm, 'url' | 'price'>): string {
  if (!form.url.trim()) return 'Paste the listing link.';

  if (!parseAsin(form.url)) return 'Use an amazon.com product link (…/dp/B0…).';

  if (form.price <= 0) return 'Enter the price you saw.';

  return '';
}

export function purchaseRecord(form: PurchaseForm, checkedAt = localDate()): PurchaseRecord {
  const asin = parseAsin(form.url)!;

  return {
    url: `https://www.amazon.com/dp/${asin}`,
    asin,
    title: form.title.trim() || undefined,
    packQty: form.pack,
    priceUsd: Math.round(form.price * 100) / 100,
    checkedAt,
    note: form.note.trim() || undefined,
  };
}
