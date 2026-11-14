import { SEGMENT_VERBS, segmentLabel, type SegmentVerb, type TrySegment } from '../cases/tryLabels';
import type { Recording } from '../sim/recorder';
import { frameLabels } from './segmentRules';
import { SEGMENT_RULES, framesOf, type FrameLabel, type SegmentInput } from './segmentTypes';

export type { SegmentBase, SegmentInput, SegmentJaw, SegmentObject } from './segmentTypes';

interface Run extends FrameLabel {
  from: number;
  to: number;
}

interface VerbEvent {
  from: number;
  verb: SegmentVerb;
}

const isVerb = (name: string): name is SegmentVerb => (SEGMENT_VERBS as readonly string[]).includes(name);

const inside = (frames: number) => (f: number) => Number.isInteger(f) && f > 0 && f < frames;

function inputMarks(r: Recording) {
  const verbs: VerbEvent[] = [];
  const cuts: number[] = [];

  for (const input of r.inputs ?? []) {
    if (input.value === false || input.value === 0 || input.value === '') continue;

    const from = Math.round(input.at / r.dt);
    const name = input.name.trim().toLowerCase();

    cuts.push(from);

    if (isVerb(name) && from >= 0 && from < r.frames) verbs.push({ from, verb: name });
  }

  return { verbs, cuts };
}

function markVerbs(labels: FrameLabel[], verbs: VerbEvent[], hard: number[], dt: number) {
  const longest = framesOf(SEGMENT_RULES.verbEventS, dt);

  for (const { from, verb } of verbs) {
    const next = hard.find((f) => f > from) ?? labels.length;

    labels.fill({ verb, object: -1 }, from, Math.min(from + longest, next, labels.length));
  }
}

const sameLabel = (a: FrameLabel, b: FrameLabel) => a.verb === b.verb && a.object === b.object;

function runsOf(labels: FrameLabel[]): Run[] {
  const runs: Run[] = [];

  labels.forEach((label, f) => {
    const last = runs.at(-1);

    if (last && sameLabel(last, label)) last.to = f + 1;
    else runs.push({ ...label, from: f, to: f + 1 });
  });

  return runs;
}

function mergeSame(runs: Run[]): Run[] {
  const out: Run[] = [];

  for (const run of runs) {
    const last = out.at(-1);

    if (last && sameLabel(last, run)) last.to = run.to;
    else out.push({ ...run });
  }

  return out;
}

function absorbShort(runs: Run[], least: number): Run[] {
  const out = runs.map((r) => ({ ...r }));

  for (let i = out.findIndex((r) => r.to - r.from < least); i >= 0 && out.length > 1;) {
    const [short] = out.splice(i, 1);

    if (i > 0) out[i - 1].to = short.to;
    else out[0].from = short.from;

    i = out.findIndex((r) => r.to - r.from < least);
  }

  return out;
}

function cutAt(run: Run, hard: number[], least: number): Run[] {
  const pieces: Run[] = [];
  let from = run.from;

  for (const at of hard) {
    if (at - from < least || run.to - at < least) continue;

    pieces.push({ ...run, from, to: at });
    from = at;
  }

  return [...pieces, { ...run, from }];
}

const labelOf = (input: SegmentInput, run: Run) =>
  segmentLabel(run.verb, run.object >= 0 ? input.objects[run.object]?.name.trim().toLowerCase() : null);

export function segmentTry(input: SegmentInput): TrySegment[] {
  const r = input.recording;

  if (r.frames < 1) return [];

  const marks = inputMarks(r);
  const hard = [...new Set([...input.stages, ...marks.cuts].filter(inside(r.frames)))].sort((a, b) => a - b);
  const labels = frameLabels(input);
  const least = framesOf(SEGMENT_RULES.minSegmentS, r.dt);

  markVerbs(labels, marks.verbs, hard, r.dt);

  const runs = mergeSame(absorbShort(runsOf(labels), least)).flatMap((run) =>
    cutAt(
      run,
      hard.filter((at) => at > run.from && at < run.to),
      least,
    ),
  );

  return runs.map((run) => ({ from: run.from, to: run.to, label: labelOf(input, run) }));
}
