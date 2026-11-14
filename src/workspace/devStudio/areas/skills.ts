import { stubTabEngine } from '../../../skills/skillsPlatform';
import { trainerStub } from '../../trainerStub';
import type { Studio } from '../types';

export default function skillsStudio(studio: Studio) {
  return {
    stubTrainer: (policy: unknown, snapshots?: unknown[]) => {
      const { core, releaseTrainerRef } = studio();
      const stub = trainerStub(policy, snapshots);

      core.simTraining.skills.runtime.replaceForge(stub.forge, stub.snapshots);
      releaseTrainerRef.current = stub.release;
    },
    releaseTrainer: () => studio().releaseTrainerRef.current(),
    stubTabEngine,
  };
}
