import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { worldDeltas } from '../sim/mjcf';
import { parseCase } from '../cases/schema';
import { withCalibration } from '../reality/projectCalibrations';
import { isPolicySpec } from '../sim/policy';
import { exposesTestHooks } from '../utils/platform/testHooks';
import { useLatestRef } from '../utils/useLatestRef';
import { devSimState } from './devSimState';
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
  routeFiles: (files: File[]) => void;
}

export function useDevStudioHook({ active, core, actions, agent, routeFiles }: DevHookOptions) {
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
    agentRequest: agent.requests.request,
    clear: () => {
      docs.clearDocument();
      setSelectedIds([]);
    },
    select: (ids) => setSelectedIds(ids),
    dragSkeleton: (step) => {
      core.skeleton.drag({ ...step, phase: 'start' });
      core.skeleton.drag({ ...step, phase: 'move' });
      core.skeleton.drag({ ...step, phase: 'end' });
    },
    dropFiles: routeFiles,
    selection: () => core.selectedIds,
    selectFace: core.sketching.selectFace,
    simState: () => devSimState(core),
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
    printPlates: () => ({
      open: !!core.printing.mode,
      fitTest: !!core.printing.fitTest,
      plates: (core.printing.report?.plan.plates ?? []).map((p) => p.items.map((it) => it.id)),
    }),
    datasetFiles: async () => {
      const { cases } = core.simTraining;
      const zip = await cases.dataset.zip(cases.tries);

      return zip && unzipSync(zip);
    },
    addCase: (raw) => core.simTraining.cases.add(parseCase(raw)).id,
    referenceTry: () => core.simTraining.cases.attempt.reference(),
    passTries: () => docs.setProject((p) => ({ ...p, tries: (p.tries ?? []).map((t) => ({ ...t, passed: true })) })),
    sharedLink: () => core.simTraining.share.link,
    stubTrainer: (policy) => {
      if (!isPolicySpec(policy)) throw new Error('stubTrainer takes a policy.');

      core.simTraining.skills.runtime.replaceForge(
        () => () => Promise.resolve({ ok: true, policy, events: [{ type: 'done', steps: 1 }], stderr: '' }),
      );
    },
    stubHandoffs: (stub) => core.simTraining.routines.handoffs.stub(stub),
    plantHandoff: (from, to, falls) => core.simTraining.routines.handoffs.plant({ from, to }, falls),
    robotPackage: async () => {
      const made = await robotPackageZip(core);

      return made && { files: unzipSync(made.zip), simXml: (await core.simTraining.sim.buildModel()).xml };
    },
    guide: async () => {
      const made = await core.guide.generate();

      return made && { html: made.html, pages: made.record.pages, steps: made.record.steps };
    },
    buildAlongSteps: () => core.buildAlong.steps,
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
