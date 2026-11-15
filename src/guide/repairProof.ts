import type { AssemblyGeometry } from '../assembly/assemblyGeometry';
import { AXES } from '../assembly/moveBlockers';
import type { RemovalStep } from '../assembly/removalOrder';
import { clampingScrews, indexFasteners, type FastenerIndex } from '../assembly/fastenerIndex';
import { normalize } from './guideMath';
import type { GuideStep, V3 } from './guideTypes';

interface RepairProof {
  geometry: AssemblyGeometry;
  target: string;
  removal: RemovalStep[];
  initial: string[];
}

interface ProofContext extends RepairProof {
  fasteners: FastenerIndex;
}

const sameDirection = (a: V3, b: V3) => normalize(a).every((v, i) => Math.abs(v - normalize(b)[i]) < 1e-6);

function clearForAction(proof: ProofContext, action: RemovalStep, step: GuideStep, present: Set<string>): boolean {
  const g = proof.geometry;
  const added = new Set(action.ids);
  const clear = (id: string) => !present.has(id) || added.has(id);

  if (!action.ids.every((id) => step.partIds.includes(id))) return false;

  if (action.kind === 'screw') return (g.drivers[action.ids[0]] ?? []).some((way) => way.blockers.every(clear));

  const majors = action.ids.filter((id) => g.moves[id]);
  const pinned = clampingScrews(proof.fasteners, majors).some((chain) => !clear(chain.id));

  if (pinned) return false;

  const offset = step.moves.find((move) => action.ids.includes(move.partId))?.offset;

  if (!offset) return false;

  if (action.kind === 'unit') {
    const axis = AXES.findIndex((dir) => sameDirection(dir, offset));

    return axis >= 0 && majors.every((id) => !!g.moves[id].local[axis] && g.moves[id].local[axis].every(clear));
  }

  const motion = g.moves[majors[0]];
  const axis = motion.dirs.findIndex((dir) => sameDirection(dir, offset));
  const paths = majors.includes(proof.target) ? motion.exit : motion.local;

  return !!paths?.[axis] && paths[axis].every(clear);
}

export function provesReassembly(proof: RepairProof, steps: GuideStep[]): boolean {
  const ctx: ProofContext = { ...proof, fasteners: indexFasteners(proof.geometry.chains.screws) };
  const present = new Set(proof.initial);
  const owner = new Map(proof.removal.flatMap((action) => action.ids.map((id) => [id, action] as const)));

  for (const step of steps) {
    const actions = proof.removal.filter((action) => step.partIds.some((id) => owner.get(id) === action)).reverse();

    for (const action of actions) {
      if (!clearForAction(ctx, action, step, present)) return false;

      action.ids.forEach((id) => present.add(id));
    }
  }

  return true;
}
