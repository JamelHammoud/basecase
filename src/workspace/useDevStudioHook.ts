import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { worldDeltas } from '../sim/mjcf';
import { codePanelsOf } from '../cases/console/codeEdits';
import { codePanelKey, codeReport } from '../cases/console/codeReports';
import { parseCase } from '../cases/schema';
import { loadRecording } from '../cases/tryStore';
import { withCalibration } from '../reality/projectCalibrations';
import { isPolicySpec } from '../sim/policy';
import { readyStand } from '../skills/hubSkillFixtures';
import { skillRecord, withRecord } from '../skills/skillRecords';
import { designOf } from '../skills/skillsRuntime';
import { exposesTestHooks } from '../utils/platform/testHooks';
import { useLatestRef } from '../utils/useLatestRef';
import { printDevActions } from './devPrintState';
import { devSimState } from './devSimState';
import { matDevActions } from './devMatFeed';
import { devStudioApi, type DevActions } from './devStudioApi';
import { robotPackageZip } from './robotPackageExport';
import { trainerStub } from './trainerStub';
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
  const releaseTrainer = useRef<() => void>(() => {});
  const jointsRef = useRef<Float64Array | null>(null);
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
    sketchPath: core.sketching.setPath,
    simState: () => devSimState(core, jointsRef.current),
    drive: (command) => core.simTraining.sim.drive.setKeys(command),
    driveWith: (inputs) => core.simTraining.sim.drive.start(undefined, { inputs }),
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
    tryWorld: async () => {
      const newest = projectRef.current.tries?.at(-1);

      return (newest && (await loadRecording(newest.id))?.world) ?? [];
    },
    calibrate: (jointId, calibration) => docs.setProject((p) => withCalibration(p, jointId, calibration)),
    routineState: () => core.simTraining.routines.state(),
    ...printDevActions(core),
    datasetFiles: async () => {
      const { cases } = core.simTraining;
      const zip = await cases.dataset.zip(cases.tries);

      return zip && unzipSync(zip);
    },
    addCase: (raw) => core.simTraining.cases.add(parseCase(raw)).id,
    runCase: (id) => {
      core.simTraining.cases.open(id);
      core.caseRun.enterCase(id);
    },
    codeReports: () => {
      const kase = core.simTraining.cases.active;

      return Object.fromEntries(
        codePanelsOf(kase?.console).map((p) => [p.id, codeReport(codePanelKey(kase!.id, p.id), p.source)]),
      );
    },
    referenceTry: () => core.simTraining.cases.attempt.reference(),
    passTries: () => docs.setProject((p) => ({ ...p, tries: (p.tries ?? []).map((t) => ({ ...t, passed: true })) })),
    multiplyRuns: (runs) => core.simTraining.cases.multiply.setRuns(runs),
    sharedLink: () => core.simTraining.share.link,
    stubTrainer: (policy, snapshots) => {
      const stub = trainerStub(policy, snapshots);

      core.simTraining.skills.runtime.replaceForge(stub.forge, stub.snapshots);
      releaseTrainer.current = stub.release;
    },
    releaseTrainer: () => releaseTrainer.current(),
    plantStand: async (policy) => {
      if (!isPolicySpec(policy)) throw new Error('plantStand takes a policy.');

      const model = await core.simTraining.skills.buildModel();
      const skill = readyStand(model, designOf(model), policy);

      docs.setProject((p) => ({ ...p, skills: withRecord(p.skills ?? [], skillRecord(skill, { kit: 'stand' })) }));

      return JSON.stringify(skill);
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
    mat: matDevActions(core),
  });

  useEffect(() => {
    if (!exposesTestHooks() || !active) return;

    return subscribePoses((poses, frame) => {
      posesRef.current = poses;
      jointsRef.current = frame.joints;
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
