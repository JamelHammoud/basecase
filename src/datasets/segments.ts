import {
  across,
  bodyAt,
  distance,
  effectorAt,
  gripRuns,
  IDLE_S,
  pausesOf,
  speeds,
  STILL_MM_S,
  type Run,
  type SegmentFrames,
  type SegmentObject,
  type SegmentRobot,
} from './segmentFrames';
import { mobileLabels } from './segmentMobile';

export const SEGMENT_VERBS = [
  'reach',
  'grasp',
  'lift',
  'carry',
  'place',
  'release',
  'push',
  'walk',
  'drive',
  'turn',
  'stand',
  'sit',
  'wave',
  'idle',
] as const;

export type SegmentVerb = (typeof SEGMENT_VERBS)[number];

export interface Segment {
  start: number;
  end: number;
  label: string;
}

export interface SegmentEvent {
  at: number;
  name: string;
}

export interface SegmentMarks {
  stages: number[];
  events: SegmentEvent[];
  real: boolean;
}

export interface SegmentInput {
  frames: SegmentFrames;
  robot: SegmentRobot;
  marks: SegmentMarks;
}

interface Layer {
  labels: string[];
  cuts: Set<number>;
}

const NEAR_MM = 25;
const LIFT_MM = 5;
const CARRY_MM = 10;
const SETTLED_MM = 2;

export const segmentLabel = (verb: SegmentVerb, object?: string | null) =>
  object ? `${verb} the ${object.trim().toLowerCase()}` : verb;

const reachOf = (o: SegmentObject) => o.sizeMm * 0.87 + NEAR_MM;

function fill(layer: Layer, from: number, to: number, label: string) {
  for (let f = Math.max(0, from); f < Math.min(to, layer.labels.length); f++) layer.labels[f] = label;

  if (from > 0 && from < layer.labels.length) layer.cuts.add(from);
}

function heldObject(r: SegmentFrames, robot: SegmentRobot, frame: number): SegmentObject | null {
  if (!robot.effector) return null;

  const hand = effectorAt(r, frame, robot.effector);
  let best: SegmentObject | null = null;
  let bestMm = Infinity;

  for (const o of robot.objects) {
    const mm = distance(hand, bodyAt(r, frame, o.body));

    if (mm < reachOf(o) && mm < bestMm) [best, bestMm] = [o, mm];
  }

  return best;
}

function firstFrame(from: number, to: number, test: (f: number) => boolean): number | null {
  for (let f = from; f < to; f++) if (test(f)) return f;

  return null;
}

function backTo(from: number, floor: number, still: (f: number) => boolean): number {
  let f = from;

  while (f > floor && !still(f - 1)) f--;

  return f;
}

function placeFrom(r: SegmentFrames, body: number, run: Run) {
  const height = (f: number) => bodyAt(r, f, body)[1];
  let peak = -Infinity;

  for (let f = run.start; f < run.end; f++) peak = Math.max(peak, height(f));

  if (height(run.end - 1) > peak - LIFT_MM) return null;

  let last = run.start;

  for (let f = run.start; f < run.end; f++) if (height(f) >= peak - SETTLED_MM) last = f;

  return last + 1;
}

function holdPhases(r: SegmentFrames, hold: Run, object: SegmentObject, layer: Layer) {
  const name = object.name;
  const rest = bodyAt(r, hold.start, object.body);
  const height = (f: number) => bodyAt(r, f, object.body)[1] - rest[1];
  const rose = firstFrame(hold.start, hold.end, (f) => height(f) > LIFT_MM);

  fill(layer, hold.start, hold.end, segmentLabel('grasp', name));

  if (rose === null) return;

  const lift = backTo(rose, hold.start, (f) => height(f) <= SETTLED_MM);
  const from = bodyAt(r, lift, object.body);
  const moved = firstFrame(lift, hold.end, (f) => across(bodyAt(r, f, object.body), from) > CARRY_MM);
  const carry =
    moved === null ? null : backTo(moved, lift, (f) => across(bodyAt(r, f, object.body), from) <= SETTLED_MM);
  const place = placeFrom(r, object.body, { start: carry ?? lift, end: hold.end });

  fill(layer, lift, hold.end, segmentLabel('lift', name));

  if (carry !== null) fill(layer, carry, hold.end, segmentLabel('carry', name));

  if (place !== null && place < hold.end) fill(layer, place, hold.end, segmentLabel('place', name));
}

interface Gap {
  run: Run;
  afterHold: boolean;
  released: SegmentObject | null;
  next: SegmentObject | null;
  pauses: Run[];
  moving: Float32Array;
}

function withdrawnAt(r: SegmentFrames, robot: SegmentRobot, gap: Gap): number | null {
  const { run, released } = gap;
  const hand = robot.effector;

  if (hand && released)
    return firstFrame(
      run.start,
      run.end,
      (f) => distance(effectorAt(r, f, hand), bodyAt(r, f, released.body)) > reachOf(released),
    );

  return firstFrame(run.start, run.end, (f) => gap.moving[f] >= STILL_MM_S);
}

function releaseEnd(r: SegmentFrames, robot: SegmentRobot, gap: Gap): number {
  const withdrawn = withdrawnAt(r, robot, gap);
  const pause = gap.pauses.find((p) => withdrawn !== null && p.start >= withdrawn && p.start < gap.run.end);

  return pause?.start ?? gap.run.end;
}

