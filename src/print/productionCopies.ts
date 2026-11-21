import type { PrintRecord } from '../types/print';

export function reconcileCopies(
  record: PrintRecord,
  quantities: Record<string, number>,
  sourceKeys = record.sourceKeys,
): PrintRecord {
  if (record.copies || record.state !== 'printed' || record.parts.length !== Object.keys(quantities).length)
    throw new Error('Choose a completed print without reconciled quantities.');

  const copies = record.parts.flatMap((part) => {
    const quantity = quantities[part.id];

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50)
      throw new Error('Choose 1 to 50 printed copies per part.');

    return Array.from({ length: quantity }, (_, index) => ({
      id: crypto.randomUUID(),
      partId: part.id,
      key: sourceKeys?.[part.id] ?? part.key,
      index,
    }));
  });

  return { ...record, copies, sourceKeys, reconciledAt: new Date().toISOString() };
}
