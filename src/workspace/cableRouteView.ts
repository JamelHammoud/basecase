import * as THREE from 'three';
import { currentWiring } from '../readiness/currentWiring';
import type { CableRouteView } from '../three/viewport/cableRouteLayer';
import type { PortVec } from '../types/ports';
import { partMatrix } from '../utils/kinematics';
import { routeId, routeIdentity } from '../wiring/routeEditing';
import type { WorkspaceCore } from './useWorkspaceCore';

export function cableRouteView(core: WorkspaceCore): CableRouteView | null {
  const { cableRoutes: routes, parts, posing } = core;
  const net = routes.net;

  if (!net || core.buildAlong.active) return null;

  const byId = new Map(parts.map((part) => [part.id, part]));
  const world = (id: string, point: PortVec) => {
    const part = byId.get(id);
    const at = new THREE.Vector3(...point);

    if (part) at.applyMatrix4(partMatrix(part));

    if (posing.deltas.has(id)) at.applyMatrix4(posing.deltas.get(id)!);

    return at.toArray() as PortVec;
  };
  const endpoints = [net.from, net.to].map((end) => ({
    at: world(end.id!, end.port!.position),
    name: `${end.name}: ${end.port!.name}`,
  }));
  const anchors = routes.anchors.map((anchor) => world(anchor.partId, anchor.position));
  const identity = routeIdentity(net)!;
  const wiring = currentWiring(core.readiness);
  const measured =
    wiring &&
    [...wiring.buses.flatMap((bus) => bus.nets), ...wiring.power.nets].find((entry) => {
      const route = routeIdentity(entry);

      return route && routeId(route) === routeId(identity);
    });
  const modeled = measured?.route?.points;
  const points =
    modeled?.length && !routes.previewing && !Object.keys(posing.pose?.values ?? {}).length
      ? modeled
      : [endpoints[0].at, ...anchors, endpoints[1].at];

  return {
    key: `${core.scene.sceneId}:${routeId(identity)}`,
    source: { parts: core.parts, project: core.project },
    cancel: routes.cancelPreview,
    points,
    anchors,
    endpoints,
    move: (index, point, live) => {
      const anchor = routes.anchors[index];
      const owner = anchor && byId.get(anchor.partId);

      if (!owner) return;

      const matrix = (posing.deltas.get(owner.id)?.clone() ?? new THREE.Matrix4()).multiply(partMatrix(owner)).invert();
      const position = new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as PortVec;

      routes.changeAnchor(index, { ...anchor, position }, live);
    },
  };
}
