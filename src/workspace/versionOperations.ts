import { checkedSceneHistory } from '../../electron/library/sceneHistory.mjs';
import { compareDesigns, mergeDesigns, unitsOf, type MergeChoice } from './versionMerge';
import { decodeSceneFile } from '../utils/sceneFile';
import { reply } from '../utils/workerRpc';
import {
  captureVersion,
  emptyVersionGraph,
  readVersionGraph,
  restoreVersion,
  joinVersionGraphs,
  commonVersion,
  recordFingerprint,
  assertVersionScene,
  assertVersionGraph,
  type VersionGraph,
  type VersionScene,
} from './sceneVersions';

export interface VersionRequest {
  history?: string;
  scene?: string;
  action: 'view' | 'capture' | 'begin' | 'finish' | 'restore' | 'branch' | 'revert';
  label?: string;
  id?: string;
  run?: string;
  chatId?: string;
  selected?: string[];
  sceneId?: string;
}

export interface VersionView {
  history: string;
  quoted: string;
  head: string | null;
  rows: Array<{ id: string; label: string; at: string; fingerprint: string; run?: string }>;
  origin?: { sceneId: string; versionId: string };
  activeRuns: Record<string, string>;
  completedRuns: NonNullable<VersionGraph['completedRuns']>;
  scene?: VersionScene;
}

const known = new Map<string, VersionGraph>();

export function graphOf(history?: string): VersionGraph {
  if (!history) return emptyVersionGraph();

  return known.get(history) ?? readVersionGraph(history);
}

export function viewOf(graph: VersionGraph, scene?: VersionScene): VersionView {
  assertVersionGraph(graph);

  const history = JSON.stringify(graph);

  checkedSceneHistory(history);

  if (known.size >= 2) known.delete(known.keys().next().value!);

  known.set(history, graph);

  return {
    history,
    quoted: JSON.stringify(history),
    head: graph.head,
    rows: Object.entries(graph.versions)
      .map(([id, version]) => ({ id, ...version, fingerprint: recordFingerprint(graph, version.record) }))
      .reverse(),
    origin: graph.origin,
    activeRuns: graph.activeRuns ?? {},
    completedRuns: graph.completedRuns ?? {},
    scene,
  };
}

async function checkedScene(scene: VersionScene): Promise<VersionScene> {
  const validated = await decodeSceneFile(
    new TextEncoder().encode(
      JSON.stringify({ format: 'basecase-scene', version: 1, scene: { name: 'Version', ...scene } }),
    ),
  );

  if (!validated.project) throw new Error('The scene history is damaged. Open another saved scene.');

  const localKeys = ['prints', 'quotes', 'madeBy', 'policies', 'tries', 'triesStored', 'skills', 'buildGuide'];
  const local = Object.fromEntries(Object.entries(scene.project).filter(([key]) => localKeys.includes(key)));

  return {
    ...scene,
    parts: validated.parts,
    annotations: validated.annotations,
    project: { ...validated.project, ...local },
  };
}

function readScene(json: string): VersionScene {
  const scene: unknown = JSON.parse(checkedSceneHistory(json)!);

  assertVersionScene(scene);

  return scene;
}

function capture(graph: VersionGraph, request: VersionRequest): VersionGraph {
  if (!request.scene) throw new Error('Save the scene before making a version.');

  const scene = readScene(request.scene);

  return captureVersion(graph, scene, {
    label: request.label || 'Version',
    at: new Date().toISOString(),
    run: request.run,
    chatId: request.chatId,
  });
}

function finishRun(graph: VersionGraph, request: VersionRequest): VersionGraph {
  const run = request.run!;
  const baseline = graph.activeRuns?.[run];

  if (!baseline) return graph;

  const captured = capture(graph, { ...request, label: 'Agent changes' });
  const changed = captured.versions[captured.head!].record !== graph.versions[baseline].record;
  const activeRuns = { ...graph.activeRuns };

  delete activeRuns[run];

  const completedRuns = changed
    ? {
        ...graph.completedRuns,
        [run]: {
          before: baseline,
          after: captured.head!,
          parts: request.selected ?? [],
          chatId: graph.versions[baseline].chatId,
        },
      }
    : graph.completedRuns;

  return { ...(changed ? captured : graph), activeRuns, completedRuns };
}

