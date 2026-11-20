import { supplierCsvRows } from './supplierCsvRows';
import type { SupplierOffer } from '../types/purchasing';
import { validOffer } from '../../electron/backend/offerValidation.mjs';

export const MAX_OFFER_ROWS = 500;
export const MAX_OFFER_BYTES = 1_048_576;
export const OFFER_COLUMNS = [
  'Manufacturer',
  'Manufacturer Part Number',
  'Supplier',
  'Supplier Part Number',
  'Ordering Unit',
  'Units per Order',
  'Quantity Breaks',
  'Available Orders',
  'Currency',
  'Destination',
  'Observed At',
  'Expires At',
  'Quoted Arrival Earliest',
  'Quoted Arrival Latest',
  'Source Reference',
];

const optional = (value: string) => value || undefined;
const optionalNumber = (value: string) => (value ? Number(value) : undefined);

export function offerFromCells(cells: string[], source: string, evidence: SupplierOffer['evidence']): SupplierOffer {
  const [
    manufacturer,
    mpn,
    supplier,
    supplierPartNumber,
    orderingUnit,
    per,
    breaks,
    available,
    currency,
    destination,
    observedAt,
    expiresAt,
    arrivalEarliest,
    arrivalLatest,
    reference,
  ] = cells.map((cell) => cell.trim());

  if (!/^\d+:(?:\d+(?:\.\d+)?)(?:\|\d+:(?:\d+(?:\.\d+)?))*$/.test(breaks))
    throw new Error('Use quantity breaks such as 1:12|10:10.');

  const offer: SupplierOffer = {
    id: crypto.randomUUID(),
    identity: { manufacturer, mpn, supplier, supplierPartNumber, orderingUnit, unitsPerOrder: optionalNumber(per) },
    breaks: breaks.split('|').map((pair) => {
      const [minOrders, price] = pair.split(':').map(Number);

      return { minOrders, price };
    }),
    availableOrders: optionalNumber(available),
    currency,
    destination,
    observedAt: optional(observedAt),
    expiresAt: optional(expiresAt),
    arrivalEarliest: optional(arrivalEarliest),
    arrivalLatest: optional(arrivalLatest),
    source: reference || source,
    evidence,
    ...(evidence === 'imported' && { importReference: source }),
  };

  if (!validOffer(offer)) throw new Error('Check offer quantities, currency and dates.');

  return offer;
}

export function importOffers(text: string, source: string): SupplierOffer[] {
  if (text.length > MAX_OFFER_BYTES || new TextEncoder().encode(text).byteLength > MAX_OFFER_BYTES)
    throw new Error('Use a CSV file under 1 MiB.');

  const [header, ...rows] = supplierCsvRows(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'));

  if (!header || header.join(',') !== OFFER_COLUMNS.join(',')) throw new Error('Use the supplier offer CSV columns.');

  if (!rows.length || rows.length > MAX_OFFER_ROWS) throw new Error('Use 1 to 500 offers.');

  return rows.map((cells, index) => {
    if (cells.length !== header.length) throw new Error('Check the CSV column count.');

    return offerFromCells(cells, `${source}:${index + 2}`, 'imported');
  });
}
