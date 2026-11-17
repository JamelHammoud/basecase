import { zUpFrame } from '../agent/skeletonFrames';
import { findPort } from '../agent/ports';
import { canonicalJson } from '../skills/hash';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { sceneVersionFingerprint, type VersionScene } from './sceneVersions';

type Units = Map<string, unknown>;

export type MergeChoice = 'current' | 'incoming';

export interface DesignComparison {
  ours: string;
  theirs: string;
  parts: Array<{ id: string; name: string; change: 'added' | 'removed' | 'changed' }>;
  joints: Array<{ id: string; name: string; change: 'added' | 'removed' | 'changed' }>;
}

export interface MergeRequest {
  base: VersionScene;
  ours: VersionScene;
  theirs: VersionScene;
  selected: string[];
  resolutions?: Record<string, MergeChoice>;
  baseByUnit?: Record<string, unknown>;
}

export interface DesignMerge {
  scene: VersionScene | null;
  conflicts: string[];
  required: string[];
  dangling: string[];
  dependencies: Array<{ key: string; name: string }>;
}

const evidenceFields = new Set([
  'readiness',
  'policies',
  'tries',
  'triesStored',
  'skills',
  'buildGuide',
  'prints',
  'quotes',
  'madeBy',
  'handoffs',
  'study',
]);
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

export const designFingerprint = sceneVersionFingerprint;

export function snapshotMatches(
  current: (Partial<VersionScene> & { history?: string }) | undefined,
  captured: VersionScene,
  history?: string,
): boolean {
  return (
    !!current &&
    current.parts === captured.parts &&
    current.project === captured.project &&
    current.annotations === captured.annotations &&
    current.globalGoal === captured.globalGoal &&
    (history === undefined || current.history === history)
  );
}

function changedEntities(
  ours: Array<{ id: string; name: string }>,
  theirs: Array<{ id: string; name: string }>,
): DesignComparison['parts'] {
  const before = new Map(ours.map((part) => [part.id, part]));
  const after = new Map(theirs.map((part) => [part.id, part]));
  const parts: DesignComparison['parts'] = [];

  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id);
    const b = after.get(id);

    if (same(a, b)) continue;

    const change = a ? 'removed' : 'added';
    const classification = a && b ? 'changed' : change;

    parts.push({ id, name: (b ?? a)!.name, change: classification });
  }

  return parts;
}

export function compareDesigns(ours: VersionScene, theirs: VersionScene): DesignComparison {
  return {
    ours: designFingerprint(ours),
    theirs: designFingerprint(theirs),
    parts: changedEntities(ours.parts, theirs.parts),
    joints: changedEntities(ours.project.joints ?? [], theirs.project.joints ?? []),
  };
}

export function unitsOf(scene: VersionScene): Units {
  return new Map([
    ...scene.parts.map((part): [string, unknown] => [`part:${part.id}`, part]),
    ...(scene.project.joints ?? []).map((joint): [string, unknown] => [`joint:${joint.id}`, joint]),
    ...Object.entries(scene.project)
      .filter(([key]) => key !== 'joints' && !evidenceFields.has(key))
      .map(([key, value]): [string, unknown] => [`project:${key}`, value]),
  ]);
}

function referencedIds(value: unknown, ids: Set<string>): Set<string> {
  if (typeof value === 'string') return new Set(ids.has(value) ? [value] : []);

  if (!value || typeof value !== 'object') return new Set();

  const excluded = new Set(['id', 'name', 'note', 'description', 'label', 'hash', 'fingerprint']);
  const values = Array.isArray(value)
    ? value
    : Object.entries(value)
        .filter(([key]) => !excluded.has(key))
        .map(([, child]) => child);

  return new Set(values.flatMap((child) => [...referencedIds(child, ids)]));
}

function dependencies(units: Units): Map<string, Set<string>> {
  const entities = [...units.keys()].filter((key) => key.startsWith('part:') || key.startsWith('joint:'));
  const ids = new Set(entities.map((key) => key.slice(key.indexOf(':') + 1)));

  return new Map(
    [...units].map(([key, value]) => {
      const references = referencedIds(value, ids);
      const mirrored = key.startsWith('part:') ? (value as ScenePart | undefined)?.mirrorOf?.id : undefined;

      if (mirrored) references.add(mirrored);

      return [key, new Set(entities.filter((entity) => references.has(entity.slice(entity.indexOf(':') + 1))))];
    }),
  );
}

function includeSkeletonFrames(
  request: MergeRequest,
  { selected, edits }: { selected: Set<string>; edits: Set<string> },
) {
  for (const part of [...request.base.parts, ...request.theirs.parts]) {
    const planned = part.frame && request.theirs.project.skeleton?.joints.some((joint) => joint.id === part.frame);

    if (!planned || !selected.has(`part:${part.id}`)) continue;

    selected.add('project:skeleton');
    edits.add('project:skeleton');
  }
}

function selectedClosure(request: MergeRequest, units: { base: Units; ours: Units; theirs: Units }) {
  const { base, ours, theirs } = units;
  const selected = new Set(request.selected.filter((key) => !evidenceFields.has(key.slice('project:'.length))));
  const edits = new Set(selected);
  const combined = new Map([...base, ...theirs]);
  const refs = dependencies(combined);
  const oldRefs = dependencies(base);

  for (const [key, ids] of oldRefs) refs.set(key, new Set([...(refs.get(key) ?? []), ...ids]));

  includeSkeletonFrames(request, { selected, edits });

  const queue = [...selected];
  const include = (key: string, edit: boolean) => {
    const changed = !selected.has(key) || (edit && !edits.has(key));

    selected.add(key);

    if (edit) edits.add(key);

    if (changed) queue.push(key);
  };

  for (let at = 0; at < queue.length; at++) {
    const key = queue[at];
    const refsOf = refs.get(key) ?? [];

    for (const id of refsOf) include(id, false);

    if (!edits.has(key) && ours.has(key)) continue;

    for (const [dependent, ids] of refs) {
      const attached = dependent.startsWith('joint:') || dependent.startsWith('project:');

      if (attached && ids.has(key) && !same(base.get(dependent), theirs.get(dependent))) include(dependent, true);
    }
  }

  return { selected, edits };
}

