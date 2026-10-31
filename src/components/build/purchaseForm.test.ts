import { describe, expect, it } from 'vitest';
import type { BomLine } from '../../utils/bom';
import { createMoney } from '../../utils/currency';
import { canSave, formatPrice, initialPurchaseForm, linkError, parsePrice, purchaseRecord } from './purchaseForm';

const line = (o: Partial<BomLine> = {}): BomLine => ({
  key: 'component:pi5',
  category: 'Components',
  name: 'Raspberry Pi 5',
  detail: '',
  qty: 1,
  unit: 'pcs',
  partIds: [],
  urlKind: 'none',
  status: 'unchecked',
  ...o,
});

describe('purchase form', () => {
  it('starts from the product link, or blank for a search link', () => {
    expect(initialPurchaseForm(line({ url: 'https://www.amazon.com/dp/B0CK2FCG1K', urlKind: 'product' }))).toEqual({
      url: 'https://www.amazon.com/dp/B0CK2FCG1K',
      title: '',
      pack: 1,
      price: '',
      note: '',
    });
    expect(initialPurchaseForm(line({ url: 'https://www.amazon.com/s?k=pi', urlKind: 'search' })).url).toBe('');
    expect(initialPurchaseForm(line({ unit: 'g', qty: 400 })).pack).toBe(1000);
  });

  it('starts from a saved record', () => {
    const record = { url: 'https://www.amazon.com/dp/B000000001', packQty: 2, priceUsd: 1209.5, checkedAt: '2026-01-02' };

    expect(initialPurchaseForm(line({ record, urlKind: 'product', url: 'x' }))).toMatchObject({
      url: record.url,
      pack: 2,
      price: '$1,209.50',
    });
  });

  it('reads prices the way people type them', () => {
    expect(parsePrice('$420.32')).toBeCloseTo(420.32);
    expect(parsePrice('420.3')).toBeCloseTo(420.3);
    expect(parsePrice(' $1,200 ')).toBe(1200);
    expect(parsePrice('12.999')).toBe(13);
    expect(parsePrice('abc')).toBeNull();
    expect(parsePrice('1.2.3')).toBeNull();
    expect(formatPrice('420.3')).toBe('$420.30');
    expect(formatPrice('1200')).toBe('$1,200.00');
    expect(formatPrice('abc')).toBe('abc');
  });

  it('needs only a price; a link is optional but must be a link', () => {
    expect(canSave({ url: '', price: '' })).toBe(false);
    expect(canSave({ url: '', price: 'x' })).toBe(false);
    expect(canSave({ url: '', price: '$0' })).toBe(false);
    expect(canSave({ url: '  ', price: '$5' })).toBe(true);
    expect(canSave({ url: 'amazon', price: '5' })).toBe(false);
    expect(linkError('amazon')).toBe('Paste a full link, starting with https://.');
    expect(linkError('https://www.digikey.com/en/products/detail/x')).toBe('');
  });

  it('saves just the price', () => {
    expect(purchaseRecord({ url: ' ', title: '', pack: 1, price: '$420.32', note: '' }, undefined, '2026-10-19')).toEqual({
      url: undefined,
      title: undefined,
      packQty: 1,
      priceUsd: 420.32,
      checkedAt: '2026-10-19',
      note: undefined,
    });
  });

  it('saves a canonical Amazon listing with a rounded price', () => {
    const form = {
      url: 'https://www.amazon.com/Pi/dp/b0ck2fcg1k/ref=sr_1',
      title: '  Pi 5 8GB ',
      pack: 2,
      price: '80.456',
      note: ' ',
    };

    expect(purchaseRecord(form, undefined, '2026-10-18')).toEqual({
      url: 'https://www.amazon.com/dp/B0CK2FCG1K',
      asin: 'B0CK2FCG1K',
      title: 'Pi 5 8GB',
      packQty: 2,
      priceUsd: 80.46,
      checkedAt: '2026-10-18',
      note: undefined,
    });
  });

  it('saves a price typed in another currency with its dollar value', () => {
    const eur = createMoney('EUR', { date: '2026-10-30', perUsd: { USD: 1, EUR: 0.8 } });
    const form = { url: '', title: '', pack: 1, price: '€40', note: '' };
    const record = purchaseRecord(form, eur, '2026-10-30');

    expect(record).toMatchObject({ priceUsd: 50, entered: { amount: 40, currency: 'EUR' } });
    expect(formatPrice('1200', eur)).toBe('€1,200.00');
    expect(initialPurchaseForm(line({ record }), eur).price).toBe('€40.00');
    expect(initialPurchaseForm(line({ record })).price).toBe('$50.00');
  });
});
