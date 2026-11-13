import type { SimModel } from '../sim/mjcfTypes';
import type { Environment, MoveReference } from './environment';
import { kitJob, type KitJobOptions } from './kitJob';
import { neutralRad } from './kitModel';
import { moveReward } from './moveRewards';
import { lowestHeight } from './moveReference';

export type MoveJobOptions = Pick<KitJobOptions, 'minutes' | 'seed' | 'delaySteps' | 'delayRamp' | 'warmStart'>;

export function referenceOffsets(model: SimModel, reference: MoveReference): number[][] {
  const home = reference.joints.map((id) => neutralRad(model, id));

  return reference.frames.map((f) => [...home.map((h, j) => f[j] - h), ...f.slice(home.length)]);
}

function firstFrame(model: SimModel, reference: MoveReference) {
  const names = new Map(model.joints.map((j) => [j.id, j.name]));
  const first = reference.frames[0];

  return Object.fromEntries(reference.joints.map((id, j) => [names.get(id) ?? id, first[j]]));
}

export function moveJob(model: SimModel, environment: Environment, options: MoveJobOptions & { name: string }) {
  const reference = environment.reference;

  if (!reference) throw new Error('A move trains on a reference motion.');

  const { name, ...kit } = options;
  const start = { joints: firstFrame(model, reference), liftM: 0 };

  return {
    ...kitJob(model, 'stand', { ...kit, start, reward: moveReward(reference) }),
    name: `Move: ${name}`,
    actionScale: environment.action.scale,
    resetNoise: 0.05,
    episodeS: environment.horizonS,
    standHeight: lowestHeight(reference),
    pushes: false,
    reference: { loop: reference.loop, frames: referenceOffsets(model, reference) },
  };
}
