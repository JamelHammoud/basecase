import { Button, Section } from '../../design-system';
import type { ScenePart } from '../../types/robotics';
import type { Netlist } from '../../wiring/connectors';
import { routeId, routeIdentity } from '../../wiring/routeEditing';
import type { CableRoutes } from '../../workspace/useCableRoutes';
import { CableRouteEditor } from './CableRouteEditor';

interface Props {
  routes: CableRoutes;
  parts: ScenePart[];
  wiring?: Netlist;
  onShowPose: (values: Record<string, number>) => void;
}

export function CableRoutesSection({ routes, parts, wiring, onShowPose }: Props) {
  const net = routes.net;

  if (!routes.nets.length) return null;

  return (
    <Section title="Wiring">
      {!net &&
        routes.nets.map((entry) => (
          <div key={routeId(routeIdentity(entry)!)} className="py-2 space-y-1">
            <p className="text-[13px] text-white/90">
              {entry.from.name}: {entry.from.port!.name} to {entry.to.name}: {entry.to.port!.name}
            </p>
            <Button variant="secondary" size="xs" onClick={() => routes.open(routeIdentity(entry)!)}>
              Edit Route
            </Button>
          </div>
        ))}
      {net && <CableRouteEditor routes={routes} parts={parts} wiring={wiring} onShowPose={onShowPose} />}
    </Section>
  );
}
