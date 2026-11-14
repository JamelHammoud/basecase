import type { RequestContext } from './agentRequestHandlers';
import type { TryTimeline } from './useTryTimeline';
import type { SceneDocument } from './useSceneDocument';
import type { WorkspaceCore } from './useWorkspaceCore';

type PartWriters = Pick<RequestContext, 'insertParts' | 'replaceParts'>;

type SimSources = Pick<
  RequestContext,
  'routines' | 'cases' | 'caseCompare' | 'caseExplore' | 'caseRun' | 'skills' | 'tryRead'
>;

export const partWriters = ({ commitParts, updateProjectNow }: SceneDocument): PartWriters => ({
  insertParts: (parts, joints) => {
    commitParts((prev) => [...prev, ...parts]);
    updateProjectNow((p) => ({ ...p, joints: [...(p.joints ?? []), ...joints] }));
  },
  replaceParts: (parts, joints) => {
    commitParts(() => parts);
    updateProjectNow((p) => ({ ...p, joints }));
  },
});

export const simSources = (core: WorkspaceCore, timeline: () => TryTimeline): SimSources => ({
  routines: core.simTraining.routines,
  cases: core.simTraining.cases,
  caseCompare: core.caseCompare,
  caseExplore: core.caseExplore,
  caseRun: core.caseRun,
  skills: core.simTraining.skills,
  tryRead: {
    timeline,
    model: core.simTraining.sim.modelNow,
    rig: () => core.posing.rig,
    sought: core.simTraining.sim.sought,
  },
});
