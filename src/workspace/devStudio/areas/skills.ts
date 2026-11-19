import { stubTabEngine } from '../../../skills/skillsPlatform';
import { trainerStub } from '../../trainerStub';
import type { Studio } from '../types';

export default function skillsStudio(studio: Studio) {
  return {
    pauseKitBackground: () => {
      const runtime = studio().core.simTraining.skills.runtime;

      runtime.planBackground = () => {};
    },
    stubTrainer: (policy: unknown, snapshots?: unknown[]) => {
      const { core, releaseTrainerRef } = studio();
      const stub = trainerStub(policy, snapshots);

      core.simTraining.skills.runtime.replaceForge(stub.forge, stub.snapshots);
      releaseTrainerRef.current = stub.release;
    },
    releaseTrainer: () => studio().releaseTrainerRef.current(),
    stressBudget: (budget: number) => studio().core.simTraining.skills.stress.setBudget(budget),
    stubTabEngine,
    publishedSkills: () => studio().core.simTraining.skillHub.candidates,
    skillBodyPosition: (part: string) => {
      const { core, posesRef } = studio();
      const model = core.simTraining.sim.modelNow();
      const body = model?.bodies.findIndex((b) => b.parts.includes(part)) ?? -1;
      const poses = posesRef.current;

      return body >= 0 && poses ? Array.from(poses.subarray(body * 7, body * 7 + 3)) : null;
    },
    stageSkillCase: (id: string) => studio().core.simTraining.cases.open(id),
  };
}
