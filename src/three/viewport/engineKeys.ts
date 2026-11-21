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
  'cableRoute',
];

export const FIGURE_KEYS: Array<keyof ViewportProps> = ['figures', 'humanHeightMm', 'measureKind', 'measureMode'];

export const NEEDS_WHOLE_SCENE: Array<keyof Viewport3DHandle> = [
  'captureScreenshot',
  'captureViews',
  'interference',
  'fastenerChains',
  'wiring',
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
  'printStl',
  'fitCoupons',
  'exportStl',
  'exportUsdz',
  'partTriangles',
  'servoOutput',
  'jointAxis',
  'jointAxes',
  'sweepClashes',
  'strength',
  'lightenPart',
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

const SYNC_SCENE_READS = new Set<keyof Viewport3DHandle>([
  'restBounds',
  'restShapes',
  'silhouetteShots',
  'partTriangles',
  'servoOutput',
]);

function sceneReadIds(key: keyof Viewport3DHandle, args: unknown[]): string[] | undefined {
  if (key === 'partTriangles' || key === 'servoOutput') return [args[0] as string];

  if (key === 'restBounds' || key === 'restShapes') return args[0] as string[];

  return (args[1] as { onlyIds?: string[] } | undefined)?.onlyIds;
}

const NULLABLE_SCENE_READS = new Set<keyof Viewport3DHandle>(['restBounds', 'partTriangles', 'servoOutput']);

function completeRead(key: keyof Viewport3DHandle, args: unknown[], complete: (ids?: string[]) => void) {
  try {
    complete(SYNC_SCENE_READS.has(key) ? sceneReadIds(key, args) : undefined);

    return true;
  } catch (error) {
    if (NULLABLE_SCENE_READS.has(key) && error instanceof Error && error.name === 'AbortError') return false;

    throw error;
  }
}

export function completing(
  api: Viewport3DHandle,
  complete: (ids?: string[]) => void,
  ready: () => Promise<string[]>,
): Viewport3DHandle {
  const wrapped = { ...api } as Record<string, (...args: never[]) => unknown>;

  for (const key of NEEDS_WHOLE_SCENE) {
    const run = api[key] as (...args: never[]) => unknown;

    const finished = (...args: never[]) => {
      if (!completeRead(key, args, complete)) return null;

      return run(...args);
    };

    wrapped[key] = SYNC_SCENE_READS.has(key) ? finished : (...args) => ready().then(() => finished(...args));
  }

  return wrapped as unknown as Viewport3DHandle;
}
