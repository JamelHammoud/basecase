import type { StudySourcingSnapshot, StudySourcingRequirements, sourcingUnchanged } from './sourcing';
import type { Purchases } from '../types/robotics';
import { workerClient } from '../utils/workerRpc';
import type { StudyHandlers } from './studyHandlers';
import type { StudyGradeOptions, StudyHoldInput, StudyHoldOptions, StudyRow, StudyScene } from './types';
import { studyFingerprint } from './study';
import { StudyWireWriter } from './wire';

export interface StudySession {
  captureSourcing: (input: {
    requirements: StudySourcingRequirements;
    purchases: Purchases;
    evaluatedAt: string;
  }) => Promise<StudySourcingSnapshot>;
  validatePurchasing: (input: Parameters<typeof sourcingUnchanged>[0]) => Promise<boolean>;
  grade: (scene: StudyScene, options: StudyGradeOptions) => Promise<StudyRow>;
  refresh: (scene: StudyScene, changed: string[], triangleLimit?: number) => Promise<StudyScene>;
  hold: (scene: StudyScene, options?: StudyHoldOptions) => Promise<StudyHoldInput>;
  dispose: () => void;
}

export function createStudySession(): StudySession {
  const writer = new StudyWireWriter();
  let local: Promise<StudyHandlers> | null = null;
  let closed = false;
  const assertOpen = () => {
    if (closed) throw new Error('The Study worker stopped.');
  };
  const client = workerClient<StudyHandlers>(
    () => new Worker(new URL('./study.worker.ts', import.meta.url), { type: 'module' }),
    () => {
      if (typeof document !== 'undefined')
        return Promise.reject(new Error('Study couldn’t start its worker. Run Study again.'));

      local ??= import('./studyHandlers').then((module) => module.createStudyHandlers());

      return local;
    },
  );

  return {
    captureSourcing: async (input) => {
      assertOpen();

      return client.call('captureSourcing', input);
    },
    validatePurchasing: async (input) => {
      assertOpen();

      return client.call('validatePurchasing', input);
    },
    grade: async (scene, options) => {
      assertOpen();

      const row = await client.call('grade', {
        packet: writer.write(scene),
        options: scene.sourcing ? { ...options, purchases: undefined } : options,
      });

      return { ...row, sceneKey: studyFingerprint(scene.parts, scene.project) };
    },
    refresh: async (scene, changed, triangleLimit) => {
      assertOpen();

      return writer.refreshed(
        scene,
        await client.call('refresh', { packet: writer.write(scene), changed, triangleLimit }),
      );
    },
    hold: async (scene, options) => {
      assertOpen();

      return client.call('hold', { packet: writer.write(scene), options });
    },
    dispose: () => {
      closed = true;
      client.dispose();
    },
  };
}

let shared: StudySession | null = null;

const session = () => (shared ??= createStudySession());

export const gradeStudyIn = (scene: StudyScene, options: StudyGradeOptions) => session().grade(scene, options);
export const refreshStudyGeometryIn = (scene: StudyScene, changed: string[]) => session().refresh(scene, changed);
export const studyHoldInputsIn = (scene: StudyScene, options?: StudyHoldOptions) => session().hold(scene, options);
export const disposeStudyWorker = () => {
  shared?.dispose();
  shared = null;
};
