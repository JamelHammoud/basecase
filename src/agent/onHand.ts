import { describeKey, hardwareKey, specFromHardwareKey } from '../utils/bom';
import { MAX_ON_HAND } from '../utils/purchases';

export interface OnHandUpdate {
  key: string;
  onHand: number;
}

const MAX_UPDATES = 200;

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_ON_HAND;

function catalogKey(key: unknown): string | null {
  if (typeof key !== 'string' || key.length > 200) return null;

  const spec = specFromHardwareKey(key);
  const [, size, length] = key.split('|');

  if (spec && (spec.size !== size || (length && Number(length) !== spec.length))) return null;

  const normal = spec ? hardwareKey(spec) : key;

  return describeKey(normal) ? normal : null;
}

export function onHandUpdates(counts: unknown): { updates: OnHandUpdate[]; refused: string[] } {
  const updates: OnHandUpdate[] = [];
  const refused: string[] = [];

  if (!Array.isArray(counts)) return { updates, refused };

  for (const entry of counts.slice(0, MAX_UPDATES) as Array<{ key?: unknown; onHand?: unknown }>) {
    const key = catalogKey(entry?.key);

    if (key && isCount(entry.onHand)) updates.push({ key, onHand: entry.onHand });
    else refused.push(String(entry?.key ?? ''));
  }

  return { updates, refused };
}

export function onHandText(updates: OnHandUpdate[], refused: string[]): string {
  const recorded = updates.length
    ? `On hand now: ${updates.map((u) => `${u.key} ${u.onHand}`).join(', ')}. get_bom counts them at no cost.`
    : 'Nothing recorded.';
  const refusals = refused.length
    ? ` Refused (not a catalog key from find_parts, or not a whole number from 0 to ${MAX_ON_HAND}): ${refused.join(', ')}.`
    : '';

  return recorded + refusals;
}
