import type { Controller, SimEngine } from '../sim/engine';
import type { ForceChannel, ForceEvidence } from '../sim/contactForces';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { hashOf, sha256Hex } from '../skills/hash';
import { caseSlots, type Case, type CaseProbe } from './schema';

export const forceProbe = (probe: CaseProbe) => probe.kind === 'grip-force' || probe.kind === 'grip-force-peak';

export const forceCaseKey = (kase: Case) => hashOf(kase);
export const forceModelKey = (model: SimModel) => sha256Hex(model.xml);

function channelFor(
  probe: CaseProbe,
  input: { kase: Case; model: SimModel; grippers: Record<string, string[]> },
): ForceChannel {
  const { kase, model, grippers } = input;
  const hand = typeof probe.from === 'object' && 'effector' in probe.from ? probe.from.effector : caseSlots(kase)[0].id;
  const joints = grippers[hand] ?? [];
  const jawJoints = probe.jaw === undefined ? joints : joints.slice(probe.jaw, probe.jaw + 1);
  const object = typeof probe.to === 'object' && 'object' in probe.to ? probe.to.object : '';

  return {
    signal: probe.signal,
    jaws: model.bodies.flatMap((body, i) => (jawJoints.includes(body.joint ?? '') ? [i] : [])),
    target: model.bodies.flatMap((body, i) => (body.world?.includes(object) ? [i] : [])),
    peak: probe.kind === 'grip-force-peak',
    ...(probe.ceilingN === undefined ? {} : { ceilingN: probe.ceilingN }),
  };
}

export function caseForceEvidence(
  kase: Case,
  model: SimModel,
  grippers: Record<string, string[]>,
): ForceEvidence | null {
  const probes = kase.task.probes.filter(forceProbe);

  if (!probes.length) return null;

  const channels = probes.map((probe) => channelFor(probe, { kase, model, grippers }));

  if (channels.some((channel) => !channel.jaws.length || !channel.target.length)) return null;

  return { version: 1, caseKey: forceCaseKey(kase), modelKey: forceModelKey(model), channels };
}

export function driveGrippers(kase: Case, controller: Controller): Record<string, string[]> {
  if (controller.kind !== 'drive') return {};

  const setup = controller.setup;
  const members = setup.kind === 'team' ? setup.members : [{ slot: 0, setup }];
  const slots = caseSlots(kase);

  return Object.fromEntries(
    members.map(({ slot, setup: member }) => [
      slots[slot]?.id ?? '',
      member.kind === 'arm' ? (member.grip?.jaws.map((jaw) => jaw.joint) ?? []) : [],
    ]),
  );
}

export function observeCaseForces(engine: SimEngine, kase: Case, grippers: Record<string, string[]>) {
  engine.observeForces(caseForceEvidence(kase, engine.sim, grippers));
}

export function recordedForceReader(input: { recording: Recording; kase: Case; model: SimModel }) {
  const { recording: r, kase, model } = input;
  const evidence = r.forceEvidence;
  const valid =
    evidence?.version === 1 && evidence.caseKey === forceCaseKey(kase) && evidence.modelKey === forceModelKey(model);

  return (frame: number): Record<string, number> => {
    if (!valid || !r.contactForce || !r.contactForcePeak) return {};

    const channels = evidence.channels;

    return Object.fromEntries(
      channels.map((c, i) => [c.signal, (c.peak ? r.contactForcePeak! : r.contactForce!)[frame * channels.length + i]]),
    );
  };
}
