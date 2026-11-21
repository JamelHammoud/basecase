export interface SupplierIdentity {
  supplier?: string;
  supplierPartNumber?: string;
  orderingUnit?: string;
  unitsPerOrder?: number;
  sourceUrl?: string;
}

export interface PurchaseIdentity extends SupplierIdentity {
  manufacturer?: string;
  mpn?: string;
}

export interface SupplierOffer {
  id: string;
  identity: PurchaseIdentity;
  breaks: Array<{ minOrders: number; price: number }>;
  availableOrders?: number;
  currency: string;
  destination: string;
  observedAt?: string;
  expiresAt?: string;
  arrivalEarliest?: string;
  arrivalLatest?: string;
  source: string;
  evidence: 'entered' | 'imported';
  importReference?: string;
}

export interface ConfirmedOffer {
  offer: SupplierOffer;
  matchedIdentity: string;
  unitsPerOrder: number;
}

export interface SupplierOffers {
  offers: ConfirmedOffer[];
  selectedId?: string;
}

export interface PurchasePlan {
  destination: string;
  requiredBy: string;
}

export interface PurchasingEvidence {
  supplierOffers?: SupplierOffers;
  purchasePlan?: PurchasePlan;
}
