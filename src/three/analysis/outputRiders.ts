import { collide, place, type CollideOptions, type Placed } from './collide';
import { splitRotor } from './rotorSplit';

export type OutputRiders = Record<string, string[]>;

const CASE = '#case';
const servoOf = (id: string) => (id.endsWith(CASE) ? id.slice(0, -CASE.length) : id);

export function collideRiding(scene: Placed[], options: CollideOptions, riders: OutputRiders) {
  const cases: Placed[] = [];
  const riding = new Map<string, Set<string>>();

  for (const p of scene) {
    const split = riders[p.id] ? splitRotor(p.solid) : null;

    if (!split) continue;

    cases.push(place(p.id + CASE, split.stator, p.matrix));
    riding.set(p.id, new Set(riders[p.id]));
  }

  const wrongCopy = (id: string, other: string) => {
    const set = riding.get(servoOf(id));

    return !!set && id.endsWith(CASE) !== set.has(servoOf(other));
  };
  const skip = (a: string, b: string) => servoOf(a) === servoOf(b) || wrongCopy(a, b) || wrongCopy(b, a);
  const found = collide([...scene, ...cases], options, skip);

  return {
    interferences: found.interferences.map((f) => ({ ...f, a: servoOf(f.a), b: servoOf(f.b) })),
    coplanar: found.coplanar.map((c) => ({ ...c, a: servoOf(c.a), b: servoOf(c.b) })),
  };
}
