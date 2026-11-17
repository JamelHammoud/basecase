import { canonicalJson, isHash, sha256Hex } from '../skills/hash';
import { finiteTree, recordValue } from '../study/recordValues';
import type { ProjectSettings, SavedSceneRecord, ScenePart } from '../types/robotics';
import { validSheetFields } from '../sheet/validation';

export type VersionScene = Required<Pick<SavedSceneRecord, 'parts' | 'annotations' | 'globalGoal' | 'project'>> &
  Pick<SavedSceneRecord, 'worldAssets'>;

export interface SceneVersion {
  parents: string[];
  record: string;
  label: string;
  at: string;
  run?: string;
  chatId?: string;
  merged?: { source: string; units: string[] };
  restoredFrom?: string;
}

export interface CompletedVersionRun {
  before: string;
  after: string;
  parts?: string[];
  chatId?: string;
  run?: string;
}

export interface VersionGraph {
  format: 1;
  head: string | null;
  versions: Record<string, SceneVersion>;
  content: Record<string, string>;
  origin?: { sceneId: string; versionId: string };
  activeRuns?: Record<string, string>;
  completedRuns?: Record<string, CompletedVersionRun>;
}

interface VersionRecord {
  parts: string[];
  project: Record<string, string>;
  annotations: string;
  globalGoal: string;
  worldAssets?: string;
}

export const VERSION_LIMITS = { bytes: 64 * 1024 * 1024, versions: 1000, content: 100000, parts: 10000 };

const remembered = new WeakMap<object, { json: string; hash: string }>();
const badGraph = () => new Error('The scene history is damaged. Open another saved scene.');
const owns = (value: object, key: string) => Object.hasOwn(value, key);

export const emptyVersionGraph = (): VersionGraph => ({ format: 1, head: null, versions: {}, content: {} });

function contentOf(value: unknown): { json: string; hash: string } {
  const object = typeof value === 'object' && value !== null ? value : null;
  const cached = object && remembered.get(object);

  if (cached) return cached;

  if (!finiteTree(value)) throw badGraph();

  const json = canonicalJson(value);
  const result = { json, hash: sha256Hex(json) };

  if (object) remembered.set(object, result);

  return result;
}

function recordScene(scene: VersionScene, content: VersionGraph['content']): VersionRecord {
  const keep = (value: unknown) => {
    const { json, hash } = contentOf(value);

    content[hash] = json;

    return hash;
  };

  return {
    parts: scene.parts.map(keep),
    project: Object.fromEntries(
      Object.entries(scene.project)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, keep(value)]),
    ),
    annotations: keep(scene.annotations),
    globalGoal: keep(scene.globalGoal),
    ...(scene.worldAssets ? { worldAssets: keep(scene.worldAssets) } : {}),
  };
}

export function sceneVersionFingerprint(scene: Pick<VersionScene, 'parts' | 'project'>): string {
  const descriptor = {
    parts: scene.parts.map((part) => contentOf(part).hash),
    project: Object.fromEntries(
      Object.entries(scene.project)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, contentOf(value).hash]),
    ),
  };

  return sha256Hex(canonicalJson(descriptor));
}

export function recordFingerprint(graph: VersionGraph, record: string): string {
  const { parts, project } = versionRecord(graph, record);

  return sha256Hex(canonicalJson({ parts, project }));
}

export function assertVersionScene(value: unknown): asserts value is VersionScene {
  if (!recordValue(value) || !Array.isArray(value.parts) || value.parts.length > VERSION_LIMITS.parts) throw badGraph();

  if (!value.parts.every(validPart) || new Set(value.parts.map((part) => part.id)).size !== value.parts.length)
    throw badGraph();

  if (
    !recordValue(value.project) ||
    !Array.isArray(value.annotations) ||
    typeof value.globalGoal !== 'string' ||
    !finiteTree(value)
  )
    throw badGraph();
}

export function assertVersionGraph(graph: VersionGraph) {
  checkedGraph(graph);
  checkedLinks(graph);
}

