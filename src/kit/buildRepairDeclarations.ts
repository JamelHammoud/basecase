import { canonicalJson } from '../skills/hash';
import type { Net } from '../wiring/netlist';
import type { FrozenKit } from './frozenKit';
import type { BuildRevisionComparison } from './buildRepairComparison';

export interface RepairDeclaration {
  kind: 'disconnect' | 'connect' | 'joint';
  ids: string[];
  net?: Net;
  replacementKey?: string;
}

export function sameJointTopology(source: FrozenKit, target: FrozenKit) {
  const topology = (kit: FrozenKit) =>
    (kit.project.joints ?? [])
      .map((joint) => ({
        id: joint.id,
        type: joint.type,
        parent: joint.parent,
        child: joint.child,
        parentJoint: joint.parentJoint,
        origin: joint.origin,
        axis: joint.axis,
        frame: joint.frame,
        actuators: joint.actuators,
        actuation: joint.actuation,
        tendon: joint.tendon,
        loop: joint.loop,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

  return canonicalJson(topology(source)) === canonicalJson(topology(target));
}

export function repairDeclarations(
  source: FrozenKit,
  target: FrozenKit,
  comparison: BuildRevisionComparison,
): RepairDeclaration[] {
  const nets = (kit: FrozenKit) => [
    ...(kit.manifest.wiring?.buses.flatMap((bus) => bus.nets) ?? []),
    ...(kit.manifest.wiring?.power.nets ?? []),
  ];
  const affected = new Set(comparison.replacements);
  const selected = (net: Net) => comparison.wiring || [net.from.id, net.to.id].some((id) => id && affected.has(id));
  const connection = (net: Net) => canonicalJson([net.from.id, net.from.port?.name, net.to.id, net.to.port?.name]);
  const oldNets = new Map(nets(source).map((net) => [connection(net), net]));
  const replacementKey = (net: Net) =>
    net.route?.cableSupplyId && net.route.cableSupplyId !== oldNets.get(connection(net))?.route?.cableSupplyId
      ? `supply:${net.route.cableSupplyId}`
      : undefined;
  const declarations = (kit: FrozenKit, kind: 'disconnect' | 'connect'): RepairDeclaration[] =>
    nets(kit)
      .filter(selected)
      .map((net) => ({
        kind,
        net,
        replacementKey: kind === 'connect' ? replacementKey(net) : undefined,
        ids: [net.from.id, net.to.id].filter((id): id is string => !!id),
      }));
  const joints: RepairDeclaration[] = comparison.joints ? [{ kind: 'joint', ids: target.manifest.guide.partIds }] : [];

  return [...declarations(source, 'disconnect'), ...declarations(target, 'connect'), ...joints];
}
