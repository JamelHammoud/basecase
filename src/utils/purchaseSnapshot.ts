import type { Purchases } from '../types/robotics';
import { onHandOf } from './onHand';

export function purchaseSnapshot(purchases: Purchases, stock: 'available' | 'owned' = 'available'): Purchases {
  return Object.fromEntries(
    Object.entries(purchases)
      .filter(([, record]) => !record?.printOutput)
      .map(([key, saved]) => {
        if (!saved || typeof saved !== 'object') return [key, saved];

        const record = { ...saved };

        delete record.reservations;
        delete record.printOutput;

        if (saved.reservations && stock === 'available') record.onHand = onHandOf(saved) || undefined;

        return [key, record];
      }),
  );
}
