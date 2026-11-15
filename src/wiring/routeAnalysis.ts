import * as THREE from 'three';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { PortVec } from '../types/ports';
import { partMatrix } from '../utils/kinematics';
import { selectCableStock } from './cableStock';
import type { CableRoute, Net, NetEnd, Netlist, WiringRouteSpec, WiringScene } from './connectors';
import { wiringNetlist } from './netlist';
import { routePolyline, routeTopology, type RouteEndpoint, type RouteObstacle } from './routeGeometry';
import {
  motionBound,
  obstacleCorners,
  posedObstacle,
  poseTransforms,
  routeMotion,
  routePoses,
  type RouteMotion,
} from './routeMotion';

interface RouteContext {
  scene: WiringScene;
  motion: RouteMotion;
  obstacles: RouteObstacle[];
  mounts: Map<string, THREE.Matrix4>;
}

const unresolved = (reason: string, limitingPose: Record<string, number> = {}): CableRoute => ({
  points: [],
  requiredMm: null,
  cableSupplyId: null,
  lengthMm: null,
  status: 'unresolved',
  reason,
  limitingPose,
});
const validVector = (point: PortVec) => point.length === 3 && point.every(Number.isFinite);

function endpoint(ctx: RouteContext, end: NetEnd): RouteEndpoint | null {
  const mount = end.id && ctx.mounts.get(end.id);
  const port = end.port;

  if (!mount || !port || !validVector(port.position) || !validVector(port.axis) || Math.hypot(...port.axis) < 1e-9)
    return null;

  return {
    position: new THREE.Vector3(...port.position).applyMatrix4(mount).toArray() as PortVec,
    axis: new THREE.Vector3(...port.axis).transformDirection(mount).toArray() as PortVec,
    obstacleId: end.id!,
  };
}

function specOf(scene: WiringScene, net: Net): WiringRouteSpec | undefined {
  return scene.project.wiring?.find(
    (spec) =>
      spec.from.partId === net.from.id &&
      spec.from.port === net.from.port?.name &&
      spec.to.partId === net.to.id &&
      spec.to.port === net.to.port?.name,
  );
}

const pathLength = (points: PortVec[]) =>
  points
    .slice(1)
    .reduce((length, p, i) => length + new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...points[i])), 0);
const transformed = (point: PortVec, matrix: THREE.Matrix4): PortVec =>
  new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as PortVec;
const exitOf = (end: RouteEndpoint): PortVec =>
  new THREE.Vector3(...end.position).addScaledVector(new THREE.Vector3(...end.axis), 8).toArray() as PortVec;

function pointBound(ctx: RouteContext, end: RouteEndpoint, id: string): number {
  return Math.max(motionBound(ctx.motion, id, end.position), motionBound(ctx.motion, id, exitOf(end)));
}

interface RoutingInput {
  ctx: RouteContext;
  net: Net;
  from: RouteEndpoint;
  to: RouteEndpoint;
  anchors: Array<{ partId: string; position: PortVec }>;
}

function sampleRoute(input: RoutingInput, values: Record<string, number>) {
  const { ctx, net, from, to, anchors } = input;
  const transforms = poseTransforms(ctx.motion, values);
  const transformEnd = (end: RouteEndpoint, id: string): RouteEndpoint => ({
    ...end,
    position: transformed(end.position, transforms.get(id)!),
    axis: new THREE.Vector3(...end.axis).transformDirection(transforms.get(id)!).toArray() as PortVec,
  });
  const bound = Math.max(
    pointBound(ctx, from, net.from.id!),
    pointBound(ctx, to, net.to.id!),
    ...anchors.map((a) => motionBound(ctx.motion, a.partId, a.position)),
  );
  const obstacles = ctx.obstacles.map((box) => {
    const obstacleBound = Math.max(...obstacleCorners(box).map((p) => motionBound(ctx.motion, box.id, p)));

    return posedObstacle(box, transforms.get(box.id) ?? new THREE.Matrix4(), obstacleBound + bound);
  });
  const points = routePolyline({
    from: transformEnd(from, net.from.id!),
    to: transformEnd(to, net.to.id!),
    obstacles,
    anchors: anchors.map((a) => transformed(a.position, transforms.get(a.partId)!)),
  });

  if (!points) return null;

  const bends = Math.max(0, points.length - 2);
  const requiredMm = Math.ceil((pathLength(points) + 2 * bound * (anchors.length + 1) + bends * 3) * 1.15);

  return { points, requiredMm, topology: routeTopology(points, obstacles) };
}

