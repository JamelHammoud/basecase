import type { SimModel } from '../mjcfTypes';
import type { Recording } from '../recorder';
import type { ContactReplay, PhysicsSample } from './contactReplay';

function namedBodyContacts(names: string[], bodies: Map<string, number>): number[] {
  const pairs: number[] = [];

  for (const name of names) {
    const [left, right] = name.split('\u0000');
    const a = bodies.get(left);
    const b = bodies.get(right);

    if (a === undefined || b === undefined || a === b) continue;

    pairs.push(Math.min(a, b), Math.max(a, b));
  }

  return pairs;
}

export function contactReplayRecording(replay: ContactReplay, samples: PhysicsSample[], model: SimModel): Recording {
  const timestep = Number(/<option[^>]*timestep="([^"]*)"/.exec(replay.xml)?.[1]);
  const bodyIds = model.bodies.map((body) => replay.bodyNames.indexOf(body.name));
  const bodyIndices = new Map(model.bodies.map((body, index) => [body.name, index]));
  const contacts: number[] = [];
  const offsets: number[] = [];

  if (!Number.isFinite(timestep) || timestep <= 0 || !samples.length || bodyIds.some((id) => id < 0))
    throw new Error('Replay needs a timestep, samples and every recorded body.');

  const poses = samples.flatMap((sample) => bodyIds.flatMap((id) => sample.poses.slice(id * 7, id * 7 + 7)));

  for (const sample of samples) {
    offsets.push(contacts.length);
    contacts.push(...namedBodyContacts(sample.contacts, bodyIndices));
  }

  offsets.push(contacts.length);

  return {
    dt: timestep * 10,
    frames: samples.length,
    nq: samples[0].qpos.length,
    nv: samples[0].qvel.length,
    nu: replay.controls[0].length,
    nbody: model.bodies.length,
    t: Float32Array.from(samples.map((sample) => sample.step * timestep)),
    ctrl: Float32Array.from(samples.flatMap((sample) => replay.controls[Math.max(sample.step - 1, 0)])),
    qpos: Float64Array.from(samples.flatMap((sample) => sample.qpos)),
    qvel: Float32Array.from(samples.flatMap((sample) => sample.qvel)),
    poses: Float32Array.from(poses),
    contacts: Int32Array.from(contacts),
    contactOffsets: Int32Array.from(offsets),
  };
}
