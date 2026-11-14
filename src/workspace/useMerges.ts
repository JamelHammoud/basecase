import { useEffect, useEffectEvent, useState, type RefObject } from 'react';
import { evaluateBoolean } from '../booleans/evaluate';
import { booleanHash } from '../booleans/hash';
import { guideFingerprint } from '../guide/guideFingerprint';
import { withResult } from '../booleans/parts';
import type { PrinterSetup } from '../data/printers';
import { bedOf } from '../print/bed';
import { mergeDraft, mergedParts, sameMembers } from '../print/merge/mergeApply';
import { mergeInput } from '../print/merge/mergeInput';
import type { MergeGroup } from '../print/merge/mergeTypes';
import type { Viewport3DHandle } from '../three/viewport/types';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { errorMessage } from '../utils/errorMessage';
import { newId } from './helpers';
import type { CommitParts, ShowToast } from './types';
import { booleanDone, unchangedSince } from './useSelectionOps';

interface MergeOptions {
  active: boolean;
  parts: ScenePart[];
  partsRef: RefObject<ScenePart[]>;
  project: ProjectSettings;
  printer: PrinterSetup;
  viewport: () => Viewport3DHandle | null;
  commitParts: CommitParts;
  showToast: ShowToast;
  undo: () => void;
}

const PLAN_BUDGET_MS = 20000;

const planKey = (parts: ScenePart[], project: ProjectSettings, printer: PrinterSetup) =>
  [
    guideFingerprint('', parts, project),
    printer.model.id,
    ...parts.map((p) => `${p.printMaterial ?? ''}${p.sheet ? '#' : ''}${p.print?.skip ? '!' : ''}`),
  ].join('|');

const present = (parts: ScenePart[]) => {
  const ids = new Set(parts.map((p) => p.id));

  return (g: MergeGroup) => [...g.ids, ...g.hardware].every((id) => ids.has(id));
};

export function useMerges(options: MergeOptions) {
  const { active, parts, partsRef, project, printer, viewport, commitParts, showToast, undo } = options;
  const [planned, setPlanned] = useState<MergeGroup[]>([]);
  const [merging, setMerging] = useState<string | null>(null);

  const planFor = async (now: ScenePart[]): Promise<MergeGroup[]> => {
    const handle = viewport();

    if (!handle) return [];

    await handle.meshesReady();

    const input = mergeInput(now, project, bedOf(printer.model));
    const geometry = await handle.assembly({ serviceable: [], budgetMs: PLAN_BUDGET_MS, merges: input });

    return geometry.merges?.groups ?? [];
  };

  const key = active ? planKey(parts, project, printer) : '';

  const replan = useEffectEvent((live: () => boolean) => {
    void planFor(parts)
      .then((groups) => live() && setPlanned(groups))
      .catch(() => live() && setPlanned([]));
  });

  useEffect(() => {
    if (!active) return;

    let live = true;

    replan(() => live);

    return () => {
      live = false;
    };
  }, [active, key]);

  const apply = async (group: MergeGroup): Promise<string | null> => {
    const made = mergeDraft(partsRef.current, group, () => newId());

    if (!made) return null;

    const evaluated = await evaluateBoolean(made.draft);

    if (!evaluated || !unchangedSince(partsRef.current, [made.base, ...made.tools])) return null;

    const result = withResult(made.draft, booleanHash(made.draft), evaluated);
    const done = booleanDone('union', made.base, made.tools);

    commitParts((prev) => mergedParts(prev, group, result));
    showToast(done, { action: { label: 'Undo', onClick: undo } });

    return done;
  };

  const mergeIds = async (ids: string[]): Promise<string | null> => {
    const group = (await planFor(partsRef.current)).find((g) => sameMembers(g, ids));

    return group ? apply(group) : null;
  };

  const merge = async (group: MergeGroup) => {
    setMerging(group.keep);

    try {
      await mergeIds(group.ids);
    } catch (e) {
      showToast(errorMessage(e), { tone: 'error' });
    } finally {
      setMerging(null);
    }
  };

  return { groups: active ? planned.filter(present(parts)) : [], merging, merge, mergeIds, planFor };
}

export type Merges = ReturnType<typeof useMerges>;