export function captureVersion(
  graph: VersionGraph,
  scene: VersionScene,
  details: Pick<SceneVersion, 'label' | 'at' | 'run' | 'chatId' | 'merged' | 'restoredFrom'> & { parents?: string[] },
): VersionGraph {
  if (scene.parts.length > VERSION_LIMITS.parts || Object.keys(graph.versions).length >= VERSION_LIMITS.versions)
    throw new Error('The scene history is too large. Export a scene copy.');

  assertVersionScene(scene);

  const content = { ...graph.content };
  const record = contentOf(recordScene(scene, content));
  const { parents = graph.head ? [graph.head] : [], ...metadata } = details;

  if (parents.some((id) => !owns(graph.versions, id))) throw badGraph();

  const version = { ...metadata, parents, record: record.hash };
  const head = sha256Hex(canonicalJson(version));

  content[record.hash] = record.json;

  const captured: VersionGraph = {
    ...graph,
    format: 1,
    head,
    content,
    versions: { ...graph.versions, [head]: version },
  };

  checkedGraph(captured);
  checkedVersion(captured, head, version);

  return captured;
}

function parseContent(graph: VersionGraph, hash: string): unknown {
  if (!isHash(hash) || !owns(graph.content, hash)) throw badGraph();

  const json = graph.content[hash];

  if (sha256Hex(json) !== hash) throw badGraph();

  return JSON.parse(json);
}

function versionRecord(graph: VersionGraph, hash: string): VersionRecord {
  const raw = parseContent(graph, hash);

  if (!recordValue(raw) || !Array.isArray(raw.parts) || raw.parts.length > VERSION_LIMITS.parts) throw badGraph();

  if (!raw.parts.every(isHash) || !recordValue(raw.project)) throw badGraph();

  if (!Object.values(raw.project).every(isHash) || !isHash(raw.annotations) || !isHash(raw.globalGoal))
    throw badGraph();

  if (raw.worldAssets !== undefined && !isHash(raw.worldAssets)) throw badGraph();

  return raw as unknown as VersionRecord;
}

const validPart = (value: unknown): value is ScenePart =>
  recordValue(value) &&
  typeof value.id === 'string' &&
  value.id.length > 0 &&
  value.id.length <= 128 &&
  typeof value.kind === 'string' &&
  Array.isArray(value.position) &&
  value.position.length === 3 &&
  value.position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate)) &&
  validSheetFields(value);

export function restoreVersion(graph: VersionGraph, id = graph.head): VersionScene {
  if (!id || !owns(graph.versions, id)) throw badGraph();

  checkedVersion(graph, id, graph.versions[id]);

  const record = versionRecord(graph, graph.versions[id].record);
  const parts = record.parts.map((hash) => parseContent(graph, hash));
  const annotations = parseContent(graph, record.annotations);
  const globalGoal = parseContent(graph, record.globalGoal);

  if (!parts.every(validPart) || new Set(parts.map((part) => part.id)).size !== parts.length) throw badGraph();

  if (!Array.isArray(annotations) || typeof globalGoal !== 'string') throw badGraph();

  const project = Object.fromEntries(
    Object.entries(record.project).map(([key, hash]) => [key, parseContent(graph, hash)]),
  );

  return {
    parts,
    annotations,
    globalGoal,
    project: project as unknown as ProjectSettings,
    ...(record.worldAssets
      ? { worldAssets: parseContent(graph, record.worldAssets) as VersionScene['worldAssets'] }
      : {}),
  };
}

export function joinVersionGraphs(ours: VersionGraph, theirs: VersionGraph): VersionGraph {
  const content = { ...theirs.content, ...ours.content };
  const versions = { ...theirs.versions, ...ours.versions };

  for (const [hash, json] of Object.entries(theirs.content)) {
    if (owns(ours.content, hash) && ours.content[hash] !== json) throw badGraph();
  }

  for (const [hash, version] of Object.entries(theirs.versions)) {
    if (owns(ours.versions, hash) && canonicalJson(ours.versions[hash]) !== canonicalJson(version)) throw badGraph();
  }

  return { ...ours, format: 1, head: ours.head, content, versions };
}

function checkedRun(value: unknown) {
  if (value !== undefined && (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value))) throw badGraph();
}

function checkedVersionLinks(graph: VersionGraph, value: Record<string, unknown>) {
  if (value.restoredFrom !== undefined && !knownVersionId(graph, value.restoredFrom)) throw badGraph();

  if (value.merged === undefined) return;

  const merged = value.merged;

  if (!recordValue(merged) || !knownVersionId(graph, merged.source) || !Array.isArray(merged.units)) throw badGraph();

  if (
    merged.units.length > VERSION_LIMITS.content ||
    !merged.units.every((key) => typeof key === 'string' && key.length <= 256 && /^(part|joint|project):/.test(key))
  )
    throw badGraph();
}

