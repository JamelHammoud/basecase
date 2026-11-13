import { useEffect } from 'react';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { useLatestRef } from '../utils/useLatestRef';
import { devStudioApi, type DevActions } from './devStudioApi';
import { robotPackageZip } from './robotPackageExport';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface DevHookOptions {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  agent: AgentSession;
}

export function useDevStudioHook({ active, core, actions, agent }: DevHookOptions) {
  const { docs, viewportRef, setSelectedIds, posing, loadSeed } = core;
  const { partsRef, projectRef } = docs;
  const devRef = useLatestRef<DevActions>({
    importRobot: actions.robots.importRobotFrom,
    posing,
    load: (seed) => loadSeed(seed),
    poseTool: agent.requests.poseTool,
    simTool: agent.requests.simTool,
    clear: () => {
      docs.clearDocument();
      setSelectedIds([]);
    },
    select: (ids) => setSelectedIds(ids),
    simState: () => {
      const { sim, cases } = core.simTraining;
      const stats = sim.latestStats() ?? sim.stats;

      return {
        status: sim.status,
        playing: sim.playing,
        drive: sim.drive.status,
        driveClass: sim.drive.cls,
        offer: sim.drive.offer,
        stats,
        effector: stats?.effector ?? null,
        world: sim.worldParts.map((p) => p.id),
        bodies: sim.model?.bodies.map((b) => ({ parts: b.parts, world: b.world ?? [] })) ?? [],
        activeCase: cases.active?.id ?? null,
        tries: cases.tries.map((t) => ({ passed: t.passed, margin: t.margin })),
      };
    },
    routineState: () => core.simTraining.routines.state(),
    datasetFiles: async () => {
      const { cases } = core.simTraining;
      const made = await cases.dataset.build(cases.tries);

      return made && unzipSync(made.zip);
    },
    robotPackage: async () => {
      const made = await robotPackageZip(core);

      return made && { files: unzipSync(made.zip), simXml: (await core.simTraining.sim.buildModel()).xml };
    },
    guide: async () => {
      const made = await core.guide.generate();

      return made && { html: made.html, pages: made.record.pages, steps: made.record.steps };
    },
  });

  useEffect(() => {
    if (!import.meta.env.DEV || !active) return;

    (window as unknown as { __studio?: unknown }).__studio = devStudioApi({
      partsRef,
      projectRef,
      viewportRef,
      devRef,
    });
  }, [active, partsRef, projectRef, viewportRef, devRef]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const registry = ((window as unknown as { __studios?: Record<string, unknown> }).__studios ??= {});

    registry[core.workspaceId] = devStudioApi({ partsRef, projectRef, viewportRef, devRef });

    return () => {
      delete registry[core.workspaceId];
    };
  }, [core.workspaceId, partsRef, projectRef, viewportRef, devRef]);
}
