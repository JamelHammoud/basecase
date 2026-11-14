import { useRef, useState, type RefObject } from 'react';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { buildAlongSteps, type BuildAlongStep } from '../guide/buildAlong';
import type { BuildStepView, ViewShot } from '../three/viewport/types';
import type { ProjectSettings } from '../types/robotics';
import type { BuildGuide } from './useBuildGuide';

interface BuildAlongOptions {
  guide: BuildGuide;
  projectRef: RefObject<ProjectSettings>;
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
  labels: step.servos.map((s) => ({ partId: s.partId, text: `${s.joint}, ID ${s.id}` })),
});

export function useBuildAlong({ guide, projectRef, viewportRef }: BuildAlongOptions) {
  const [session, setSession] = useState<Session | null>(null);
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(0);

  const open = async () => {
    if (session || opening) return;

    const run = ++openingRef.current;
    const camera = viewportRef.current?.currentView();

    setOpening(true);

    const plan = await guide.currentPlan().catch(() => null);

    if (run !== openingRef.current) return;

    setOpening(false);

    if (!plan?.steps.length || !camera) return;

    const steps = buildAlongSteps(plan, projectRef.current.joints ?? []);

    setSession({
      steps,
      stepParts: plan.steps.map((s) => s.partIds),
      views: steps.map(stepView),
      index: 0,
      camera,
    });
    viewportRef.current?.frameAll();
  };

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
    close,
    next: () => go(1),
    previous: () => go(-1),
  };
}

export type BuildAlong = ReturnType<typeof useBuildAlong>;
