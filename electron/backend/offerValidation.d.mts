import type { PurchasingEvidence, SupplierOffer } from '../../src/types/purchasing';

export function validOffer(value: unknown): value is SupplierOffer;
export function checkedPurchasingEvidence(record: unknown): PurchasingEvidence;
