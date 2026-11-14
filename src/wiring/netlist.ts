import { servoLayout } from '../robot/sceneRobot';
import type { ConnectorType } from '../types/ports';
import type { RobotJoint, ScenePart } from '../types/robotics';
import {
  busIn,
  endOf,
  isBusAdapter,
  portOf,
  type BusChain,
  type BusServo,
  type NetEnd,
  type Netlist,
  type WiringScene,
} from './connectors';
import { powerTree } from './powerTree';

export type { BusChain, BusServo, Net, NetEnd, Netlist, PowerTree, WiringScene } from './connectors';

export function busOrder(parts: readonly ScenePart[], joints: readonly RobotJoint[]): BusServo[] {
  const servos = new Map(parts.filter((p) => busIn(p)).map((p) => [p.id, p]));
  const { movable, ids } = servoLayout(joints);
  const onJoints = movable.flatMap((j, i) =>
    (j.actuators ?? []).filter((id) => servos.has(id)).map((id) => ({ id, busId: ids[i] })),
  );
  const seen = new Set<string>();
  const first = onJoints.filter((s) => !seen.has(s.id) && !!seen.add(s.id));

  return [...first, ...[...servos.keys()].filter((id) => !seen.has(id)).map((id) => ({ id, busId: null }))];
}

function runs<T>(list: T[], count: number): T[][] {
  const start = (i: number) => Math.round((i * list.length) / count);

  return Array.from({ length: count }, (_, i) => list.slice(start(i), start(i + 1))).filter((run) => run.length);
}

interface ChainInput {
  adapter: ScenePart | null;
  servos: BusServo[];
  connector: ConnectorType;
  byId: Map<string, ScenePart>;
}

function chain({ adapter, servos, connector, byId }: ChainInput): BusChain {
  const parts = servos.map((s) => byId.get(s.id)!);
  const head: NetEnd = adapter
    ? endOf(adapter, portOf(adapter, 'bus-out')!)
    : { id: null, name: 'Bus adapter', connector };
  const outOf = (p: ScenePart) => endOf(p, portOf(p, 'bus-out') ?? busIn(p)!);

  return {
    connector,
    adapter: adapter?.id ?? null,
    servos,
    nets: parts.map((p, i) => ({ from: i === 0 ? head : outOf(parts[i - 1]), to: endOf(p, busIn(p)!) })),
  };
}

function busChains(parts: ScenePart[], joints: readonly RobotJoint[]): Pick<Netlist, 'buses' | 'unmatched'> {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const order = busOrder(parts, joints);
  const adapters = parts.filter(isBusAdapter);
  const connectorOf = (id: string) => busIn(byId.get(id)!)!.connector!;
  const types = [...new Set(order.map((s) => connectorOf(s.id)))];
  const buses: BusChain[] = [];
  const unmatched: string[] = [];

  for (const connector of types) {
    const servos = order.filter((s) => connectorOf(s.id) === connector);
    const heads = adapters.filter((a) => portOf(a, 'bus-out')!.connector === connector);

    if (!heads.length && adapters.length) unmatched.push(...servos.map((s) => s.id));

    const groups = heads.length ? runs(servos, heads.length) : [servos];

    buses.push(...groups.map((run, i) => chain({ adapter: heads[i] ?? null, servos: run, connector, byId })));
  }

  return { buses, unmatched };
}

export function wiringNetlist(scene: WiringScene): Netlist {
  const { buses, unmatched } = busChains(scene.parts, scene.project.joints ?? []);

  return { buses, power: powerTree(scene), unmatched };
}
