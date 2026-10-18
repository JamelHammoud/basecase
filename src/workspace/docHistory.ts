import type { ScenePart } from '../types/robotics';
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
