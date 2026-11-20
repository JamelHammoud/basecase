import type { Bom } from '../../utils/bomTypes';
import type { Purchases, StoredPurchase } from '../../types/robotics';
import { SupplierOfferSheet } from './SupplierOfferSheet';
import { useSupplierOffersOpen, setSupplierOffersOpen } from './offerDialog';

export function SupplierOffers({
  bom,
  purchases,
  scene,
  save,
}: {
  bom: Bom;
  purchases: Purchases;
  scene: string;
  save: (key: string, record: StoredPurchase | null) => Promise<void>;
}) {
  const open = useSupplierOffersOpen();

  if (!open) return null;

  return (
    <SupplierOfferSheet
      key={scene}
      bom={bom}
      purchases={purchases}
      scene={scene}
      save={save}
      onClose={() => setSupplierOffersOpen(false)}
    />
  );
}
