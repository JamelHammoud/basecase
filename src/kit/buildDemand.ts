import { labelsKey } from '../print/labels/partLetters';
import type { FrozenKit } from './frozenKit';
import type { ComponentDemand, PrintedDemand } from './allocationTypes';

export function buildDemand(kit: FrozenKit) {
  const components: ComponentDemand[] = kit.manifest.purchases
    .filter((line) => line.unit === 'pcs' && /^(component|hardware|supply):/.test(line.key))
    .map(({ key, name, qty, partIds, identity }) => ({ key, name, qty, partIds: [...partIds], identity }));
  const printed: Array<PrintedDemand & { name: string; refusal?: string }> = kit.manifest.printed.map((part) => {
    const source = kit.parts.find((item) => item.id === part.id);
    const qty = kit.manifest.packing
      .filter((row) => row.key === part.key)
      .flatMap((row) => row.partIds)
      .filter((id) => id === part.id).length;
    const supported =
      source && !source.mesh?.visual && qty === 1 && part.outputs.length > 0 && part.outputs.length <= 50;

    return {
      partId: part.id,
      name: part.name,
      key: kit.productionKeys?.[part.id] ?? '',
      shape: kit.legacyKeys?.[part.id] ?? '',
      labels: labelsKey(kit.project, kit.parts, kit.manifest.guideEvidence.fingerprint),
      material: part.material,
      qty,
      refusal: supported
        ? undefined
        : 'Reconcile the manufactured part with its frozen source before assigning copies.',
    };
  });

  return { components, printed };
}
