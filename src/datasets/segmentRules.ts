import type { SegmentVerb } from '../cases/tryLabels';
import { nearestObject, objectTracks, type ObjectTrack } from './segmentObjects';
import { baseMotion, baseVerb, gripClosed, jointSpeeds, pausesOf, type BaseMotion } from './segmentSignals';
import { SEGMENT_RULES, framesOf, type FrameLabel, type SegmentInput } from './segmentTypes';

interface SegmentSignals {
  grip: boolean[] | null;
  jointPause: boolean[];
  base: BaseMotion | null;
  tracks: ObjectTrack[] | null;
}

const RESTING = new Set<SegmentVerb>(['idle', 'stand']);

function signalsOf(input: SegmentInput): SegmentSignals {
  const r = input.recording;
  const speeds = jointSpeeds(r);

  return {
    grip: gripClosed(r, input.jaws),
    jointPause: pausesOf(
      Array.from(speeds, (s) => s < SEGMENT_RULES.stillJoint),
      r.dt,
    ),
    base: input.base === 'fixed' ? null : baseMotion(r),
    tracks: objectTracks(input),
  };
}

function filled(verbs: Array<SegmentVerb | null>, fallback: SegmentVerb): SegmentVerb[] {
  const first = verbs.find((v) => v !== null) ?? fallback;
  let last: SegmentVerb = first;

  return verbs.map((v) => (last = v ?? last));
}

function motionVerbs(input: SegmentInput, s: SegmentSignals): SegmentVerb[] {
  const { base } = s;

  if (!base) return s.jointPause.map((paused) => (paused ? 'idle' : 'reach'));

  const armed = input.jaws.length > 0 || input.hand !== null;
  const raw = s.jointPause.map((_, f) => baseVerb(base, f));
  const resting = pausesOf(
    raw.map((v) => v === null),
    input.recording.dt,
  );
  const restingVerb = (f: number): SegmentVerb => (armed && !s.jointPause[f] ? 'reach' : 'stand');

  return filled(
    raw.map((v, f) => (resting[f] ? restingVerb(f) : v)),
    'stand',
  );
}

function gripVerbs(grip: boolean[], motion: SegmentVerb[], dt: number): SegmentVerb[] {
  const action = framesOf(SEGMENT_RULES.gripActionS, dt);
  let closedAt = -Infinity;
  let openedAt = -Infinity;

  return motion.map((verb, f) => {
    if (f > 0 && grip[f] && !grip[f - 1]) closedAt = f;

    if (f > 0 && !grip[f] && grip[f - 1]) openedAt = f;

    if (f - closedAt < action) return 'grasp';

    if (f - openedAt < action) return 'release';

    return grip[f] && closedAt > openedAt && !RESTING.has(verb) ? 'carry' : verb;
  });
}

interface Hold {
  object: number;
  lifted: boolean;
  released: number;
}

function verticalVerb(track: ObjectTrack, f: number): SegmentVerb {
  const rise = track.rise[f];

  if (rise > SEGMENT_RULES.moveMmS && rise >= track.slide[f]) return 'lift';

  if (-rise > SEGMENT_RULES.moveMmS && -rise >= track.slide[f]) return 'place';

  return 'carry';
}

function heldVerb(track: ObjectTrack, f: number, hold: Hold): SegmentVerb {
  const vertical = verticalVerb(track, f);

  if (track.raised[f]) {
    hold.lifted = true;

    return vertical;
  }

  if (hold.lifted) return 'place';

  return vertical === 'lift' ? 'lift' : 'grasp';
}

function looseLabel(tracks: ObjectTrack[], f: number, o: number, motion: SegmentVerb): FrameLabel {
  if (o < 0) return { verb: motion, object: -1 };

  return { verb: tracks[o].slide[f] > SEGMENT_RULES.pushMmS ? 'push' : 'reach', object: o };
}

interface FrameState {
  f: number;
  closed: boolean;
  motion: SegmentVerb;
}

function holdOn(hold: Hold, o: number) {
  if (hold.object !== o) Object.assign(hold, { object: o, lifted: false });

  hold.released = -1;
}

function objectLabel(tracks: ObjectTrack[], { f, closed, motion }: FrameState, hold: Hold): FrameLabel {
  const o = nearestObject(tracks, f);

  if (closed && o >= 0) {
    holdOn(hold, o);

    return { verb: heldVerb(tracks[o], f, hold), object: o };
  }

  if (!closed && hold.object >= 0 && o === hold.object) hold.released = o;

  hold.object = -1;

  if (o >= 0 && o === hold.released) return { verb: 'release', object: o };

  hold.released = -1;

  return looseLabel(tracks, f, o, motion);
}

function nameReaches(labels: FrameLabel[]): FrameLabel[] {
  const out = labels.map((l) => ({ ...l }));
  let next = -1;

  for (let f = out.length - 1; f >= 0; f--) {
    const label = out[f];
    const unnamedReach = label.verb === 'reach' && label.object < 0;

    if (unnamedReach && next >= 0) label.object = next;
    else if (!unnamedReach) next = label.object;
  }

  return out;
}

export function frameLabels(input: SegmentInput): FrameLabel[] {
  const s = signalsOf(input);
  const motion = motionVerbs(input, s);
  const { grip, tracks } = s;

  if (!tracks) {
    const verbs = grip ? gripVerbs(grip, motion, input.recording.dt) : motion;

    return verbs.map((verb) => ({ verb, object: -1 }));
  }

  const hold: Hold = { object: -1, lifted: false, released: -1 };

  return nameReaches(
    motion.map((verb, f) => objectLabel(tracks, { f, closed: grip?.[f] ?? false, motion: verb }, hold)),
  );
}
