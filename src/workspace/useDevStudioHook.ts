import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Controller } from '../sim/engine';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { worldDeltas } from '../sim/mjcf';
import { withCalibration } from '../reality/projectCalibrations';
import { isPolicySpec } from '../sim/policy';
import { modelFingerprints } from '../sim/policyFreshness';
import { exposesTestHooks } from '../utils/platform/testHooks';
import { useLatestRef } from '../utils/useLatestRef';
import { devStudioApi, type DevActions } from './devStudioApi';
import { robotPackageZip } from './robotPackageExport';
import type { AgentSession } from './useAgentSession';
import type { WorkspaceActions } from './useWorkspaceActions';
import type { WorkspaceCore } from './useWorkspaceCore';

const controllerState = (c: Controller) => ({
  kind: c.kind,
  clock: c.kind === 'policy' ? (c.policy.clock ?? null) : null,
});

interface DevHookOptions {
  active: boolean;
  core: WorkspaceCore;
  actions: WorkspaceActions;
  agent: AgentSession;
}

export function useDevStudioHook({ active, core, actions, agent }: DevHookOptions) {
  const { docs, viewportRef, setSelectedIds, posing, loadSeed } = core;
  const { partsRef, projectRef } = docs;
  const { subscribePoses } = core.simTraining.sim;
  const posesRef = useRef<Float64Array | null>(null);
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
    selectFace: core.sketching.selectFace,
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
        faults: Object.fromEntries(stats?.joints.flatMap((j) => (j.fault ? [[j.id, j.fault]] : [])) ?? []),
        tries: cases.tries.map((t) => ({ passed: t.passed, margin: t.margin, faults: t.manifest.faults ?? [] })),
        fingerprints: modelFingerprints(core.simTraining.skills.model),
        controller: controllerState(sim.controller),
      };
    },
    drive: (command) => core.simTraining.sim.drive.setKeys(command),
    worldAt: () => {
      const { model, worldParts } = core.simTraining.sim;
      const deltas = model && posesRef.current ? worldDeltas(model, posesRef.current) : new Map();

      return Object.fromEntries(
        worldParts.map((p) => {
          const at = new THREE.Vector3(...p.position).applyMatrix4(deltas.get(p.id) ?? new THREE.Matrix4());

          return [p.id, at.toArray()];
        }),
      );
    },
    calibrate: (jointId, calibration) => docs.setProject((p) => withCalibration(p, jointId, calibration)),
    routineState: () => core.simTraining.routines.state(),
    printState: () => ({
      open: !!core.printing.mode,
      printer: core.printing.printer.model.id,
      bed: core.printing.report?.plan.bed ?? null,
    }),
    datasetFiles: async () => {
      const { cases } = core.simTraining;
      const zip = await cases.dataset.zip(cases.tries);

      return zip && unzipSync(zip);
    },
    passTries: () => docs.setProject((p) => ({ ...p, tries: (p.tries ?? []).map((t) => ({ ...t, passed: true })) })),
    sharedLink: () => core.simTraining.share.link,
    stubTrainer: (policy) => {
      if (!isPolicySpec(policy)) throw new Error('stubTrainer takes a policy.');

      core.simTraining.skills.runtime.replaceForge(
        () => () => Promise.resolve({ ok: true, policy, events: [{ type: 'done', steps: 1 }], stderr: '' }),
      );
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
    if (!exposesTestHooks() || !active) return;

    return subscribePoses((poses) => {
      posesRef.current = poses;
    });
  }, [active, subscribePoses]);

  useEffect(() => {
    if (!exposesTestHooks() || !active) return;

    (window as unknown as { __studio?: unknown }).__studio = devStudioApi({
      partsRef,
      projectRef,
      viewportRef,
      devRef,
    });
  }, [active, partsRef, projectRef, viewportRef, devRef]);

  useEffect(() => {
    if (!exposesTestHooks()) return;

    const registry = ((window as unknown as { __studios?: Record<string, unknown> }).__studios ??= {});

    registry[core.workspaceId] = devStudioApi({ partsRef, projectRef, viewportRef, devRef });

    return () => {
      delete registry[core.workspaceId];
    };
  }, [core.workspaceId, partsRef, projectRef, viewportRef, devRef]);
}
