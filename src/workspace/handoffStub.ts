import { PROOF_SEEDS } from '../routines/physicsProver';
import type { TransitionProof } from '../routines/schema';
import { skillHash, type Skill } from '../skills/artifacts';
import { ownId, type OwnSkill } from './routineCheck';
import type { SceneRoutineSkills } from './useRoutineSkills';

export interface HandoffStub {
  skills: Skill[];
  falls: number;
}

export interface HandoffPorts {
  skills: SceneRoutineSkills;
  prove: (modelHash: string) => TransitionProof | null;
  train: (to: string, modelHash: string) => Promise<{ skill: Skill; proof: TransitionProof; target: OwnSkill } | null>;
}

const owned = (skill: Skill): OwnSkill => ({ hash: skillHash(skill), skill, record: null });

export function stubbedPorts(stub: HandoffStub, project: SceneRoutineSkills): HandoffPorts {
  const list = stub.skills.map(owned);
  const own = () => Promise.resolve([...list]);
  const skills: SceneRoutineSkills = {
    own,
    handoffs: project.handoffs,
    trainable: (found) => found.map(ownId),
    replace: (old, skill) => list.splice(list.indexOf(old), 1, owned(skill)),
  };

  return {
    skills,
    prove: (modelHash) => ({ seeds: PROOF_SEEDS, falls: stub.falls, modelHash }),
    train: async (to, modelHash) => {
      const target = list.find((o) => ownId(o) === to);

      if (!target) return null;

      return {
        skill: { ...target.skill, warmStartFrom: target.hash },
        proof: { seeds: PROOF_SEEDS, falls: 0, modelHash },
        target,
      };
    },
  };
}
