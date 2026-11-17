import { COMPONENT_BY_ID, actuatorOf } from '../data/components';
import { nodeKey } from './electricalGraph';
import { endpointIndex } from './electricalEndpoints';
import type { ElectricalEndpoint, ElectricalNet, ElectricalProjection, ElectricalRequirement } from './electricalTypes';
import { currentDraw, servoParts, servoSource } from '../utils/engineeringPower';

function currentEstimate(options: {
  budget: ElectricalProjection['powerBudget'];
  count: number;
  total: number;
  standing: number;
}): { amps: number; basis: 'standing' | 'walk' } | null {
  if (options.budget?.estimateBasis !== 'existing-walk-model') return { amps: options.standing, basis: 'standing' };

  if (options.count !== options.total) return null;

  return { amps: options.budget.estimatedServoPeakA, basis: 'walk' };
}

function railLimit(projection: ElectricalProjection, net: ElectricalNet, ends: ElectricalEndpoint[]) {
  const ratings = new Map<string, number>();

  for (const end of ends) {
    if (end.map?.maximumA !== undefined) ratings.set(end.reference, end.map.maximumA);
  }

  const ids = new Set(ends.flatMap((end) => (end.partId ? [end.partId] : [])));
  const { parts, project } = projection.inputs;
  const servos = servoParts(parts).filter((part) => ids.has(part.id));
  const source = servoSource({ parts, project, servos: servoParts(parts) });

  net.interfaceRatings = [...ratings].map(([reference, maximumA]) => ({ reference, maximumA }));
  net.interfaceLimitA = net.buses.length > 1 || !ratings.size ? null : Math.min(...ratings.values());

  if (!servos.length || !source) return false;

  const draw = currentDraw(
    { parts, project, servos, joints: project.joints ?? [], input: { parts, project, measures: {}, servoOutputs: {} } },
    source,
  );

  net.standingServoEstimateA = draw.servoPeak;

  const modeled = currentEstimate({
    budget: projection.powerBudget,
    count: servos.length,
    total: servoParts(parts).length,
    standing: draw.servoPeak,
  });

  net.modeledServoPeakA = modeled?.amps ?? null;
  net.currentModel = modeled?.basis ?? null;

  return net.interfaceLimitA !== null && net.modeledServoPeakA !== null && net.modeledServoPeakA > net.interfaceLimitA;
}

function netAt(projection: ElectricalProjection) {
  const nets = new Map(projection.nets.flatMap((net) => net.nodes.map((node) => [nodeKey(node), net])));

  return (end: ElectricalEndpoint, pin: string) => nets.get(nodeKey({ reference: end.reference, pin }));
}

function copySupply(target: ElectricalNet, source: ElectricalNet) {
  target.nominalV = source.nominalV;
  target.maximumV = source.maximumV;
  target.declaredA = source.declaredA;
  target.sourceReferences = [...source.sourceReferences];
}

function sourceRequirements(
  source: ElectricalEndpoint | null,
  budget: ElectricalProjection['powerBudget'],
): ElectricalRequirement[] {
  if (!source?.map || !budget) return [];

  const references = [source.reference];
  const requirements: ElectricalRequirement[] = [];

  if (source.map.outputV !== undefined && budget.sourceNominalV !== source.map.outputV)
    requirements.push({
      code: 'conflicting-source',
      detail: 'The declared supply voltage differs from the selected module.',
      partIds: [],
      references,
    });

  if (source.map.maximumA !== undefined && (budget.sourceDeclaredA ?? 0) > source.map.maximumA)
    requirements.push({
      code: 'conflicting-source',
      detail: 'The declared supply current exceeds the selected module’s rating.',
      partIds: [],
      references,
    });

  if (source.map.maximumA !== undefined && budget.estimatedSourcePeakA > source.map.maximumA)
    requirements.push({
      code: 'rail-overload',
      detail: 'The estimated peak load exceeds the declared rail current.',
      partIds: [],
      references,
    });

  return requirements;
}