function fillGap(r: SegmentFrames, robot: SegmentRobot, gap: Gap, layer: Layer) {
  const { run } = gap;

  if (!gap.afterHold) {
    fill(layer, run.start, run.end, segmentLabel('reach', gap.next?.name));

    return;
  }

  const end = releaseEnd(r, robot, gap);
  const movesAfter = firstFrame(end, run.end, (f) => gap.moving[f] >= STILL_MM_S) !== null;
  const reaches = gap.next !== null || movesAfter;

  fill(layer, run.start, reaches ? end : run.end, segmentLabel('release', gap.released?.name));

  if (reaches && end < run.end) fill(layer, end, run.end, segmentLabel('reach', gap.next?.name));
}

function gripLayer(r: SegmentFrames, robot: SegmentRobot, holds: Run[], real: boolean): Layer {
  const layer: Layer = { labels: Array<string>(r.frames).fill('reach'), cuts: new Set() };
  const moving = speeds(r, robot.bodies);
  const pauses = pausesOf(r, moving);
  const objects = holds.map((h) => (real ? null : heldObject(r, robot, h.start)));

  holds.forEach((hold, i) => {
    const object = objects[i];

    if (object) holdPhases(r, hold, object, layer);
    else fill(layer, hold.start, hold.end, 'grasp');

    const end = holds[i + 1]?.start ?? r.frames;

    fillGap(
      r,
      robot,
      {
        run: { start: hold.end, end },
        afterHold: true,
        released: object,
        next: objects[i + 1] ?? null,
        pauses,
        moving,
      },
      layer,
    );
  });
  fillGap(
    r,
    robot,
    { run: { start: 0, end: holds[0].start }, afterHold: false, released: null, next: objects[0], pauses, moving },
    layer,
  );
  idleOver(layer, pausesOf(r, moving, IDLE_S), holds);

  return layer;
}

function idleOver(layer: Layer, idles: Run[], holds: Run[]) {
  for (const idle of idles) {
    const free = !holds.some((h) => h.start < idle.end && idle.start < h.end);

    if (free) {
      fill(layer, idle.start, idle.end, 'idle');
      layer.cuts.add(idle.end);
    }
  }
}

function pushedObject(r: SegmentFrames, robot: SegmentRobot, run: Run): SegmentObject | null {
  if (!robot.effector) return null;

  return (
    robot.objects.find((o) => {
      const from = bodyAt(r, run.start, o.body);

      return (
        across(bodyAt(r, run.end - 1, o.body), from) > CARRY_MM &&
        firstFrame(
          run.start,
          run.end,
          (f) => distance(effectorAt(r, f, robot.effector!), bodyAt(r, f, o.body)) < reachOf(o),
        ) !== null
      );
    }) ?? null
  );
}

function boutLayer(r: SegmentFrames, robot: SegmentRobot, real: boolean): Layer {
  const layer: Layer = { labels: Array<string>(r.frames).fill('reach'), cuts: new Set() };
  const moving = speeds(r, robot.bodies);
  const starts = [0, ...pausesOf(r, moving).flatMap((p) => (p.start > 0 && p.end < r.frames ? [p.end] : []))];

  starts.forEach((start, i) => {
    const run = { start, end: starts[i + 1] ?? r.frames };
    const pushed = real ? null : pushedObject(r, robot, run);

    fill(layer, run.start, run.end, pushed ? segmentLabel('push', pushed.name) : 'reach');
  });
  idleOver(layer, pausesOf(r, moving, IDLE_S), []);

  return layer;
}

const verbOf = (name: string) => SEGMENT_VERBS.find((v) => v === name.trim().toLowerCase()) ?? null;

function markEvents(r: SegmentFrames, robot: SegmentRobot, events: SegmentEvent[], layer: Layer) {
  const pauses = pausesOf(r, speeds(r, robot.bodies));
  const frames = [...events]
    .map((e) => ({ frame: Math.round(e.at / r.dt), verb: verbOf(e.name) }))
    .filter((e) => e.frame >= 0 && e.frame < r.frames)
    .sort((a, b) => a.frame - b.frame);

  frames.forEach((e, i) => {
    const next = frames[i + 1]?.frame ?? r.frames;
    const stops = pauses.find((p) => p.start > e.frame)?.start ?? r.frames;

    if (e.verb) fill(layer, e.frame, Math.min(next, stops), e.verb);

    if (e.frame > 0) layer.cuts.add(e.frame);
  });
}

function baseLayer({ frames: r, robot, marks }: SegmentInput): Layer {
  const holds = gripRuns(r, robot.jaws);

  if (holds.length) return gripLayer(r, robot, holds, marks.real);

  if (robot.mobility) return { labels: mobileLabels(r, robot), cuts: new Set() };

  return boutLayer(r, robot, marks.real);
}

function segmentsOf(layer: Layer): Segment[] {
  const out: Segment[] = [];

  layer.labels.forEach((label, f) => {
    const last = out.at(-1);

    if (last && last.label === label && !layer.cuts.has(f)) last.end = f + 1;
    else out.push({ start: f, end: f + 1, label: label || 'idle' });
  });

  return out;
}

const STAGE_GAP_S = 0.5;

function withStages(segments: Segment[], stages: number[], gap: number): Segment[] {
  return [...stages]
    .sort((a, b) => a - b)
    .reduce((list, stage) => {
      const i = list.findIndex((s) => s.start + gap <= stage && stage <= s.end - gap);

      if (i < 0) return list;

      const s = list[i];

      return [...list.slice(0, i), { ...s, end: stage }, { ...s, start: stage }, ...list.slice(i + 1)];
    }, segments);
}

export function segmentTry(input: SegmentInput): Segment[] {
  if (input.frames.frames < 1) return [];

  const layer = baseLayer(input);

  markEvents(input.frames, input.robot, input.marks.events, layer);

  const stages = input.marks.real ? [] : input.marks.stages;

  return withStages(segmentsOf(layer), stages, Math.round(STAGE_GAP_S / input.frames.dt));
}
