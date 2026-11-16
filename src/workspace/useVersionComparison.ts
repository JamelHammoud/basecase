import { useState } from 'react';
import { robotTotals } from '../cases/caseCompare';
import { knownPurchases } from '../components/build/usePurchases';
import { platformBridge } from '../utils/platformBridge';
import { sceneJson } from '../utils/sceneJson';
import type { Readiness } from '../readiness/types';
import type { Comparison } from '../cases/caseCompare';
import { compareVersionRequest } from './versionClient';
import type { compareVersions, VersionComparisonRequest } from './versionOperations';
import { snapshotMatches, type MergeChoice } from './versionMerge';
import type { VersionScene } from './sceneVersions';
import type { WorkspaceCore } from './useWorkspaceCore';

interface Measurement {
  name: string;
  design: string;
  readiness: Readiness | null;
  costUsd: number;
  massG: number;
}

interface Compared {
  request: VersionComparisonRequest;
  result: Awaited<ReturnType<typeof compareVersions>>;
  metrics: Measurement[];
  kase: Comparison | null;
  caseName: string;
  fingerprints: string[];
  snapshots: VersionScene[];
  target: string;
  conflictKeys: string[];
}

function snapshotsStillCurrent(core: WorkspaceCore, target: string, captured: VersionScene[]) {
  const ids = [core.workspaceId, target];

  return ids.every((id, index) => snapshotMatches(core.studio.handleOf(id)?.snapshot(), captured[index]));
}

function fingerprintsStillCurrent(core: WorkspaceCore, target: string, captured: string[]) {
  return [core.workspaceId, target].every((id, index) => core.studio.handleOf(id)?.fingerprint() === captured[index]);
}

export function useVersionComparison(core: WorkspaceCore) {
  const [target, setTarget] = useState('');
  const [compared, setCompared] = useState<Compared | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, MergeChoice>>({});
  const choices = core.studio.tabs.filter((tab) => tab.id !== core.workspaceId);
  const picked = target || choices[0]?.id || '';

  const compare = async () => {
    const other = core.studio.handleOf(picked);

    if (!other?.saveVersion) throw new Error('Open the other scene before comparing.');

    const fingerprints = [core.readiness.fingerprint, other.fingerprint()];
    const [own, source] = await Promise.all([
      core.versions.capture('Compared design'),
      other.saveVersion('Compared design'),
    ]);
    const ours = own.captured;
    const theirs = source.scene;
    const request = {
      history: own.history,
      otherHistory: source.history,
      ours: await sceneJson(ours),
      theirs: await sceneJson(theirs),
      selected: [],
    };
    const result = await compareVersionRequest(request);
    const [a, b, ready, otherReady] = await Promise.all([
      core.studio.handleOf(core.workspaceId)?.caseRobot(),
      other.caseRobot(),
      core.readiness.checkNow(),
      other.checks?.(),
    ]);
    const purchases = knownPurchases() ?? (await platformBridge.listPurchases().catch(() => ({})));
    const kase = core.simTraining.cases.active;
    const comparison =
      kase && core.caseCompare.choicesFor(kase).some((choice) => choice.tabId === picked)
        ? await core.caseCompare.compareNow(kase, picked)
        : null;

    if (
      !a ||
      !b ||
      !snapshotsStillCurrent(core, picked, [ours, theirs]) ||
      !fingerprintsStillCurrent(core, picked, fingerprints)
    )
      throw new Error('The design changed. Compare again.');

    const metrics = [
      { name: a.name, design: result.comparison.ours, readiness: ready, ...robotTotals(a, purchases) },
      { name: b.name, design: result.comparison.theirs, readiness: otherReady ?? null, ...robotTotals(b, purchases) },
    ];

    setSelected([]);
    setResolutions({});
    setCompared({
      request,
      result,
      metrics,
      kase: comparison,
      caseName: kase ? kase.name : '',
      fingerprints,
      snapshots: [ours, theirs],
      target: picked,
      conflictKeys: [],
    });
  };

  const preview = async (ids: string[], choices: Record<string, MergeChoice>) => {
    if (!compared) return;

    const result = await compareVersionRequest({ ...compared.request, selected: ids, resolutions: choices });

    setSelected(ids);
    setResolutions(choices);
    setCompared({
      ...compared,
      result,
      conflictKeys: [...new Set([...compared.conflictKeys, ...(result.merge?.conflicts ?? [])])],
    });
  };

  const merge = async () => {
    if (!compared) return;

    if (
      !snapshotsStillCurrent(core, compared.target, compared.snapshots) ||
      !fingerprintsStillCurrent(core, compared.target, compared.fingerprints)
    )
      throw new Error('The design changed. Compare again.');

    const result = await compareVersionRequest({ ...compared.request, selected, resolutions, apply: true });

    if (!result.view?.scene) return;

    if (
      !snapshotsStillCurrent(core, compared.target, compared.snapshots) ||
      !fingerprintsStillCurrent(core, compared.target, compared.fingerprints)
    )
      throw new Error('The design changed. Compare again.');

    await core.versions.apply(result.view.scene);
    core.versions.publish(result.view);
    await core.versions.persist(result.view, result.view.scene);
    setCompared(null);
  };

  return {
    choices,
    picked,
    compared,
    selected,
    resolutions,
    compare,
    merge,
    pick: (id: string) => {
      setTarget(id);
      setCompared(null);
    },
    select: (id: string, enabled: boolean) =>
      preview(enabled ? [...selected, id] : selected.filter((key) => key !== id), resolutions),
    resolve: (key: string, choice: MergeChoice) => preview(selected, { ...resolutions, [key]: choice }),
  };
}

export type VersionComparison = ReturnType<typeof useVersionComparison>;
