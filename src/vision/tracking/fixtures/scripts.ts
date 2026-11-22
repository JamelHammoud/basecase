import type { CameraRegions, Point, TrackInput, TrackingSnapshot } from '../types';

export type Path = (second: number) => Point | undefined;

export interface ScriptedObject {
  label: string;
  size: [number, number];
  at: Path;
}

export interface Summary {
  crossings: Record<string, [number, number]>;
  zonePeak: Record<string, number>;
  zoneEnd: Record<string, number>;
  dwellMax: Record<string, number>;
  objectIds: number[][];
  trackPeak: number;
}

export interface Workflow {
  id: string;
  seconds: number;
  fps: number;
  classes: string[];
  objects: ScriptedObject[];
  regions: CameraRegions;
  expect: Partial<Summary>;
}

export interface ScriptedFrame {
  timestamp: number;
  objects: { present: boolean; centre: Point }[];
}

export const START_MS = 1000;

export const walk =
  (from: Point, to: Point, start: number, end: number): Path =>
  (second) => {
    if (second < start || second > end) return undefined;

    const along = end === start ? 1 : (second - start) / (end - start);

    return [from[0] + (to[0] - from[0]) * along, from[1] + (to[1] - from[1]) * along];
  };

export const stay =
  (at: Point, start: number, end: number): Path =>
  (second) =>
    second >= start && second <= end ? at : undefined;

export const except =
  (path: Path, ...gaps: [number, number][]): Path =>
  (second) =>
    gaps.some(([from, to]) => second >= from && second <= to) ? undefined : path(second);

export const either =
  (...paths: Path[]): Path =>
  (second) => {
    for (const path of paths) {
      const at = path(second);

      if (at) return at;
    }

    return undefined;
  };

export const framesOf = (workflow: Workflow): ScriptedFrame[] =>
  Array.from({ length: Math.round(workflow.seconds * workflow.fps) + 1 }, (_, index) => {
    const second = index / workflow.fps;

    return {
      timestamp: START_MS + Math.round(second * 1000),
      objects: workflow.objects.map((object) => {
        const at = object.at(second);

        return { present: !!at, centre: at ?? [0, 0] };
      }),
    };
  });

export function boxOf(object: ScriptedObject, centre: Point): [number, number, number, number] {
  return [centre[0] - object.size[0] / 2, centre[1] - object.size[1] / 2, object.size[0], object.size[1]];
}

export const detectionsOf = (workflow: Workflow, frame: ScriptedFrame): TrackInput[] =>
  workflow.objects.flatMap((object, index) =>
    frame.objects[index].present
      ? [{ label: object.label, score: 0.9, box: boxOf(object, frame.objects[index].centre) }]
      : [],
  );

export function summarize(workflow: Workflow, frames: ScriptedFrame[], snapshots: TrackingSnapshot[]): Summary {
  const summary: Summary = {
    crossings: {},
    zonePeak: {},
    zoneEnd: {},
    dwellMax: {},
    objectIds: workflow.objects.map(() => []),
    trackPeak: 0,
  };
  const last = snapshots.at(-1);

  for (const line of last?.lines ?? []) summary.crossings[line.name] = [line.in, line.out];

  for (const zone of workflow.regions.zones) {
    summary.zonePeak[zone.name] = 0;
    summary.dwellMax[zone.name] = 0;
  }

  snapshots.forEach((snapshot, at) => {
    summary.trackPeak = Math.max(summary.trackPeak, snapshot.tracks.length);

    for (const zone of snapshot.zones) {
      summary.zonePeak[zone.name] = Math.max(summary.zonePeak[zone.name], zone.count);
      summary.dwellMax[zone.name] = Math.max(summary.dwellMax[zone.name], zone.dwell);
    }

    workflow.objects.forEach((object, index) => {
      const truth = frames[at].objects[index];
      const track = snapshot.tracks.find(
        (candidate) =>
          candidate.label === object.label &&
          !candidate.coasting &&
          Math.hypot(
            candidate.box[0] + candidate.box[2] / 2 - truth.centre[0],
            candidate.box[1] + candidate.box[3] / 2 - truth.centre[1],
          ) < 0.04,
      );

      if (truth.present && track && !summary.objectIds[index].includes(track.id))
        summary.objectIds[index].push(track.id);
    });
  });

  for (const zone of last?.zones ?? []) summary.zoneEnd[zone.name] = zone.count;

  return summary;
}
