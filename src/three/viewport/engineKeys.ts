import type { Viewport3DHandle, ViewportProps } from './types';

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
  'silhouetteShots',
  'measureParts',
  'visibleShares',
  'printShapes',
  'printMeshes',
  'printThreeMf',
  'exportUsdz',
  'partTriangles',
  'servoOutput',
  'jointAxis',
  'sweepClashes',
  'pickAt',
  'focusSelected',
  'measureFrom',
];

export const changed = (a: ViewportProps, b: ViewportProps, keys: Array<keyof ViewportProps>) =>
  keys.some((k) => a[k] !== b[k]);
