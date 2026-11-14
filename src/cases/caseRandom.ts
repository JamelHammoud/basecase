import { drawInstance, seededRandom, type Instance, type Random } from '../skills/arenaWorld';
import type { Randomization } from '../skills/environment';
import { sha256Hex } from '../skills/hash';
import { footprint, jitteredFurniture } from './roomJitter';
import type { Case, WorldObject } from './schema';

export const CASE_RANDOMIZATION: Randomization = Object.freeze({
  friction: [0.8, 1.2],
  mass: [0.9, 1.1],
  strength: [0.9, 1],
  latencyMs: [0, 20],
}) as Randomization;

export const OBJECT_JITTER_MM = 15;

export const caseRandom = (seed: number): Random => seededRandom(sha256Hex(`case-run|${seed}`));

export const worldRandom = (seed: number): Random => caseRandom(-seed - 1);

interface InstanceOptions {
  randomization: Randomization;
  bodies: number;
  joints?: number;
  jointNoiseDeg?: number;
}

export const caseInstance = (random: Random, options: InstanceOptions): Instance =>
  drawInstance(random, {
    ranges: { ...options.randomization, jointNoiseDeg: options.jointNoiseDeg ?? 0, baseYawDeg: 0, baseOffsetMm: 0 },
    bodies: options.bodies,
    joints: options.jointNoiseDeg ? (options.joints ?? 0) : 0,
  });

const nudge = (random: Random) => (2 * random() - 1) * OBJECT_JITTER_MM;

const scanned = (o: WorldObject) => o.behavior === 'static' && !!o.jitter;

export function jitteredWorld(kase: Case, random: Random, { spots = false } = {}): Case {
  const fixed = kase.world.objects.filter((o) => o.behavior === 'static' && !o.jitter).map(footprint);
  const objects = kase.world.objects.map((o) => {
    if (scanned(o)) return jitteredFurniture(o, fixed, random);

    if (o.behavior === 'static' || (o.behavior === 'marker' && !spots)) return o;

    const [x, y, z] = o.position;

    return { ...o, position: [x + nudge(random), y, z + nudge(random)] as typeof o.position };
  });

  return { ...kase, world: { ...kase.world, objects } };
}
