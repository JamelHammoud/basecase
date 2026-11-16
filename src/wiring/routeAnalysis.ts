import * as THREE from 'three';
import { SUPPLY_BY_ID } from '../data/supplies';
import type { PortVec } from '../types/ports';
import { partMatrix } from '../utils/kinematics';
import { selectCableStock } from './cableStock';
import type { CableRoute, Net, NetEnd, Netlist, WiringRouteSpec, WiringScene } from './connectors';
import { wiringNetlist } from './netlist';
import { routePath, routeTopology, type RouteEndpoint, type RouteObstacle } from './routeGeometry';
import type { RelativeBound, RoutePoint } from './routeCollision';
import { relativeMotionBound } from './routeBound';
import { pathLength } from './routeMeasure';
import { poseTransforms, routeMotion, routePoses, type RouteMotion } from './routeMotion';

interface RouteContext {
  scene: WiringScene;
  motion: RouteMotion;
  bound: RelativeBound;
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

const transformed = (point: PortVec, matrix: THREE.Matrix4): PortVec =>
  new THREE.Vector3(...point).applyMatrix4(matrix).toArray() as PortVec;

interface RoutingInput {
  ctx: RouteContext;
  net: Net;
  from: RouteEndpoint;
  to: RouteEndpoint;
  anchors: Array<{ partId: string; position: PortVec }>;
}

function sampleRoute(input: RoutingInput, values: Record<string, number>) {
  const { ctx, net, from, to, anchors } = input;
  const worldTransforms = poseTransforms(ctx.motion, values);
  const reference = worldTransforms.get(net.from.id!)!.clone().invert();
  const transforms = new Map([...worldTransforms].map(([id, matrix]) => [id, reference.clone().multiply(matrix)]));
  const transformEnd = (end: RouteEndpoint, id: string): RouteEndpoint => ({
    ...end,
    position: transformed(end.position, transforms.get(id)!),
    axis: new THREE.Vector3(...end.axis).transformDirection(transforms.get(id)!).toArray() as PortVec,
  });
  const inverses = new Map([...transforms].map(([id, matrix]) => [id, matrix.clone().invert()]));
  const boundCache = new WeakMap<RoutePoint, Map<string | undefined, number>>();
  const fallbackInverse = reference.clone().invert();
  const bound = (point: RoutePoint, obstacleId: string | undefined) => {
    const byObstacle = boundCache.get(point) ?? new Map<string | undefined, number>();
    const cached = byObstacle.get(obstacleId);

    if (cached !== undefined) return cached;

    const value = ctx.bound(
      {
        ...point,
        position: transformed(point.position, inverses.get(point.obstacleId ?? '') ?? fallbackInverse),
      },
      obstacleId,
    );

    byObstacle.set(obstacleId, value);
    boundCache.set(point, byObstacle);

    return value;
  };
  const obstacles = ctx.obstacles.map((box) => ({
    ...box,
    transform: transforms.get(box.id) ?? reference,
    inverse: inverses.get(box.id) ?? fallbackInverse,
  }));
  const path = routePath({
    from: transformEnd(from, net.from.id!),
    to: transformEnd(to, net.to.id!),
    obstacles,
    anchors: anchors.map((a) => transformed(a.position, transforms.get(a.partId)!)),
    anchorIds: anchors.map((a) => a.partId),
    bound,
  });

  if (!path) return null;

  const points = path.map((point) => point.position);
  const bends = Math.max(0, points.length - 2);
  const allowance = path.slice(1).reduce((sum, point, i) => sum + bound(point, path[i].obstacleId), 0);
  const requiredMm = Math.ceil(Math.round((pathLength(points) + allowance + bends * 3) * 1.15 * 1e9) / 1e9);

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
  const motion = routeMotion(scene);
  const ctx: RouteContext = {
    scene,
    motion,
    bound: relativeMotionBound(motion),
    obstacles,
    mounts: new Map(scene.parts.map((p) => [p.id, partMatrix(p)])),
  };
  const routed = (net: Net): Net => ({ ...net, route: routeOne(ctx, net) });

  return {
    ...netlist,
    buses: netlist.buses.map((bus) => ({ ...bus, nets: bus.nets.map(routed) })),
    power: { ...netlist.power, nets: netlist.power.nets.map((net) => (net.from.id && net.to.id ? routed(net) : net)) },
  };
}

export function analyzeWiring(scene: WiringScene, obstacles: RouteObstacle[]): Netlist {
  return routeNetlist(scene, wiringNetlist(scene), obstacles);
}
