import type { Case } from '../cases/schema';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import type { RobotUpgrade } from '../utils/robotImport';
import { patchParts } from '../utils/robotUpgrade';
import type { DocState, Snapshot } from './types';

export const HISTORY_LIMIT = 50;

export const EMPTY_DOC: DocState = { parts: [], past: [], future: [], base: null };

export const docFromParts = (parts: ScenePart[]): DocState => ({ parts, past: [], future: [], base: null });

export const pushHistory = (d: DocState, parts: ScenePart[], snapshot: Omit<Snapshot, 'parts'>): DocState => ({
  parts,
  past: [...d.past.slice(-(HISTORY_LIMIT - 1)), { ...snapshot, parts: d.base ?? d.parts }],
  future: [],
  base: null,
});

export const liveEdit = (d: DocState, parts: ScenePart[]): DocState => ({ ...d, base: d.base ?? d.parts, parts });

export type HistoryDirection = 'undo' | 'redo';

type Consoles = NonNullable<Snapshot['consoles']>;

export const consolesOf = (cases: Case[] | undefined, ids: string[]): Consoles =>
  Object.fromEntries(ids.map((id) => [id, cases?.find((c) => c.id === id)?.console]));

export const withCaseConsoles = (cases: Case[] | undefined, consoles: Consoles) =>
  cases?.map((c) => (c.id in consoles ? { ...c, console: consoles[c.id] } : c));

export const trackedOf = ({ pose, joints, marks, skeleton }: ProjectSettings): Omit<Snapshot, 'parts'> => ({
  pose,
  joints,
  marks,
  skeleton,
});

const nextStep = (d: DocState, direction: HistoryDirection) => (direction === 'undo' ? d.past : d.future).at(-1);

function supplyFor(next: Snapshot | undefined, project: ProjectSettings): Partial<Snapshot> {
  return {
    ...(next && 'tether' in next ? { tether: project.tether } : {}),
    ...(next?.consoles ? { consoles: consolesOf(project.cases, Object.keys(next.consoles)) } : {}),
  };
}

function restoredProject(to: Snapshot, here: Snapshot, cases: Case[] | undefined): Partial<ProjectSettings> {
  return {
    ...(to.joints === here.joints ? {} : { joints: to.joints }),
    ...(to.marks === here.marks ? {} : { marks: to.marks }),
    ...(to.skeleton === here.skeleton ? {} : { skeleton: to.skeleton }),
    ...('tether' in to && to.tether !== here.tether ? { tether: to.tether } : {}),
    ...(to.consoles ? { cases: withCaseConsoles(cases, to.consoles) } : {}),
  };
}

export interface HistoryStep {
  direction: HistoryDirection;
  codeOnly?: boolean;
}

export function travelProject(d: DocState, project: ProjectSettings, { direction, codeOnly = false }: HistoryStep) {
  const next = nextStep(d, direction);

  if (codeOnly && !next?.consoles) return null;

  const here: Snapshot = { parts: d.parts, ...trackedOf(project), ...supplyFor(next, project) };
  const moved = stepHistory(d, here, direction);

  if (!moved) return null;

  return { ...moved, here, project: { ...project, ...restoredProject(moved.to, here, project.cases) } };
}

export function stepHistory(
  d: DocState,
  here: Snapshot,
  direction: HistoryDirection,
): { doc: DocState; to: Snapshot } | null {
  const from = direction === 'undo' ? d.past : d.future;

  if (from.length === 0) return null;

  const to = from[from.length - 1];
  const rest = from.slice(0, -1);
  const doc: DocState =
    direction === 'undo'
      ? { parts: to.parts, past: rest, future: [...d.future, here], base: null }
      : { parts: to.parts, past: [...d.past, here], future: rest, base: null };

  return { doc, to };
}

export const patchJoints = (up: RobotUpgrade, js: Snapshot['joints']) =>
  up.joints.size && js ? js.map((j) => (up.joints.has(j.id) ? { ...j, ...up.joints.get(j.id) } : j)) : js;

export function patchEveryState(d: DocState, patch: (parts: ScenePart[]) => ScenePart[]): DocState {
  const snap = (sn: Snapshot) => {
    const parts = patch(sn.parts);

    return parts === sn.parts ? sn : { ...sn, parts };
  };

  const states = (list: Snapshot[]) => {
    const next = list.map(snap);

    return next.every((sn, i) => sn === list[i]) ? list : next;
  };
  const next = {
    parts: patch(d.parts),
    past: states(d.past),
    future: states(d.future),
    base: d.base ? patch(d.base) : d.base,
  };
  const same = (Object.keys(next) as Array<keyof DocState>).every((key) => next[key] === d[key]);

  return same ? d : next;
}

export function upgradeDoc(d: DocState, up: RobotUpgrade): DocState {
  const patch = (ps: ScenePart[]) => patchParts(ps, up);
  const snap = (sn: Snapshot) => ({ ...sn, parts: patch(sn.parts), joints: patchJoints(up, sn.joints) });

  return {
    ...d,
    parts: patch(d.parts),
    past: d.past.map(snap),
    future: d.future.map(snap),
    base: d.base ? patch(d.base) : d.base,
  };
}