function propagate(projection: ElectricalProjection, at: ReturnType<typeof netAt>) {
  const pending = projection.endpoints.filter((end) => end.map?.terminals);

  for (const end of pending) {
    const input = at(end, end.map!.terminals!.input);
    const output = at(end, end.map!.terminals!.output);

    if (input?.sourceReferences.length && output) copySupply(output, input);
  }

  for (const end of projection.endpoints.filter((end) => end.port === 'power-out')) {
    const regulator = COMPONENT_BY_ID[end.componentId ?? '']?.regulator;
    const input = projection.endpoints.find(
      (candidate) => candidate.partId === end.partId && candidate.port === 'power-in',
    );
    const upstream = input && at(input, 'VIN');
    const output = at(end, 'VOUT');

    if (!regulator || !output || !upstream?.sourceReferences.length) continue;

    output.nominalV = regulator.vout;
    output.maximumV = regulator.vout;
    output.declaredA = regulator.ioutA;
    output.sourceReferences = [end.reference];
  }
}

function loadRequirements(projection: ElectricalProjection, sourceGround: ElectricalNet | undefined) {
  const byReference = new Map(projection.endpoints.map((end) => [end.reference, end]));
  const requirements: ElectricalRequirement[] = [];

  for (const net of projection.nets.filter((item) => item.function === 'positive' || item.function === 'ground')) {
    const ends = net.nodes
      .map((node) => byReference.get(node.reference)!)
      .filter((end) => end.map?.basis !== 'requirement');
    const ids = [...new Set(ends.flatMap((end) => (end.partId ? [end.partId] : [])))];
    const references = [...new Set(ends.map((end) => end.reference))];

    if (!ends.length) continue;

    if (net.function === 'positive' && railLimit(projection, net, ends))
      requirements.push({
        code: 'rail-overload',
        detail: 'The estimated servo load exceeds a connector’s current limit.',
        partIds: ids,
        references,
      });

    if (net.function === 'positive' && !net.sourceReferences.length)
      requirements.push({
        code: 'missing-source',
        detail: `Connect a source to ${net.name}.`,
        partIds: ids,
        references,
      });

    if (net.function === 'ground' && net !== sourceGround)
      requirements.push({
        code: 'missing-ground',
        detail: `Connect ${net.name} to the supply return.`,
        partIds: ids,
        references,
      });

    const incompatible = ends.filter((end) => {
      const actuator = actuatorOf(end.componentId ?? '', end.variant ?? undefined);

      return (
        actuator &&
        net.maximumV !== null &&
        (net.maximumV > actuator.volts[1] || (net.nominalV ?? 0) < actuator.volts[0])
      );
    });

    if (net.function === 'positive' && incompatible.length)
      requirements.push({
        code: 'conflicting-rail',
        detail: `${net.name} exceeds a connected actuator voltage range.`,
        partIds: incompatible.flatMap((end) => (end.partId ? [end.partId] : [])),
        references: incompatible.map((end) => end.reference),
      });
  }

  return requirements;
}

function powerNet(source: ElectricalEndpoint | null, kind: 'ground' | 'positive', at: ReturnType<typeof netAt>) {
  const pin = source?.map?.pins.find((candidate) => candidate.function === kind);

  return source && pin ? at(source, pin.number) : undefined;
}

function applySource(
  net: ElectricalNet | undefined,
  source: ElectricalEndpoint | null,
  budget: ElectricalProjection['powerBudget'],
) {
  if (!net || !source || !budget) return;

  net.nominalV = source.map?.outputV ?? budget.sourceNominalV;
  net.maximumV = source.map?.outputMaximumV ?? source.map?.outputV ?? budget.sourceMaximumV;
  net.declaredA =
    source.map?.maximumA === undefined
      ? budget.sourceDeclaredA
      : Math.min(source.map.maximumA, budget.sourceDeclaredA ?? Infinity);
  net.sourceReferences = [source.reference];
}

export function electricalRails(projection: ElectricalProjection): ElectricalRequirement[] {
  const endpoint = endpointIndex(projection.endpoints);
  const source = projection.wiring.power.source ? (endpoint(projection.wiring.power.source) ?? null) : null;
  const at = netAt(projection);
  const ground = powerNet(source, 'ground', at);
  const budget = projection.powerBudget;

  applySource(powerNet(source, 'positive', at), source, budget);

  propagate(projection, at);

  return [...loadRequirements(projection, ground), ...sourceRequirements(source || null, budget)];
}
