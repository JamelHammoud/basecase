import { navigateFrozenHistory } from './frozenBuildSession';
import { canRecordRepair } from '../kit/buildRepairState';
import { useFrozenBuildAlong } from './useFrozenBuildAlong';
import { stepView, type Session } from './buildAlongSession';
import { localBuilds } from '../kit/buildRecords';
import type { ShowToast } from './types';
import { useRef, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { buildAlongSteps } from '../guide/buildAlong';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { BuildGuide } from './useBuildGuide';
import type { GuidePlan } from '../guide/guideTypes';
import type { WiringScene } from '../wiring/netlist';

interface BuildAlongOptions {
  guide: BuildGuide;
  showToast: ShowToast;
  projectRef: RefObject<ProjectSettings>;
  partsRef: RefObject<ScenePart[]>;
  viewportRef: RefObject<Viewport3DHandle | null>;
}

const sameRoutingProject = (before: ProjectSettings, after: ProjectSettings) =>
  before.joints === after.joints &&
  before.wiring === after.wiring &&
  before.extras === after.extras &&
  before.tether === after.tether;

async function planWiring(viewport: Viewport3DHandle | null, plan: GuidePlan | null, scene: WiringScene) {
  if (!viewport || !plan || plan.repair) return null;

  return viewport.wiring(scene).catch(() => null);
}

function buildAlongSource(session: Session | null) {
  if (!session?.cradleSource)
    return { sessionId: 0, plan: null, sourceStep: null, sourceParts: null, sourceProject: null };

  return {
    sessionId: session.cradleSource.id,
    plan: session.cradleSource.plan,
    sourceStep: session.cradleSource.plan.steps[session.index],
    sourceParts: session.cradleSource.parts,
    sourceProject: session.cradleSource.project,
  };
}

export function useBuildAlong({ guide, showToast, partsRef, projectRef, viewportRef }: BuildAlongOptions) {
  const [session, setSession] = useState<Session | null>(null);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(0);
  const [repairing, setRepairing] = useState(false);
  const [creating, setCreating] = useState(false);

  const openPlan = async (source: () => Promise<GuidePlan | null>) => {
    const run = ++openingRef.current;
    const camera = session?.camera ?? viewportRef.current?.currentView();

    setSession(null);
    setOpening(true);

    const parts = partsRef.current;
    const project = projectRef.current;
    const plan = await source().catch(() => null);

    if (run !== openingRef.current) return null;

    const wiring = await planWiring(viewportRef.current, plan, { parts, project });

    if (run !== openingRef.current) return null;

    setOpening(false);

    if (
      !plan?.steps.length ||
      !camera ||
      parts !== partsRef.current ||
      !sameRoutingProject(project, projectRef.current)
    )
      return null;

    const nets = wiring ? [...wiring.buses.flatMap((bus) => bus.nets), ...wiring.power.nets] : [];
    const steps = buildAlongSteps(plan, project.joints ?? [], nets);

    setSession({
      cradleSource: { id: run, plan, parts, project: projectRef.current },
      steps,
      stepParts: plan.steps.map((s) => s.partIds),
      views: steps.map(stepView),
      index: 0,
      camera,
    });
    viewportRef.current?.frameAll();

    return plan;
  };

  const open = () => (session || opening ? Promise.resolve(null) : openPlan(guide.currentPlan));

  const close = () => {
    openingRef.current++;
    setOpening(false);

    if (session) viewportRef.current?.lookThrough(session.camera);

    setSession(null);
  };

  const { openFrozen, saveProgress, saving } = useFrozenBuildAlong({
    session,
    setSession,
    openingRef,
    setOpening,
    viewportRef,
    showToast,
  });
  const go = (delta: number) => {
    if (!session?.steps.length) return;

    const repair = session?.frozen?.repair;

    if (session?.frozen?.record.repairs?.length && !canRecordRepair(session.frozen.record, repair)) {
      setSession((current) => current && navigateFrozenHistory(current, delta));

      return;
    }

    if (repair) {
      void saveProgress((record) =>
        localBuilds.navigateRepair(record.id, repair.id, Math.min(repair.count - 1, Math.max(0, repair.index + delta))),
      );

      return;
    }

    if (session?.frozen) {
      void saveProgress((record) =>
        localBuilds.navigate(record.id, Math.min(record.count - 1, Math.max(0, record.index + delta))),
      );

      return;
    }

    setSession((s) => s && { ...s, index: Math.min(s.steps.length - 1, Math.max(0, s.index + delta)) });
  };
  const complete = () =>
    saveProgress((record) => {
      const repair = session?.frozen?.repair;
      const step = session?.index ?? 0;

      if (repair)
        return localBuilds.repairAction({
          id: record.id,
          repair: repair.id,
          step,
          complete: !repair.completed[String(step)],
        });

      return localBuilds.complete(record.id, step, !record.completed[String(step)]);
    });

  return {
    frozen: session?.frozen ?? null,
    saving,
    complete,
    creating,
    repairing,
    requestRepair: () => setRepairing(true),
    closeRepair: () => setRepairing(false),
    requestCreate: () => setCreating(true),
    cancelCreate: () => setCreating(false),
    openFrozen,
    ...buildAlongSource(session),
    active: !!session || opening,
    opening,
    progress: opening ? guide.progress : null,
    step: session ? session.steps[session.index] : null,
    view: session ? session.views[session.index] : null,
    index: session?.index ?? 0,
    count: session?.steps.length ?? 0,
    steps: session?.steps ?? [],
    stepParts: session?.stepParts ?? [],
    open,
    openPlan,
    close,
    next: () => go(1),
    previous: () => go(-1),
  };
}

export type BuildAlong = ReturnType<typeof useBuildAlong>;