function selectValue(key: string, request: MergeRequest, units: { base: Units; ours: Units; theirs: Units }) {
  const a = units.base.get(key);
  const b = units.ours.get(key);
  const c = units.theirs.get(key);
  const choice = request.resolutions?.[key];

  if (choice === 'current') return { value: b, conflict: false };

  if (choice === 'incoming' || same(a, b) || same(b, c)) return { value: c, conflict: false };

  return { value: b, conflict: true };
}

function mergedScene(ours: VersionScene, units: Units): VersionScene {
  const parts = [...units].filter(([key]) => key.startsWith('part:')).map(([, value]) => value as ScenePart);
  const joints = [...units].filter(([key]) => key.startsWith('joint:')).map(([, value]) => value as RobotJoint);
  const fields = [...units]
    .filter(([key]) => key.startsWith('project:'))
    .map(([key, value]) => [key.slice('project:'.length), value]);

  return {
    ...ours,
    parts,
    project: {
      ...Object.fromEntries(Object.entries(ours.project).filter(([key]) => evidenceFields.has(key))),
      ...Object.fromEntries(fields),
      joints,
    } as VersionScene['project'],
  };
}

function danglingMatePorts(scene: VersionScene): string[] {
  const parts = new Map(scene.parts.map((part) => [part.id, part]));

  return scene.parts.flatMap((part) =>
    (part.mates ?? []).flatMap((mate) => {
      const target = parts.get(mate.target);
      const from = findPort(part, mate.port) ? [] : [`port:${part.id}:${mate.port}`];
      const to = target && !findPort(target, mate.targetPort) ? [`port:${target.id}:${mate.targetPort}`] : [];

      return [...from, ...to];
    }),
  );
}

export function danglingReferences(scene: VersionScene): string[] {
  const partIds = new Set(scene.parts.map((part) => part.id));
  const joints = scene.project.joints ?? [];
  const jointIds = new Set(joints.map((joint) => joint.id));
  const partRefs = scene.parts.flatMap((part) => [part.mirrorOf?.id, ...(part.mates ?? []).map((mate) => mate.target)]);
  const jointPartRefs = joints.flatMap((joint) => [
    ...joint.parent,
    ...joint.child,
    ...(joint.actuators ?? []),
    joint.frame?.part,
  ]);
  const jointRefs = joints.flatMap((joint) => [joint.parentJoint, joint.loop?.driver]);
  const routes = scene.project.wiring ?? [];
  const projectRefs = [
    ...(scene.project.marks ?? []).flatMap((mark) => mark.partIds),
    ...routes.flatMap((route) => [
      route.from.partId,
      route.to.partId,
      ...(route.anchors ?? []).map((anchor) => anchor.partId),
    ]),
    ...(scene.project.interfaces?.contracts ?? []).flatMap((contract) => contract.ids),
  ];
  const missingParts = [...partRefs, ...jointPartRefs, ...projectRefs].filter(
    (id): id is string => !!id && !partIds.has(id),
  );
  const interfaceJoints = (scene.project.interfaces?.contracts ?? []).flatMap((contract) =>
    contract.datums.map((datum) => datum.joint),
  );
  const missingFrames = scene.parts
    .filter((part) => part.frame && !zUpFrame(scene.project, part.frame))
    .map((part) => `frame:${part.frame}`);
  const missingJoints = [...jointRefs, ...interfaceJoints].filter((id): id is string => !!id && !jointIds.has(id));

  return [
    ...new Set([
      ...missingParts.map((id) => `part:${id}`),
      ...missingJoints.map((id) => `joint:${id}`),
      ...danglingMatePorts(scene),
      ...missingFrames,
    ]),
  ];
}

function dependencyLabels(keys: Set<string>, units: Units): DesignMerge['dependencies'] {
  return [...keys].map((key) => {
    const value = units.get(key);
    const name =
      value && typeof value === 'object' && 'name' in value && typeof value.name === 'string'
        ? value.name
        : key.slice(key.indexOf(':') + 1).replace(/([a-z])([A-Z])/g, '$1 $2');

    return { key, name };
  });
}

export function mergeDesigns(request: MergeRequest): DesignMerge {
  const units = { base: unitsOf(request.base), ours: unitsOf(request.ours), theirs: unitsOf(request.theirs) };

  for (const [key, value] of Object.entries(request.baseByUnit ?? {})) units.base.set(key, value);

  const { selected, edits } = selectedClosure(request, units);
  const result = new Map(units.ours);
  const conflicts: string[] = [];

  for (const key of selected) {
    const keepDependency = !edits.has(key) && units.ours.has(key) && !request.resolutions?.[key];
    const picked = keepDependency ? { value: units.ours.get(key), conflict: false } : selectValue(key, request, units);

    if (picked.conflict) conflicts.push(key);

    if (picked.value === undefined) result.delete(key);
    else result.set(key, picked.value);
  }

  const scene = {
    ...mergedScene(request.ours, result),
    worldAssets: { ...request.ours.worldAssets, ...request.theirs.worldAssets },
  };
  const dangling = danglingReferences(scene);

  return {
    scene: conflicts.length || dangling.length ? null : scene,
    conflicts,
    dangling,
    required: [...selected],
    dependencies: dependencyLabels(selected, new Map([...units.base, ...units.ours, ...units.theirs])),
  };
}
