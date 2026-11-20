import { useState } from 'react';
import type { BomLine } from '../../utils/bomTypes';
import type { PurchaseRecord, Purchases, StoredPurchase } from '../../types/robotics';
import { withPrice } from '../../utils/onHand';

export function usePurchaseSheet(
  purchases: Purchases,
  savePurchase: (key: string, record: StoredPurchase | null) => Promise<void>,
) {
  const [checking, setChecking] = useState<BomLine | null>(null);
  const savePrice = async (line: BomLine, record: PurchaseRecord | null) => {
    await savePurchase(line.key, withPrice(purchases[line.key], record));
    setChecking(null);
  };

  return { checking, setChecking, savePrice };
}