function stockFor(net: Net, requiredMm: number, spec: WiringRouteSpec | undefined) {
  if (!spec?.supplyId) return selectCableStock(net.from.connector, net.to.connector, requiredMm);

  const stock = SUPPLY_BY_ID[spec.supplyId];

  return selectCableStock(net.from.connector, net.to.connector, requiredMm, stock ? [stock] : []);
}

function routeOne(ctx: RouteContext, net: Net): CableRoute {
  const from = endpoint(ctx, net.from);
  const to = endpoint(ctx, net.to);
  const spec = specOf(ctx.scene, net);

  if (!from || !to) return unresolved('Port geometry missing');

  if (ctx.motion.failure)
    return unresolved(ctx.motion.failure, Object.fromEntries(ctx.motion.joints.map((j) => [j.id, 0])));

  const anchors = (spec?.anchors ?? []).map((a) => ({
    ...a,
    position: ctx.mounts.has(a.partId) ? transformed(a.position, ctx.mounts.get(a.partId)!) : a.position,
  }));

  if (anchors.some((a) => !ctx.mounts.has(a.partId) || !validVector(a.position)))
    return unresolved('Routing anchor missing');

  const input = { ctx, net, from, to, anchors };
  const rest = sampleRoute(input, {});

  if (!rest) return unresolved('Route blocked');

  let worst = rest;
  let limitingPose: Record<string, number> = {};

  for (const values of routePoses(ctx.motion)) {
    const route = sampleRoute(input, values);

    if (!route) return { ...unresolved('Route blocked', values), points: rest.points };

    if (route.topology.join(',') !== rest.topology.join(','))
      return { ...unresolved('Route changes around a solid', values), points: rest.points };

    if (route.requiredMm >= worst.requiredMm) {
      worst = route;
      limitingPose = values;
    }
  }

  const stock = stockFor(net, worst.requiredMm, spec);
  const reason = stock.status === 'fits' ? null : stockReason(stock.status);

  return {
    points: rest.points,
    requiredMm: worst.requiredMm,
    cableSupplyId: stock.cableSupplyId,
    lengthMm: stock.lengthMm,
    status: routeStatus(stock.status),
    reason,
    limitingPose,
  };
}

function routeStatus(status: ReturnType<typeof selectCableStock>['status']): CableRoute['status'] {
  if (status === 'fits') return 'pass';

  return status === 'too-short' ? 'fail' : 'unresolved';
}

function stockReason(status: ReturnType<typeof selectCableStock>['status']): string {
  if (status === 'too-short') return 'Cable too short';

  return status === 'unknown-length' ? 'Cable length unknown' : 'Compatible cable missing';
}

export function routeNetlist(scene: WiringScene, netlist: Netlist, obstacles: RouteObstacle[]): Netlist {
  const ctx: RouteContext = {
    scene,
    motion: routeMotion(scene),
    obstacles,
    mounts: new Map(scene.parts.map((p) => [p.id, partMatrix(p)])),
  };
  const routed = (net: Net): Net => ({ ...net, route: routeOne(ctx, net) });

  return {
    ...netlist,
    buses: netlist.buses.map((bus) => ({ ...bus, nets: bus.nets.map(routed) })),
    power: { ...netlist.power, nets: netlist.power.nets.map(routed) },
  };
}

export function analyzeWiring(scene: WiringScene, obstacles: RouteObstacle[]): Netlist {
  return routeNetlist(scene, wiringNetlist(scene), obstacles);
}
