import { BOM_CATEGORIES, type BomCategory, type BomLine } from './bomTypes';

export interface BomCategoryGroup {
  category: BomCategory;
  lines: BomLine[];
}

export function bomCategories(lines: readonly BomLine[]): BomCategoryGroup[] {
  const byCategory = new Map<BomCategory, BomLine[]>();

  for (const line of lines) {
    const category = line.category;
    const group = byCategory.get(category);

    if (group) {
      group.push(line);

      continue;
    }

    byCategory.set(category, [line]);
  }

  const groups: BomCategoryGroup[] = [];

  for (const category of BOM_CATEGORIES) {
    const members = byCategory.get(category);

    if (members) groups.push({ category, lines: members });
  }

  return groups;
}
