import { importOffersAsync } from '../../utils/supplierOfferImport';
import { useEffect, useRef, useState } from 'react';
import type { Bom } from '../../utils/bomTypes';
import type { PurchasePlan, SupplierOffer } from '../../types/purchasing';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { comparePurchasing, confirmOffer } from '../../utils/supplierOffers';
import { MAX_OFFER_BYTES } from '../../utils/supplierOfferCsv';

export interface OfferSheetInputs {
  bom: Bom;
  purchases: Purchases;
  scene: string;
  save: (key: string, record: StoredPurchase | null) => Promise<void>;
}

export function useSupplierOffers({ bom, purchases, scene, save }: OfferSheetInputs) {
  const importing = useRef<AbortController | null>(null);

  useEffect(() => () => importing.current?.abort(), []);

  const planKey = `purchase-plan:${scene}`;
  const [draftPlan, setPlan] = useState<PurchasePlan | null>(null);
  const plan = draftPlan ?? purchases[planKey]?.purchasePlan ?? { destination: '', requiredBy: '' };
  const [drafts, setDrafts] = useState<SupplierOffer[]>([]);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState('');
  const result = comparePurchasing({ bom, purchases, plan });
  const attempt = async (action: () => Promise<void>) => {
    try {
      await action();
      setError('');
    } catch (cause) {
      if ((cause as Error).name !== 'AbortError') setError((cause as Error).message);
    }
  };
  const imported = async (file: File | undefined) => {
    if (!file) return;

    await attempt(async () => {
      if (file.size > MAX_OFFER_BYTES) throw new Error('Use a CSV file under 1 MiB.');

      importing.current?.abort();

      const controller = new AbortController();

      importing.current = controller;
      setDrafts(await importOffersAsync(await file.text(), file.name, controller.signal));
    });
  };
  const confirm = async (offer: SupplierOffer, key: string, per: number) => {
    await attempt(async () => {
      const line = bom.lines.find((item) => item.key === key)!;
      const current = purchases[key];
      const book = current?.supplierOffers ?? { offers: [] };

      await save(key, {
        ...current,
        supplierOffers: {
          ...book,
          offers: [...book.offers.filter((entry) => entry.offer.id !== offer.id), confirmOffer(offer, line, per)],
        },
      });
      setDrafts((items) => items.filter((item) => item.id !== offer.id));
    });
  };

  return {
    planKey,
    plan,
    setPlan,
    drafts,
    setDrafts,
    entering,
    setEntering,
    error,
    result,
    attempt,
    imported,
    confirm,
  };
}
