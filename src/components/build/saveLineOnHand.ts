import type { Purchases, StoredPurchase } from '../../types/robotics';
import type { ShowToast } from '../../workspace/types';
import type { BomLine } from '../../utils/bom';
import { withOnHand } from '../../utils/onHand';
import { onHandAmount } from './buyLine';

interface SaveOnHand {
  line: BomLine;
  count: number;
  purchases: Purchases;
  savePurchase: (key: string, record: StoredPurchase | null) => Promise<void>;
  onToast: ShowToast;
}

export async function saveLineOnHand({ line, count, purchases, savePurchase, onToast }: SaveOnHand) {
  const before = purchases[line.key];

  await savePurchase(line.key, withOnHand(before, count));
  onToast(`Saved ${onHandAmount(count, line.unit)} for ${line.name}`, {
    action: { label: 'Undo', onClick: () => void savePurchase(line.key, before ?? null) },
  });
}
