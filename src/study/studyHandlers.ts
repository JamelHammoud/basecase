import { supplyVolts } from '../cases/exploreDesigns';
import { buildMjcf } from '../sim/mjcf';
import { runEngineering } from '../utils/engineering';
import { buildRig } from '../utils/kinematicsRig';
import { reply } from '../utils/workerRpc';
import { refreshStudyGeometry } from './geometry';
import { createStudyGrader } from './grade';
import type { StudyGradeOptions, StudyHoldOptions } from './types';
import { StudyWireReader, type StudyPacket } from './wire';

export function createStudyHandlers() {
  const reader = new StudyWireReader();
  const grader = createStudyGrader();

  return {
    hold: ({ packet, options }: { packet: StudyPacket; options?: StudyHoldOptions }) => {
      if (typeof document !== 'undefined') throw new Error('Study simulation measurements need a worker.');

      const scene = reader.read(packet);
      const { joints, massG } = runEngineering({ ...scene, servoOutputs: scene.servoOutputs ?? {} });
      const model = buildMjcf({
        parts: scene.parts,
        rig: buildRig(scene.project.joints ?? [], scene.parts),
        project: scene.project,
        ...options,
        measures: scene.measures,
        servoVolts: supplyVolts(scene.parts, scene.project),
        partTriangles: (id) => scene.triangles[id] ?? null,
      });

      return reply({ report: { joints, massG }, model });
    },
    refresh: async ({ packet, changed }: { packet: StudyPacket; changed: string[] }) => {
      const scene = await refreshStudyGeometry(reader.read(packet), changed);

      return reply(reader.refreshed(scene, changed));
    },
    grade: ({ packet, options }: { packet: StudyPacket; options: StudyGradeOptions }) =>
      reply(grader.grade(reader.read(packet), options)),
  };
}

export type StudyHandlers = ReturnType<typeof createStudyHandlers>;
