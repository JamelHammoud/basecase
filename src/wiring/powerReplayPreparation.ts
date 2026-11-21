import { actuatorOf, COMPONENT_BY_ID } from '../data/components';
import { electricalProjection } from './electrical';
import { endpointIndex, partPinMap } from './electricalEndpoints';
import { ELECTRICAL_PIN_MAPS } from './electricalPinMaps';
import { electricalSourceJson } from './electricalSource';
import type { NetEnd } from './connectors';
import type { ElectricalInput, ElectricalProjection } from './electricalTypes';
import { POWER_REPLAY_LIMITS, POWER_REPLAY_METHOD } from './powerReplayTypes';
import type { PowerReplayRequest, ReplayCable, ReplayNetwork, ReplaySource } from './powerReplayTypes';
import { replayLoads } from './powerReplayLoads';

export const replayNode = (end: NetEnd) => electricalSourceJson([end.id, end.id ? null : end.name]);

const cableEnd = (end: NetEnd) => [end.id, end.port?.name ?? end.name, end.connector];

export function replayCables(projection: ElectricalProjection): ReplayCable[] {
  return [...projection.wiring.power.nets, ...projection.wiring.buses.flatMap((bus) => bus.nets)].map((net) => ({
    id: electricalSourceJson([cableEnd(net.from), cableEnd(net.to)]),
    from: replayNode(net.from),
    to: replayNode(net.to),
    name: `${net.from.name} to ${net.to.name}`,
    partIds: [net.from.id, net.to.id].filter((id): id is string => !!id),
    route: net.route ?? null,
  }));
}

const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;
const evidence = (value: string) => typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;

function validateSource(source: ReplaySource, projection: ElectricalProjection) {
  const budget = projection.powerBudget;

  if (!budget || !projection.wiring.power.source || source.volts !== budget.sourceNominalV)
    throw new Error('Match the replay voltage to the declared source.');

  if (
    !Number.isFinite(source.volts) ||
    source.volts <= 0 ||
    !nonnegative(source.ohms) ||
    !Number.isFinite(source.temperatureC) ||
    source.temperatureC <= -273.15 ||
    !evidence(source.evidence) ||
    !nonnegative(source.minimumV) ||
    source.minimumV > source.volts ||
    !Number.isFinite(source.maximumA) ||
    source.maximumA <= 0
  )
    throw new Error('Enter the source resistance, evidence, temperature and model limits.');
}

function validateDomain(request: PowerReplayRequest, projection: ElectricalProjection) {
  const { input } = request;
  const unsupported = input.parts.some((part) => COMPONENT_BY_ID[part.componentId ?? '']?.regulator);
  const refused = [
    'conflicting-supplies',
    'missing-source',
    'undeclared-source',
    'unknown-pin-map',
    'missing-pin-source',
    'unknown-component',
  ];

  if (unsupported || input.project.electronicsBoard || projection.requirements.some((r) => refused.includes(r.code)))
    throw new Error('Use one declared DC source without regulators or a carrier board.');

  if (!evidence(request.declarations.junctionEvidence))
    throw new Error('Document outgoing and return continuity at every harness junction.');

  if (!input.walk?.motorTrace || electricalSourceJson(input.walk.motorTrace) !== electricalSourceJson(request.trace))
    throw new Error('Use the current source trace without changing its samples or identities.');
}

function validateCommon(input: ElectricalInput) {
  const maps = input.pinMaps ?? ELECTRICAL_PIN_MAPS;

  for (const part of input.parts) {
    const map = partPinMap(part, maps);
    const needsCommon = !!actuatorOf(part.componentId ?? '', part.componentVariant) || (map?.ports.length ?? 0) > 1;

    if (needsCommon && (!map?.common.includes('positive') || !map.common.includes('ground')))
      throw new Error('Use supported common power and return ports.');
  }
}

function validateCorrespondence(projection: ElectricalProjection) {
  const endpoint = endpointIndex(projection.endpoints);
  const cables = [...projection.wiring.power.nets, ...projection.wiring.buses.flatMap((bus) => bus.nets)];

  for (const cable of cables) {
    const ends = [endpoint(cable.from), endpoint(cable.to)];

    if (
      ends.some(
        (end) =>
          !end?.map ||
          !end.map.pins.some((pin) => pin.function === 'positive') ||
          (end.partId !== null && !end.map.pins.some((pin) => pin.function === 'ground')),
      )
    )
      throw new Error('Match every cable to supported power endpoints.');
  }
}

function replaySegments(request: PowerReplayRequest, cables: ReplayCable[]) {
  const declarations = request.declarations.cables;
  const byId = new Map(declarations.map((entry) => [entry.id, entry]));

  if (
    cables.length > POWER_REPLAY_LIMITS.segments ||
    declarations.length !== cables.length ||
    byId.size !== cables.length
  )
    throw new Error('Declare each cable resistance once within the replay limit.');

  return cables.map((cable) => {
    const declared = byId.get(cable.id);

    if (
      !declared ||
      !nonnegative(declared.outgoingOhms) ||
      !nonnegative(declared.returnOhms) ||
      !Number.isFinite(declared.temperatureC) ||
      declared.temperatureC <= -273.15 ||
      !evidence(declared.evidence)
    )
      throw new Error('Enter outgoing and return resistance with evidence for every cable.');

    return { ...cable, ...declared };
  });
}

export function preparePowerReplay(request: PowerReplayRequest): ReplayNetwork {
  const projection = electricalProjection(request.input);

  validateSource(request.declarations.source, projection);
  validateDomain(request, projection);
  validateCommon(request.input);
  validateCorrespondence(projection);

  const segments = replaySegments(request, replayCables(projection));
  const sourceId = replayNode(projection.wiring.power.source!);
  const vertices = [...new Set([sourceId, ...segments.flatMap((segment) => [segment.from, segment.to])])];
  const loads = replayLoads(request, vertices);

  return {
    method: POWER_REPLAY_METHOD,
    source: { ...request.declarations.source },
    sourceId,
    vertices,
    segments,
    loads,
    windowS: request.trace.windowS,
  };
}
