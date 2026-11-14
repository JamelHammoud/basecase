import { useRef, useState } from 'react';
import { knownPurchases } from '../components/build/usePurchases';
import { comparable } from '../cases/caseCompare';
import {
  designScene,
  exploreCase,
  exploreCaseKey,
  exploreDesigns,
  exploreSpace,
  EXPLORE_RUNS,
  MAX_DESIGNS,
  sameDesign,
  sceneDesign,
  type ExploredDesign,
  type ExploreSpace,
} from '../cases/explore';
import type { Case } from '../cases/schema';
import { readinessFingerprint } from '../readiness/readiness';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { platformBridge } from '../utils/platformBridge';
import { exploreVerdict } from './caseChecks';
import type { ShowToast } from './types';
import { sceneCaseRobot, type SceneCaseSource } from './useCaseCompare';
import type { SceneDocument } from './useSceneDocument';

let designLimit = MAX_DESIGNS;

export const limitExplore = (designs: number) => {
  designLimit = Math.max(1, Math.min(MAX_DESIGNS, Math.round(designs)));
};

export interface Exploration {
  caseKey: string;
  base: string;
  space: ExploreSpace;
  rows: ExploredDesign[];
  total: number;
  running: boolean;
}

interface CaseExploreOptions {
  kase: Case | null;
  parts: ScenePart[];
  project: ProjectSettings;
  source: SceneCaseSource & { docs: Pick<SceneDocument, 'commitDesign'> };
  showToast: ShowToast;
}

export function exploreBase(parts: ScenePart[], project: ProjectSettings, space: ExploreSpace): string {
  const swapped = new Set(space.groups.flatMap((g) => g.parts));
  const neutral = parts.map((p) => (swapped.has(p.id) ? { ...p, componentVariant: undefined } : p));

  return readinessFingerprint(neutral, { joints: project.joints ?? [] });
}

export function exploreProblem(kase: Case | null, space: ExploreSpace | null): string | null {
  if (!kase) return 'No Case is open. Name one with case.';

  if (!comparable(kase)) return `${kase.name} has more than one robot slot, so Explore can't run it.`;

  return space ? null : 'No joint has a catalog servo that comes in more than one version.';
}

export function useCaseExplore({ kase, parts, project, source, showToast }: CaseExploreOptions) {
  const { docs } = source;
  const [state, setState] = useState<Exploration | null>(null);
  const runId = useRef(0);
  const space = exploreSpace(parts, project);
  const caseKey = kase ? exploreCaseKey(kase) : '';
  const shown =
    state && space && state.caseKey === caseKey && state.base === exploreBase(parts, project, space) ? state : null;

  const built = shown && space ? sceneDesign(space, { parts, project }) : null;

  const update = (run: number, next: (s: Exploration) => Exploration) =>
    setState((s) => (s && runId.current === run ? next(s) : s));

  const explore = async (target: Case): Promise<Exploration | string> => {
    const scene = { parts: docs.partsRef.current, project: docs.projectRef.current };
    const at = exploreSpace(scene.parts, scene.project);
    const problem = exploreProblem(target, at);

    if (problem || !at) return problem ?? '';

    const run = ++runId.current;
    const designs = exploreDesigns(at, designLimit);
    const started: Exploration = {
      caseKey: exploreCaseKey(target),
      base: exploreBase(scene.parts, scene.project, at),
      space: at,
      rows: [],
      total: designs.length,
      running: true,
    };

    setState(started);

    const robot = await sceneCaseRobot(source);

    if (!robot) return 'No canvas to measure the parts on.';

    const rows = await exploreCase(
      { ...scene, measures: robot.measures, partTriangles: robot.partTriangles },
      {
        designs,
        purchases: knownPurchases() ?? (await platformBridge.listPurchases().catch(() => ({}))),
        runs: (variant) => exploreVerdict(variant, target, EXPLORE_RUNS),
        stopped: () => runId.current !== run,
        onDesign: (row) => update(run, (s) => ({ ...s, rows: [...s.rows, row] })),
      },
    ).finally(() => update(run, (s) => ({ ...s, running: false })));

    return { ...started, rows, running: false };
  };

  const stop = () => {
    runId.current++;
    setState((s) => s && { ...s, running: false });
  };

  return {
    available: !exploreProblem(kase, space),
    running: !!state?.running,
    shown,
    start: () => {
      if (!kase) return;

      explore(kase).catch((e: unknown) => showToast(errorMessage(e), { tone: 'error' }));
    },
    stop,
    explore,
    apply: (row: ExploredDesign) => {
      if (!shown) return;

      const scene = { parts: docs.partsRef.current, project: docs.projectRef.current };
      const next = designScene(scene, shown.space, row.design);

      docs.commitDesign(next.parts, next.project.tether);
    },
    isCurrent: (row: ExploredDesign) => !!built && sameDesign(row.design, built),
  };
}

export type CaseExplore = ReturnType<typeof useCaseExplore>;
