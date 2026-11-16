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
