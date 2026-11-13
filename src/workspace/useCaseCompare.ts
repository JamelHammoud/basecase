import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { knownPurchases } from '../components/build/usePurchases';
import type { Viewport3DHandle } from '../components/Viewport3D';
import { comparable, comparableRobots, compareCase, type CompareRobot, type Comparison } from '../cases/caseCompare';
import type { Case } from '../cases/schema';
import { jsonHash } from '../utils/geometryHash';
import { errorMessage } from '../utils/errorMessage';
import { platformBridge } from '../utils/platformBridge';
import { caseVerdict } from './caseChecks';
import { newestComparison } from './newestComparison';
import type { ShowToast, StudioShared } from './types';
import type { SceneDocument } from './useSceneDocument';

export interface SceneCaseSource {
  workspaceId: string;
  sceneName: string;
  docs: Pick<SceneDocument, 'partsRef' | 'projectRef'>;
  viewportRef: RefObject<Viewport3DHandle | null>;
}

export async function sceneCaseRobot({
  workspaceId,
  sceneName,
  docs,
  viewportRef,
}: SceneCaseSource): Promise<CompareRobot | null> {
  const viewport = viewportRef.current;

  if (!viewport) return null;

  const parts = docs.partsRef.current;
  const project = docs.projectRef.current;

  await viewport.meshesReady();

  const measures = await viewport.measureParts();

  return { tabId: workspaceId, name: sceneName, parts, project, measures, partTriangles: viewport.partTriangles };
}

export interface CompareChoice {
  tabId: string;
  name: string;
}

interface CaseCompareOptions {
  inFront: boolean;
  kase: Case | null;
  fingerprint: string;
  studio: Pick<StudioShared, 'robotsBeside' | 'handleOf' | 'selectTab' | 'tabs'>;
  source: SceneCaseSource;
  showToast: ShowToast;
}

type ComparePick = { caseId: string; tabId: string } | null;

function pickedTab(against: ComparePick, kase: Case | null, tabs: StudioShared['tabs']): string | null {
  if (!against || against.caseId !== kase?.id) return null;

  return tabs.some((t) => t.id === against.tabId) ? against.tabId : null;
}

export function useCaseCompare({ inFront, kase, fingerprint, studio, source, showToast }: CaseCompareOptions) {
  const [choices, setChoices] = useState<CompareChoice[]>([]);
  const [against, setAgainst] = useState<ComparePick>(null);
  const [newest] = useState(() => newestComparison<Comparison>());
  const [inFlight] = useState(() => new Map<string, Promise<Comparison>>());
  const [view, setView] = useState(newest.view);
  const caseKey = kase ? jsonHash(kase) : '';
  const tabsKey = studio.tabs.map((t) => `${t.id}:${t.name}`).join('|');
  const current = pickedTab(against, kase, studio.tabs);

  const keyOf = (target: Case, tabId: string) =>
    `${jsonHash(target)}|${fingerprint}|${tabId}:${studio.handleOf(tabId)?.fingerprint() ?? ''}`;

  const measureBoth = async (target: Case, tabId: string): Promise<Comparison> => {
    const other = studio.handleOf(tabId);
    const [own, theirs] = await Promise.all([sceneCaseRobot(source), other?.caseRobot() ?? null]);

    if (!own || !theirs) throw new Error('That scene was closed.');

    return compareCase(target, [own, theirs], {
      runs: async (robot) => (await caseVerdict(robot, target)).runs,
      purchases: knownPurchases() ?? (await platformBridge.listPurchases().catch(() => ({}))),
    });
  };

  const compareNow = (target: Case, tabId: string): Promise<Comparison> => {
    const key = keyOf(target, tabId);
    const running = inFlight.get(key) ?? measureBoth(target, tabId).finally(() => inFlight.delete(key));

    inFlight.set(key, running);

    return running;
  };

  const choicesFor = (target: Case): CompareChoice[] => {
    const robots = comparable(target) ? studio.robotsBeside(source.workspaceId) : [];

    return comparableRobots(target, robots).map((r) => ({ tabId: r.tabId, name: r.name }));
  };

  const listChoices = useEffectEvent(() => setChoices(kase ? choicesFor(kase) : []));

  useEffect(() => {
    if (!inFront) return;

    const soon = setTimeout(listChoices, 0);

    return () => clearTimeout(soon);
  }, [inFront, caseKey, tabsKey, fingerprint]);

  const rerun = useEffectEvent(async (tabId: string) => {
    if (!kase || !studio.handleOf(tabId)) return;

    const key = keyOf(kase, tabId);
    const start = newest.want(key);

    setView(newest.view());

    if (!start) return;

    try {
      const comparison = await compareNow(kase, tabId);

      if (newest.settle({ key, tabId, comparison })) setView(newest.view());
    } catch (e) {
      if (!newest.fail(key)) return;

      setView(newest.view());
      showToast(errorMessage(e), { tone: 'error' });
    }
  });

  useEffect(() => {
    if (!current || !inFront) return;

    const soon = setTimeout(() => void rerun(current), 0);

    return () => clearTimeout(soon);
  }, [current, inFront, caseKey, fingerprint, tabsKey]);

  const { result } = view;
  const shown = current && result?.tabId === current && result.comparison.caseId === kase?.id ? result : null;

  return {
    choices,
    comparison: shown?.comparison ?? null,
    running: !!current && view.running,
    start: (tabId: string) => {
      if (kase) setAgainst({ caseId: kase.id, tabId });
    },
    show: (tabId: string) => {
      const other = studio.handleOf(tabId);

      if (!kase || !other) return;

      other.openCase(kase);
      studio.selectTab(tabId);
    },
    choicesFor,
    compareNow,
  };
}

export type CaseCompare = ReturnType<typeof useCaseCompare>;
