import type { BuildRecord } from '../kit/buildRecords';
import type { FrozenKit } from '../kit/frozenKit';
import type { GuidePlan } from '../guide/guideTypes';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { BuildAlongStep } from '../guide/buildAlong';
import type { BuildStepView, ViewShot } from '../three/viewport/types';

export interface Session {
  repairSession?: {
    record: import('../kit/buildRepairTypes').BuildRepairRecord;
    source: FrozenKit;
    target: FrozenKit;
    sourceParts: ScenePart[];
    targetParts: ScenePart[];
    revisions: Array<'source' | 'target'>;
  };
  cradleSource?: { id: number; plan: GuidePlan; parts: ScenePart[]; project: ProjectSettings };
  steps: BuildAlongStep[];
  stepParts: string[][];
  views: BuildStepView[];
  index: number;
  camera: ViewShot;
  frozen?: {
    record: BuildRecord;
    kit: FrozenKit;
    parts: ScenePart[];
    repair?: import('../kit/buildRepairTypes').BuildRepairRecord;
  };
}

export const stepView = (step: BuildAlongStep): BuildStepView => ({
  shown: step.shown,
  moves: step.moves,
  arrows: step.arrows,
  removing: step.repairPhase === 'remove',
  labels: step.servos.map((s) => ({ partId: s.partId, text: `${s.joint}, ID ${s.id}` })),
  routes: step.routes.flatMap((net) => (net.route?.points.length ? [{ points: net.route.points }] : [])),
});
