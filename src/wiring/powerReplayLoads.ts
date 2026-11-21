import { actuatorOf } from '../data/components';
import { electricalSourceJson } from './electricalSource';
import { isElectricalPart } from './electricalSnapshot';
import type { PowerReplayRequest, ReplayNetwork } from './powerReplayTypes';
import { POWER_REPLAY_LIMITS } from './powerReplayTypes';

function validateChannel(channel: PowerReplayRequest['trace']['channels'][number], samples: number) {
  const model = channel.model;
  const nonnegative = (value: number) => Number.isFinite(value) && value >= 0;

  if (
    !model ||
    !nonnegative(model.idleA) ||
    !nonnegative(model.perNmA) ||
    channel.amps.length !== samples ||
    channel.amps.some((a) => !nonnegative(a))
  )
    throw new Error('Use synchronized finite nonnegative current samples with model provenance.');
}

function sameActuator(
  identity: PowerReplayRequest['trace']['channels'][number]['actuators'][number],
  part: PowerReplayRequest['input']['parts'][number],
) {
  return (
    identity.id === part.id &&
    identity.componentId === (part.componentId ?? null) &&
    identity.variant === (part.componentVariant ?? null)
  );
}

function matchesIdentity(channel: PowerReplayRequest['trace']['channels'][number], request: PowerReplayRequest) {
  const id = channel.actuatorIds[0];
  const joint = (request.input.project.joints ?? []).find((entry) => entry.id === channel.jointId);
  const part = request.input.parts.find((entry) => entry.id === id);
  const identity = channel.actuators[0];

  if (!part || !identity || channel.actuators.length !== 1) return false;

  const exactPart = sameActuator(identity, part);
  const ids = joint?.actuators ?? [];
  const exactJoint = ids.length === 1 && ids[0] === id && channel.actuatorIds.length === 1;

  return exactPart && exactJoint && !!actuatorOf(part.componentId ?? '', part.componentVariant);
}

function motorLoads(request: PowerReplayRequest): ReplayNetwork['loads'] {
  const { trace } = request;
  const samples = trace.channels[0]?.amps.length;

  if (
    trace.schema !== 1 ||
    trace.method !== 'servo-amps-1' ||
    !trace.identity ||
    trace.channels.length > POWER_REPLAY_LIMITS.loads ||
    !Number.isFinite(trace.windowS) ||
    trace.windowS <= 0 ||
    !samples ||
    samples > POWER_REPLAY_LIMITS.samples
  )
    throw new Error('Capture a supported modeled current trace within the replay limit.');

  const seen = new Set<string>();
  const jointIds = new Set<string>();

  return trace.channels.map((channel) => {
    const id = channel.actuatorIds[0];

    if (!matchesIdentity(channel, request) || seen.has(id) || jointIds.has(channel.jointId))
      throw new Error('Match each trace channel to one exact joint and actuator.');

    validateChannel(channel, samples);

    seen.add(id);
    jointIds.add(channel.jointId);

    return { partId: id, jointId: channel.jointId, node: electricalSourceJson([id, null]), amps: [...channel.amps] };
  });
}

export function replayLoads(request: PowerReplayRequest, vertices: string[]): ReplayNetwork['loads'] {
  const loads = motorLoads(request);
  const motorIds = new Set(loads.map((load) => load.partId));
  const samples = loads[0].amps.length;
  const fixed = request.declarations.fixedLoads;
  const electrical = request.input.parts.filter(isElectricalPart);
  const unmodeled = electrical.filter(
    (part) => !motorIds.has(part.id) && electricalSourceJson([part.id, null]) !== vertices[0],
  );

  if (unmodeled.some((part) => actuatorOf(part.componentId ?? '', part.componentVariant)))
    throw new Error('Capture current for every actuator before replaying the rail.');

  for (const part of unmodeled) {
    const declaration = fixed[part.id];

    if (!declaration || !Number.isFinite(declaration.amps) || declaration.amps < 0 || !declaration.evidence?.trim())
      throw new Error('Declare current and evidence for every remaining electrical load.');

    loads.push({
      partId: part.id,
      jointId: null,
      node: electricalSourceJson([part.id, null]),
      amps: Array(samples).fill(declaration.amps),
    });
  }

  const declaredIds = new Set(unmodeled.map((part) => part.id));

  if (
    Object.keys(fixed).some((id) => !declaredIds.has(id)) ||
    loads.length > POWER_REPLAY_LIMITS.loads ||
    loads.some((load) => !vertices.includes(load.node))
  )
    throw new Error('Connect every declared load within one supported rail.');

  return loads;
}
