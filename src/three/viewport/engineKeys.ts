import type { AgentFrame, Viewport3DHandle, ViewportProps } from './types';

export const GIZMO_KEYS: Array<keyof ViewportProps> = [
  'transformMode',
  'snapStepMm',
  'snapAngleDeg',
  'selectedPartIds',
  'parts',
  'poseJoint',
  'pose',
  'measureMode',
  'markMode',
  'axisPick',
  'buildStep',
];

export const FIGURE_KEYS: Array<keyof ViewportProps> = ['figures', 'humanHeightMm', 'measureKind', 'measureMode'];

export const NEEDS_WHOLE_SCENE: Array<keyof Viewport3DHandle> = [
  'captureScreenshot',
  'captureViews',
  'interference',
  'fastenerChains',
  'assembly',
  'posedInterference',
  'posedFloor',
  'meshGaps',
  'restBounds',
  'restShapes',
  'silhouetteShots',
  'measureParts',
  'visibleShares',
  'printShapes',
  'printMeshes',
  'printThreeMf',
  'fitCoupons',
  'exportStl',
  'sheetProfiles',
  'exportCutFiles',
  'exportUsdz',
  'partTriangles',
  'servoOutput',
  'jointAxis',
  'jointAxes',
  'sweepClashes',
  'strength',
  'pickAt',
  'focusSelected',
  'measureFrom',
];

export const changed = (a: ViewportProps, b: ViewportProps, keys: Array<keyof ViewportProps>) =>
  keys.some((k) => a[k] !== b[k]);

const sameFrame = (a: AgentFrame, b: AgentFrame) =>
  a.key === b.key &&
  a.color === b.color &&
  a.emphasis === b.emphasis &&
  a.partIds.length === b.partIds.length &&
  a.partIds.every((id, i) => id === b.partIds[i]);

const sameFrames = (a: AgentFrame[] = [], b: AgentFrame[] = []) =>
  a.length === b.length && a.every((frame, i) => sameFrame(frame, b[i]));

export const steadyProps = (previous: ViewportProps, next: ViewportProps): ViewportProps =>
  previous.agentFrames !== next.agentFrames && sameFrames(previous.agentFrames, next.agentFrames)
    ? { ...next, agentFrames: previous.agentFrames }
    : next;

const bothCallbacks = (a: unknown, b: unknown) => typeof a === 'function' && typeof b === 'function';

export function shownPropsChanged(previous: ViewportProps, next: ViewportProps): boolean {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]) as Set<keyof ViewportProps>;

  return [...keys].some((key) => previous[key] !== next[key] && !bothCallbacks(previous[key], next[key]));
}