export async function versionOperation(request: VersionRequest): Promise<VersionView> {
  const graph = graphOf(request.history);

  if (request.action === 'view') return viewOf(graph);

  if (request.action === 'finish') return viewOf(finishRun(graph, request));

  if (request.action === 'begin') {
    const captured = capture(graph, { ...request, label: 'Before agent run' });

    return viewOf({ ...captured, activeRuns: { ...captured.activeRuns, [request.run!]: captured.head! } });
  }

  if (request.action === 'capture') return viewOf(capture(graph, request));

  if (request.action === 'revert') return revertRun(graph, request);

  const scene = await checkedScene(restoreVersion(graph, request.id));

  if (request.action === 'branch') {
    const branch = {
      ...graph,
      head: request.id!,
      activeRuns: {},
      origin: { sceneId: request.sceneId!, versionId: request.id! },
    };

    return viewOf(branch, scene);
  }

  const saved = capture(graph, { ...request, label: 'Before restore' });
  const restored = captureVersion(saved, scene, {
    label: 'Restored version',
    at: new Date().toISOString(),
    restoredFrom: request.id,
  });

  return viewOf(restored, scene);
}

async function revertRun(graph: VersionGraph, request: VersionRequest): Promise<VersionView> {
  const run = graph.completedRuns?.[request.run!];

  if (!run || !request.scene) throw new Error('Open Scene History to restore an earlier design.');

  const base = restoreVersion(graph, run.after);
  const theirs = restoreVersion(graph, run.before);
  const ours = readScene(request.scene);
  const merge = mergeDesigns({ base, ours, theirs, selected: (request.selected ?? []).map((id) => `part:${id}`) });

  if (!merge.scene) throw new Error('The design has conflicting changes. Open Scene History to choose a version.');

  const scene = await checkedScene(merge.scene);
  const saved = capture(graph, { ...request, label: 'Before revert' });
  const reverted = captureVersion(saved, scene, { label: 'Reverted agent changes', at: new Date().toISOString() });

  const completedRuns = { ...reverted.completedRuns };

  delete completedRuns[request.run!];

  return viewOf({ ...reverted, completedRuns }, scene);
}

export interface VersionComparisonRequest {
  history: string;
  otherHistory: string;
  ours: string;
  theirs: string;
  selected: string[];
  resolutions?: Record<string, MergeChoice>;
  apply?: boolean;
}

function mergedUnitBases(graph: VersionGraph, target: string, source: string): Record<string, unknown> {
  const bases = new Map<string, unknown>();
  const visited = new Set<string>();
  const queue = [target];

  for (let at = 0; at < queue.length; at++) {
    const id = queue[at];

    if (visited.has(id)) continue;

    visited.add(id);

    const version = graph.versions[id];
    const merged = version.merged;
    const related = merged && commonVersion(graph, merged.source, source) === merged.source;

    if (related) keepUnitBases(bases, unitsOf(restoreVersion(graph, merged.source)), merged.units);

    queue.push(...(version.restoredFrom ? [version.restoredFrom] : version.parents));
  }

  return Object.fromEntries(bases);
}

function keepUnitBases(bases: Map<string, unknown>, units: Map<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (bases.has(key)) continue;

    bases.set(key, units.get(key));
  }
}

export async function compareVersions(request: VersionComparisonRequest) {
  const ours = readScene(request.ours);
  const theirs = readScene(request.theirs);
  const graph = joinVersionGraphs(graphOf(request.history), graphOf(request.otherHistory));
  const otherHead = graphOf(request.otherHistory).head;
  const baseId = graph.head && otherHead ? commonVersion(graph, graph.head, otherHead) : null;
  const comparison = compareDesigns(ours, theirs);

  if (!baseId) return { comparison, merge: null, view: null };

  const base = restoreVersion(graph, baseId);
  const baseByUnit = mergedUnitBases(graph, graph.head!, otherHead!);
  const merge = mergeDesigns({
    base,
    ours,
    theirs,
    selected: request.selected,
    resolutions: request.resolutions,
    baseByUnit,
  });

  if (!request.apply || !merge.scene) return { comparison, merge, view: null };

  const scene = await checkedScene(merge.scene);

  const captured = captureVersion(graph, scene, {
    label: 'Merged design',
    at: new Date().toISOString(),
    parents: [graph.head!],
    merged: { source: otherHead!, units: merge.required },
  });

  return { comparison, merge, view: viewOf(captured, scene) };
}

export const versionHandlers = {
  operate: async (request: VersionRequest) => reply(await versionOperation(request)),
  compare: async (request: VersionComparisonRequest) => reply(await compareVersions(request)),
  quote: (history: string) => reply(JSON.stringify(checkedSceneHistory(history))),
};
