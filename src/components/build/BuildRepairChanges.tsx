import { isPrinted, printMaterialOf } from '../../utils/bom';
import type { BuildRevisionComparison } from '../../kit/buildRepairComparison';
import type { FrozenKit } from '../../kit/frozenKit';

const labels = {
  added: 'Added', removed: 'Removed', ambiguous: 'Unresolved', identity: 'Identity', geometry: 'Geometry',
  placement: 'Placement', manufacturing: 'Manufacturing', relationships: 'Relationships', presentation: 'Appearance',
};

function physicalDescription(kit: FrozenKit, id: string) {
  const part = kit.parts.find((item) => item.id === id);

  if (!part) return '';

  const dimensions = [part.dimensions.width, part.dimensions.height, part.dimensions.depth].join(' × ');

  return [part.componentId, part.componentVariant, part.supplyId, isPrinted(part) ? `${printMaterialOf(part, kit.project)}, ${kit.project.infillPct}% infill` : undefined, `${dimensions} mm`].filter(Boolean).join(', ');
}

function wiring(kit: FrozenKit) {
  const nets = [...(kit.manifest.wiring?.buses.flatMap((bus) => bus.nets) ?? []), ...(kit.manifest.wiring?.power.nets ?? [])];
  const connections = nets.map((net) => `${net.from.name} (${net.from.connector}) → ${net.to.name} (${net.to.connector}) ${net.route?.cableSupplyId ?? ''}`);
  const anchors = (kit.project.wiring ?? []).flatMap((route) => (route.anchors ?? []).map((anchor) => `${anchor.partId}: ${anchor.position.join(', ')} mm`));

  return [...connections, ...anchors].join('\n');
}

function joints(kit: FrozenKit, other: FrozenKit) {
  return (kit.project.joints ?? []).filter((joint) => JSON.stringify(joint) !== JSON.stringify(other.project.joints?.find((item) => item.id === joint.id))).map((joint) => JSON.stringify(joint, null, 2)).join('\n');
}

export function BuildRepairChanges({ comparison, source, target }: {
  comparison: BuildRevisionComparison; source: FrozenKit; target: FrozenKit;
}) {
  return <div className="space-y-3 text-[13px]" data-repair-changes>
    {comparison.parts.filter((part) => part.changes.length).map((part) => <div key={part.id} className="space-y-1 break-words">
      <div>{target.parts.find((item) => item.id === part.id)?.name ?? source.parts.find((item) => item.id === part.id)?.name}</div>
      <div className="text-white/60">{part.changes.map((change) => labels[change]).join(', ')}</div>
      {part.changes.some((change) => change !== 'presentation') && <div>{physicalDescription(source, part.id)} → {physicalDescription(target, part.id)}</div>}
    </div>)}
    {comparison.wiring && <div className="space-y-1"><div>Wiring</div><div className="whitespace-pre-wrap break-words">{wiring(source)} → {wiring(target)}</div></div>}
    {comparison.joints && <div className="space-y-1"><div>Joint declarations</div><div className="whitespace-pre-wrap break-words">{joints(source, target)} → {joints(target, source)}</div></div>}
  </div>;
}
