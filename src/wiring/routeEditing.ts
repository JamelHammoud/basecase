import * as THREE from 'three';
import { SUPPLIES } from '../data/supplies';
import type { PortVec } from '../types/ports';
import type { ScenePart } from '../types/robotics';
import { partMatrix } from '../utils/kinematics';
import { selectCableStock } from './cableStock';
import type { Net, WiringRouteSpec, WiringScene } from './connectors';
import { wiringNetlist } from './netlist';
import { indexRouteSpecs } from './routeSpecs';

export type RouteIdentity = Pick<WiringRouteSpec, 'from' | 'to'>;
export type RoutePatch = Pick<WiringRouteSpec, 'supplyId' | 'anchors'>;
export type RouteAnchor = NonNullable<WiringRouteSpec['anchors']>[number];

const finitePoint = (point: PortVec) => point.length === 3 && point.every(Number.isFinite);
const supportedEnd = (end: Net['from']) =>
  !!end.id &&
  !!end.port &&
  finitePoint(end.port.position) &&
  finitePoint(end.port.axis) &&
  Math.hypot(...end.port.axis) > 0;

export function routeIdentity(net: Net): RouteIdentity | null {
  if (!supportedEnd(net.from) || !supportedEnd(net.to)) return null;

  return {
    from: { partId: net.from.id!, port: net.from.port!.name },
    to: { partId: net.to.id!, port: net.to.port!.name },
  };
}

export const routeId = (identity: RouteIdentity) =>
  JSON.stringify([identity.from.partId, identity.from.port, identity.to.partId, identity.to.port]);

export const routeOwners = (parts: ScenePart[]) =>
  parts.filter((part) => part.role === 'solid' && part.kind !== 'image_plane');

export function editableNets(scene: WiringScene): Net[] {
  const netlist = wiringNetlist(scene);
  const owners = new Set(routeOwners(scene.parts).map((part) => part.id));

  return [...netlist.buses.flatMap((bus) => bus.nets), ...netlist.power.nets].filter(
    (net) => routeIdentity(net) && owners.has(net.from.id!) && owners.has(net.to.id!),
  );
}

export function findEditableNet(scene: WiringScene, identity: RouteIdentity) {
  const key = routeId(identity);

  return editableNets(scene).find((net) => routeId(routeIdentity(net)!) === key);
}

export function routeStock(net: Net) {
  return SUPPLIES.filter(
    (stock) => selectCableStock(net.from.connector, net.to.connector, 0, [stock]).status === 'fits',
  );
}

function sameRouteChoice(before: WiringRouteSpec | undefined, after: WiringRouteSpec) {
  const previous = before?.anchors ?? [];
  const anchors = after.anchors ?? [];

  return (
    before?.supplyId === after.supplyId &&
    previous.length === anchors.length &&
    previous.every(
      (point, index) =>
        point.partId === anchors[index].partId &&
        point.position.every((value, axis) => value === anchors[index].position[axis]),
    )
  );
}

export function updateRoute(scene: WiringScene, identity: RouteIdentity, patch: RoutePatch) {
  const net = findEditableNet(scene, identity);

  if (!net) throw new Error('Choose a cable with named connectors on existing parts.');

  const previous = indexRouteSpecs(scene.project.wiring)(net);
  const spec = { ...previous, ...patch, ...identity };
  const owners = new Set(routeOwners(scene.parts).map((part) => part.id));

  if (spec.supplyId && !routeStock(net).some((stock) => stock.id === spec.supplyId))
    throw new Error('Choose a cable that fits these connectors.');

  if (spec.anchors?.some((anchor) => !owners.has(anchor.partId) || !finitePoint(anchor.position)))
    throw new Error('Choose an existing link and finite point coordinates.');

  if (sameRouteChoice(previous, spec)) return scene.project;

  const key = routeId(identity);
  const wiring = scene.project.wiring ?? [];
  const index = wiring.findIndex((entry) => routeId(entry) === key);
  const next = wiring.filter((entry, i) => routeId(entry) !== key || i === index);

  if (index < 0) next.push(spec);
  else next[index] = spec;

  return { ...scene.project, wiring: next };
}

export function anchorFromWorld(part: ScenePart, point: PortVec, pose = new THREE.Matrix4()): RouteAnchor {
  const matrix = pose.clone().multiply(partMatrix(part));
  const position = new THREE.Vector3(...point).applyMatrix4(matrix.invert()).toArray() as PortVec;

  return { partId: part.id, position };
}
