import { importOffersAsync } from '../../utils/supplierOfferImport';
import { useEffect, useRef, useState } from 'react';
import type { Bom, BomLine } from '../../utils/bomTypes';
import type { ConfirmedOffer, PurchasePlan, SupplierOffer } from '../../types/purchasing';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { comparePurchasing, confirmOffer } from '../../utils/supplierOffers';
import { MAX_OFFER_BYTES } from '../../utils/supplierOfferCsv';
import { errorMessage } from '../../utils/errorMessage';

interface OfferDraft {
  offer: SupplierOffer;
  key?: string;
  unitsPerOrder?: number;
}

export interface OfferSheetInputs {
  bom: Bom;
  purchases: Purchases;
  scene: string;
  save: (key: string, record: StoredPurchase | null) => Promise<void>;
}

export function useSupplierOffers({ bom, purchases, scene, save }: OfferSheetInputs) {
  const importing = useRef<AbortController | null>(null);
  const writing = useRef(false);

  useEffect(() => () => importing.current?.abort(), []);

  const planKey = `purchase-plan:${scene}`;
  const [draftPlan, setPlan] = useState<PurchasePlan | null>(null);
  const plan = draftPlan ?? purchases[planKey]?.purchasePlan ?? { destination: '', requiredBy: '' };
  const [drafts, setDrafts] = useState<OfferDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState('');
  const result = comparePurchasing({ bom, purchases, plan });
  const attempt = async (action: () => Promise<void>) => {
    if (writing.current) return;

    writing.current = true;
    setSaving(true);

    try {
      await action();
      setError('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };
  const imported = async (file: File | undefined) => {
    if (!file) return;

    importing.current?.abort();

    const controller = new AbortController();

    importing.current = controller;

    try {
      if (file.size > MAX_OFFER_BYTES) throw new Error('Use a CSV file under 1 MiB.');

      const offers = await importOffersAsync(await file.text(), file.name, controller.signal);

      setDrafts(offers.map((offer) => ({ offer })));
      setError('');
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorMessage(cause));
    }
  };
  const edit = (entry: ConfirmedOffer, line: BomLine) =>
    setDrafts((items) => [
      ...items.filter((item) => item.offer.id !== entry.offer.id),
      { offer: entry.offer, key: line.key, unitsPerOrder: entry.unitsPerOrder },
    ]);
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
      setDrafts((items) => items.filter((item) => item.offer.id !== offer.id));
    });
  };
  const select = (line: BomLine, id: string) =>
    attempt(() =>
      save(line.key, {
        ...purchases[line.key],
        supplierOffers: { ...purchases[line.key].supplierOffers!, selectedId: id },
      }),
    );

  return {
    plan,
    setPlan,
    drafts,
    setDrafts,
    entering,
    setEntering,
    error,
    saving,
    edit,
    select,
    result,
    savePlan: () => attempt(() => save(planKey, { purchasePlan: plan })),
    imported,
    confirm,
  };
}
