import type { ProjectSettings } from '../../types/robotics';

export type Extra = NonNullable<ProjectSettings['extras']>[number];

export const withAdded = (extras: Extra[], key: string): Extra[] =>
  extras.some((x) => x.key === key)
    ? extras.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x))
    : [...extras, { key, qty: 1 }];

export const withQty = (extras: Extra[], key: string, qty: number): Extra[] =>
  extras.map((x) => (x.key === key ? { ...x, qty: Math.max(1, Math.round(qty)) } : x));

export const without = (extras: Extra[], key: string): Extra[] => extras.filter((x) => x.key !== key);
