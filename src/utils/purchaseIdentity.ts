import { COMPONENT_BY_ID, componentVariant } from '../data/components';
import { sourcedItem } from '../data/sourcedItems';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { PurchaseIdentity } from '../types/purchasing';
import type { PurchaseRecord } from '../types/robotics';

export function catalogIdentity(key: string): PurchaseIdentity | undefined {
  const [kind, item] = key.split(':');
  const [id, variant] = (item ?? '').split('|');
  const sourced = sourcedItem(id);

  if (sourced)
    return { manufacturer: sourced.maker, mpn: sourced.mpn, sourceUrl: sourced.url, ...sourced.supplierIdentity };

  if (kind === 'supply') return SUPPLY_BY_ID[id]?.identity;

  if (kind !== 'component') return undefined;

  return componentIdentity(id, variant);
}

function componentIdentity(id: string, variant: string | undefined): PurchaseIdentity | undefined {
  const component = COMPONENT_BY_ID[id];

  if (!component) return undefined;

  const version = componentVariant(component, variant);

  if (variant && !version) return undefined;

  const supplier = version ? version.supplierIdentity : component.supplierIdentity;

  const mpn = version?.mpn ?? component.mpn;
  const exactMpn = /^[\p{L}\p{N}._+-]+$/u.test(mpn) && (!component.variants?.length || !!version);

  return {
    manufacturer: component.manufacturer,
    mpn: exactMpn ? mpn : undefined,
    sourceUrl: component.links.product ?? component.links.datasheet,
    ...supplier,
  };
}

export function lineIdentity(key: string, record: PurchaseRecord | undefined): PurchaseIdentity | undefined {
  if (record?.identity) return record.identity;

  const catalog = catalogIdentity(key);

  if (!record?.url) return catalog;

  const amazon = savedAmazonIdentity(record);

  return { manufacturer: catalog?.manufacturer, mpn: catalog?.mpn, ...amazon };
}

export function supplierOrderQty(remaining: number, identity: PurchaseIdentity | undefined): number | undefined {
  const per = identity?.unitsPerOrder;

  if (
    !identity?.supplier?.trim() ||
    !identity.supplierPartNumber?.trim() ||
    !identity.orderingUnit?.trim() ||
    !per ||
    !Number.isFinite(per) ||
    per <= 0
  )
    return undefined;

  const quantity = Math.ceil(remaining / per);

  return Number.isSafeInteger(quantity) ? quantity : undefined;
}

function savedAmazonIdentity(record: PurchaseRecord): PurchaseIdentity | undefined {
  if (!record.url || !record.asin || !/^[A-Z0-9]{10}$/.test(record.asin)) return undefined;

  try {
    const url = new URL(record.url);
    const match = /^\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i.exec(url.pathname);

    if (
      url.protocol !== 'https:' ||
      !['amazon.com', 'www.amazon.com'].includes(url.hostname) ||
      match?.[1].toUpperCase() !== record.asin
    )
      return undefined;

    return {
      supplier: 'Amazon',
      supplierPartNumber: record.asin,
      orderingUnit: 'pack',
      unitsPerOrder: record.packQty,
      sourceUrl: record.url,
    };
  } catch {
    return undefined;
  }
}
