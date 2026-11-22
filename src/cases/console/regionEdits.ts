import type { CameraRegions, Point } from '../../vision/tracking/types';
import type { CaseConsole } from './format';
import { MAX_REGION_CAMERAS } from './regions';

const taken = (regions: CameraRegions) =>
  new Set([...regions.zones, ...regions.lines].map((r) => r.name.toLowerCase()));

function freshName(regions: CameraRegions, kind: 'line' | 'zone') {
  const names = taken(regions);
  let n = 1;

  while (names.has(`${kind}${n}`)) n++;

  return `${kind}${n}`;
}

function withCamera(console: CaseConsole, camera: string, edit: (regions: CameraRegions) => CameraRegions) {
  const all = { ...console.regions };
  const next = edit(all[camera] ?? { zones: [], lines: [] });

  if (next.zones.length || next.lines.length) all[camera] = next;
  else delete all[camera];

  const { regions, ...rest } = console;

  void regions;

  return Object.keys(all).length ? { ...rest, regions: all } : rest;
}

export const addLine = (console: CaseConsole, camera: string, from: Point, to: Point): CaseConsole =>
  withCamera(console, camera, (regions) => ({
    ...regions,
    lines: [...regions.lines, { name: freshName(regions, 'line'), from, to }],
  }));

export const addZone = (console: CaseConsole, camera: string, points: Point[]): CaseConsole =>
  withCamera(console, camera, (regions) => ({
    ...regions,
    zones: [...regions.zones, { name: freshName(regions, 'zone'), points }],
  }));

export const clearRegions = (console: CaseConsole, camera: string): CaseConsole =>
  withCamera(console, camera, () => ({ zones: [], lines: [] }));

export const canAddCamera = (console: CaseConsole, camera: string) =>
  !!console.regions?.[camera] || Object.keys(console.regions ?? {}).length < MAX_REGION_CAMERAS;
