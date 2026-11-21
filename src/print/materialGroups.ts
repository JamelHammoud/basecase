import type { PrintMaterial } from '../types/robotics';

export function materialGroups<T extends { material: PrintMaterial }>(items: T[]): Map<PrintMaterial, T[]> {
  const groups = new Map<PrintMaterial, T[]>();

  for (const item of items) {
    const material = item.material;
    const group = groups.get(material);

    if (group) group.push(item);
    else groups.set(material, [item]);
  }

  return groups;
}
