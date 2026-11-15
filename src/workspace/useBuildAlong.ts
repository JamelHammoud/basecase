import { useRef, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { buildAlongSteps, type BuildAlongStep } from '../guide/buildAlong';
import type { BuildStepView, ViewShot } from '../three/viewport/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { BuildGuide } from './useBuildGuide';
import type { GuidePlan } from '../guide/guideTypes';
import type { WiringScene } from '../wiring/netlist';

interface BuildAlongOptions {
  guide: BuildGuide;
  projectRef: RefObject<ProjectSettings>;
  partsRef: RefObject<ScenePart[]>;
  viewportRef: RefObject<Viewport3DHandle | null>;
}

interface Session {
  steps: BuildAlongStep[];
  stepParts: string[][];
  views: BuildStepView[];
  index: number;
  camera: ViewShot;
}

const stepView = (step: BuildAlongStep): BuildStepView => ({
  shown: step.shown,
  moves: step.moves,
  arrows: step.arrows,
  removing: step.repairPhase === 'remove',
  labels: step.servos.map((s) => ({ partId: s.partId, text: `${s.joint}, ID ${s.id}` })),
  routes: step.routes.flatMap((net) => (net.route?.points.length ? [{ points: net.route.points }] : [])),
});

const sameRoutingProject = (before: ProjectSettings, after: ProjectSettings) =>
  before.joints === after.joints &&
  before.wiring === after.wiring &&
  before.extras === after.extras &&
  before.tether === after.tether;

async function planWiring(viewport: Viewport3DHandle | null, plan: GuidePlan | null, scene: WiringScene) {
  if (!viewport || !plan || plan.repair) return null;

  return viewport.wiring(scene).catch(() => null);
}

export function useBuildAlong({ guide, partsRef, projectRef, viewportRef }: BuildAlongOptions) {
  const [session, setSession] = useState<Session | null>(null);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(0);

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

  const go = (delta: number) =>
    setSession((s) => s && { ...s, index: Math.min(s.steps.length - 1, Math.max(0, s.index + delta)) });

  return {
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