function checkedVersion(graph: VersionGraph, hash: string, value: unknown): asserts value is SceneVersion {
  if (!isHash(hash) || !recordValue(value) || !isHash(value.record) || !Array.isArray(value.parents)) throw badGraph();

  if (value.parents.length > 2 || !value.parents.every((parent) => isHash(parent) && owns(graph.versions, parent)))
    throw badGraph();

  if (typeof value.label !== 'string' || value.label.length > 200 || !value.label.trim()) throw badGraph();

  if (typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) throw badGraph();

  checkedRun(value.run);
  checkedRun(value.chatId);
  checkedVersionLinks(graph, value);

  if (!finiteTree(value) || sha256Hex(canonicalJson(value)) !== hash) throw badGraph();
}

const validMetadataId = (value: unknown) => typeof value === 'string' && /^[\w-]{1,128}$/.test(value);
const knownVersionId = (graph: VersionGraph, value: unknown) => isHash(value) && owns(graph.versions, value);

function checkedActiveRuns(graph: VersionGraph) {
  if (graph.activeRuns && (!recordValue(graph.activeRuns) || Object.keys(graph.activeRuns).length > 4))
    throw badGraph();

  for (const [key, id] of Object.entries(graph.activeRuns ?? {})) {
    if (!validMetadataId(key) || !knownVersionId(graph, id)) throw badGraph();
  }
}

function checkedCompletedRuns(graph: VersionGraph) {
  if (
    graph.completedRuns &&
    (!recordValue(graph.completedRuns) || Object.keys(graph.completedRuns).length > VERSION_LIMITS.versions)
  )
    throw badGraph();

  for (const [key, run] of Object.entries(graph.completedRuns ?? {})) {
    if (
      !validMetadataId(key) ||
      !recordValue(run) ||
      !knownVersionId(graph, run.before) ||
      !knownVersionId(graph, run.after)
    )
      throw badGraph();

    checkedRunParts(run.parts);
    checkedRun(run.chatId);
    checkedRun(run.run);
  }
}

function checkedRunParts(value: unknown) {
  if (value === undefined) return;

  if (
    !Array.isArray(value) ||
    value.length > VERSION_LIMITS.parts ||
    !value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)
  )
    throw badGraph();
}

function checkedLinks(graph: VersionGraph) {
  if (
    graph.origin &&
    (!recordValue(graph.origin) ||
      !validMetadataId(graph.origin.sceneId) ||
      !knownVersionId(graph, graph.origin.versionId))
  )
    throw badGraph();

  checkedActiveRuns(graph);
  checkedCompletedRuns(graph);
}

function checkedGraph(value: unknown): asserts value is VersionGraph {
  if (!recordValue(value) || value.format !== 1 || !recordValue(value.versions) || !recordValue(value.content))
    throw badGraph();

  if (value.head !== null && (!isHash(value.head) || !owns(value.versions, value.head))) throw badGraph();

  if (
    Object.keys(value.versions).length > VERSION_LIMITS.versions ||
    Object.keys(value.content).length > VERSION_LIMITS.content
  )
    throw badGraph();
}

function checkedContent(hash: string, json: unknown) {
  if (!isHash(hash) || typeof json !== 'string' || sha256Hex(json) !== hash) throw badGraph();

  const value: unknown = JSON.parse(json);

  if (!finiteTree(value)) throw badGraph();
}

export function readVersionGraph(json: string): VersionGraph {
  if (json.length > VERSION_LIMITS.bytes || new TextEncoder().encode(json).byteLength > VERSION_LIMITS.bytes)
    throw badGraph();

  const value: unknown = JSON.parse(json);

  checkedGraph(value);
  checkedLinks(value);

  for (const [hash, block] of Object.entries(value.content)) checkedContent(hash, block);

  for (const [hash, version] of Object.entries(value.versions)) {
    checkedVersion(value, hash, version);
    restoreVersion(value, hash);
  }

  return value;
}

export function commonVersion(graph: VersionGraph, first: string, second: string): string | null {
  const ancestors = (start: string) => {
    const depths = new Map<string, number>([[start, 0]]);
    const queue = [start];

    for (let at = 0; at < queue.length; at++) {
      const id = queue[at];

      for (const parent of graph.versions[id]?.parents ?? []) {
        if (depths.has(parent)) continue;

        depths.set(parent, depths.get(id)! + 1);
        queue.push(parent);
      }
    }

    return depths;
  };
  const ours = ancestors(first);
  const theirs = ancestors(second);
  const shared = [...ours.keys()].filter((id) => theirs.has(id));

  shared.sort((a, b) => ours.get(a)! + theirs.get(a)! - (ours.get(b)! + theirs.get(b)!) || a.localeCompare(b));

  return shared[0] ?? null;
}
