const MAX_ON_HAND = 100_000;

const isOnHand = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_ON_HAND;

export function storedPurchase(record, today) {
  if (!record || typeof record !== 'object') return null;

  const { onHand, ...price } = record;

  if (onHand !== undefined && !isOnHand(onHand)) throw new Error('On hand must be a whole number from 0 to 100,000');

  const count = onHand ? { onHand } : {};

  if (price.priceUsd === undefined) return onHand ? count : null;

  return { ...price, checkedAt: price.checkedAt || today, ...count };
}

export function withStoredPurchase(all, { key, record }, today) {
  if (!key || typeof key !== 'string') throw new Error('Missing purchase key');

  const next = storedPurchase(record, today);
  const out = Object.fromEntries(Object.entries(all).filter(([k]) => k !== key));

  if (next) out[key] = next;

  return out;
}
