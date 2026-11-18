import { keyFor } from '../../app/shortcuts';
import { useEffect, useRef } from 'react';
import { Button, FieldRow, Select } from '../../design-system';
import { SUPPLY_BY_ID } from '../../data/supplies';
import type { ScenePart } from '../../types/robotics';
import type { Netlist } from '../../wiring/connectors';
import { routeId, routeIdentity, routeStock } from '../../wiring/routeEditing';
import type { CableRoutes } from '../../workspace/useCableRoutes';
import { CableAnchorFields } from './CableAnchorFields';

interface Props {
  routes: CableRoutes;
  parts: ScenePart[];
  wiring?: Netlist;
  onShowPose: (values: Record<string, number>) => void;
}

function measuredRoute(wiring: Netlist | undefined, routes: CableRoutes) {
  if (!wiring || !routes.net) return undefined;

  const key = routeId(routeIdentity(routes.net)!);

  return [...wiring.buses.flatMap((bus) => bus.nets), ...wiring.power.nets].find((entry) => {
    const identity = routeIdentity(entry);

    return identity && routeId(identity) === key;
  })?.route;
}

export function CableRouteEditor({ routes, parts, wiring, onShowPose }: Props) {
  const net = routes.net!;
  const region = useRef<HTMLDivElement>(null);
  const key = routeId(routeIdentity(net)!);

  useEffect(() => {
    region.current?.scrollIntoView({ block: 'nearest' });
  }, [key]);

  const selected = measuredRoute(wiring, routes);
  const stock = routeStock(net);
  const supplyId = routes.spec?.supplyId ?? '';
  const options = [
    { value: '', label: 'Automatic' },
    ...stock.map((supply) => ({ value: supply.id, label: supply.name })),
  ];

  if (supplyId && !stock.some((supply) => supply.id === supplyId))
    options.push({ value: supplyId, label: SUPPLY_BY_ID[supplyId]?.name ?? supplyId });

  return (
    <div ref={region} role="region" aria-label="Cable reach" className="space-y-3">
      <p className="text-[13px] text-white/90">
        {net.from.name}: {net.from.port!.name} to {net.to.name}: {net.to.port!.name}
      </p>
      <FieldRow label="Cable">
        <Select
          aria-label="Cable"
          value={supplyId}
          options={options}
          onChange={(event) => routes.patch({ supplyId: event.target.value || undefined })}
        />
      </FieldRow>
      {routes.anchors.map((_, index) => (
        <CableAnchorFields key={index} index={index} routes={routes} parts={parts} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="xs" onClick={routes.add}>
          Add Point
        </Button>
        {selected && Object.keys(selected.limitingPose).length > 0 && (
          <Button variant="secondary" size="xs" onClick={() => onShowPose(selected.limitingPose)}>
            Show Pose
          </Button>
        )}
        <Button variant="ghost" size="xs" shortcut={keyFor('deselect')} onClick={routes.close}>
          Done
        </Button>
      </div>
    </div>
  );
}
