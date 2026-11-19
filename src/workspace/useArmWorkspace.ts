import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { SimModel } from '../sim/mjcfTypes';
import { workspaceValues, WORKSPACE_BUDGET, type WorkspaceSamples } from '../skills/armWorkspace';
import { ArmWorkspaceSession } from '../skills/armWorkspaceSession';
import type { V3 } from '../utils/kinematics';
import { errorMessage } from '../utils/errorMessage';
import { useLatestRef } from '../utils/useLatestRef';
import type { WorkspaceCore } from './useWorkspaceCore';
import type { ScenePart } from '../types/robotics';
import { workspaceTarget } from './armWorkspaceTarget';
import { assertWorkspacePose } from './armWorkspacePose';

interface Inspection {
  source: ReturnType<typeof workspaceSource>;
  part: string;
  point: V3;
  budget: number;
  model: SimModel | null;
  samples: WorkspaceSamples | null;
  selected: number | null;
  busy: boolean;
  problem: string | null;
}

function workspaceSource(core: WorkspaceCore) {
  return {
    parts: core.parts,
    project: core.project,
    scene: core.scene.sceneId,
    world: core.simTraining.sim.worldParts,
    guests: core.simTraining.sim.guestParts,
    tool: core.selectedIds.length === 1 ? core.selectedIds[0] : null,
    status: core.simTraining.sim.status,
    active: core.active,
    playing: !!core.posing.playback?.playing,
  };
}

function sameSource(a: Inspection['source'], b: Inspection['source']) {
  return (
    a.parts === b.parts &&
    a.project === b.project &&
    a.scene === b.scene &&
    a.world === b.world &&
    a.guests === b.guests &&
    a.tool === b.tool &&
    a.status === b.status &&
    a.active === b.active &&
    a.playing === b.playing
  );
}

function initialInspection(core: WorkspaceCore, part: ScenePart): Inspection {
  return {
    source: workspaceSource(core),
    part: part.id,
    point: [...part.position],
    budget: WORKSPACE_BUDGET,
    model: null,
    samples: null,
    selected: null,
    busy: true,
    problem: null,
  };
}

function useInspectionLifecycle(core: WorkspaceCore, source: Inspection['source'], session: ArmWorkspaceSession) {
  const generationRef = useRef(0);
  const preparationRef = useRef<AbortController | null>(null);
  const previewedRef = useRef(false);
  const latestRef = useLatestRef(core);
  const restore = useEffectEvent(() => {
    if (!previewedRef.current) return;

    previewedRef.current = false;
    core.posing.previewPose(core.posing.pose ?? { values: {} });
  });

  useLayoutEffect(
    () => () => {
      generationRef.current++;
      session.cancel();
      preparationRef.current?.abort();
      restore();
    },
    [
      session,
      source.parts,
      source.project,
      source.world,
      source.guests,
      source.tool,
      source.scene,
      source.active,
      source.status,
      source.playing,
    ],
  );

  useLayoutEffect(() => {
    if (core.tool.transformMode === 'pose' && core.tool.rightTab === 'pose') return;

    generationRef.current++;
    session.cancel();
    preparationRef.current?.abort();
    restore();
  }, [core.tool.transformMode, core.tool.rightTab, session]);

  return { generationRef, preparationRef, previewedRef, latestRef };
}

export function useArmWorkspace(core: WorkspaceCore) {
  const [session] = useState(() => new ArmWorkspaceSession());
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [preview, setPreview] = useState<Record<string, number> | null>(null);
  const source = workspaceSource(core);
  const { generationRef, preparationRef, previewedRef, latestRef } = useInspectionLifecycle(core, source, session);
  const inPose = core.tool.transformMode === 'pose' && core.tool.rightTab === 'pose';
  const view = inspection && inPose && sameSource(inspection.source, source) ? inspection : null;

  if (inspection && (!inPose || !sameSource(inspection.source, source))) {
    setInspection(null);
    setPreview(null);
  }

  const selectedPart = core.parts.find((p) => p.id === source.tool);
  const canInspect =
    !!selectedPart &&
    !!core.posing.rig.ownerOf.get(selectedPart.id) &&
    core.simTraining.sim.status === 'off' &&
    !source.playing;
  const close = () => {
    generationRef.current++;
    session.cancel();
    preparationRef.current?.abort();

    if (previewedRef.current) core.posing.previewPose(core.posing.pose ?? { values: {} });

    previewedRef.current = false;
    setInspection(null);
    setPreview(null);
  };
  const current = (request: Inspection, token: number) =>
    token === generationRef.current && sameSource(request.source, workspaceSource(latestRef.current));
  const sample = async (request: Inspection) => {
    const token = ++generationRef.current;

    session.cancel();
    preparationRef.current?.abort();

    const controller = new AbortController();

    preparationRef.current = controller;

    if (previewedRef.current) core.posing.previewPose(core.posing.pose ?? { values: {} });

    previewedRef.current = false;
    setInspection({ ...request, samples: null, selected: null, busy: true, problem: null });
    setPreview(null);

    try {
      assertWorkspacePose(core.posing.rig, core.posing.pose);

      const model = request.model ?? (await core.simTraining.sim.buildModel({ signal: controller.signal }));

      if (!current(request, token)) return;

      const samples = await session.sample(model, { part: request.part, point: request.point, budget: request.budget });

      if (current(request, token))
        setInspection({ ...request, model, samples, selected: null, busy: false, problem: null });
    } catch (error) {
      if (current(request, token))
        setInspection({ ...request, samples: null, selected: null, busy: false, problem: errorMessage(error) });
    }
  };
  const open = () => {
    if (!canInspect || !selectedPart) return;

    core.tool.setMode('pose');
    void sample(initialInspection(core, selectedPart));
  };
  const select = (index: number) => {
    if (!view?.samples || view.busy) return;

    const values = workspaceValues(view.samples, index);

    previewedRef.current = true;
    core.posing.previewPose({ ...core.posing.pose, values });
    setPreview(values);
    setInspection({ ...view, selected: index });
  };
  const plan = async () => {
    if (!view?.samples || !view.model || view.selected === null || view.busy) return;

    const token = ++generationRef.current;
    const values = workspaceValues(view.samples, view.selected);

    setInspection({ ...view, busy: true, problem: null });

    try {
      const result = await session.plan(view.model, { parts: [view.part], keys: [{ t: 8, values }], horizonS: 10 });

      if (!current(view, token)) return;

      if (!result.controller || result.controller.kind !== 'animation') {
        setInspection({ ...view, busy: false, problem: result.reason });

        return;
      }

      close();
      core.posing.addAnimation(
        workspaceTarget(result.controller.animation, core.posing.animations, core.posing.robot?.group.key),
      );
      core.tool.openRightTab('sim');
    } catch (error) {
      if (current(view, token)) setInspection({ ...view, busy: false, problem: errorMessage(error) });
    }
  };

  return {
    canInspect,
    view,
    preview,
    open,
    close,
    select,
    plan: () => void plan(),
    resample: (point: V3, budget: number) => {
      if (view) void sample({ ...view, point, budget });
    },
  };
}

export type ArmWorkspace = ReturnType<typeof useArmWorkspace>;
