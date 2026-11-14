import type { PoseSample } from '../../operator/poseFollow';
import {
  ADULT,
  direction,
  HANGING,
  mirror,
  motion,
  move,
  phases,
  still,
  type Arm,
  type BodyPose,
  type Person,
  type Phase,
} from './body';

const REST: BodyPose = { left: HANGING, right: mirror(HANGING) };
const D2R = Math.PI / 180;

const UP: Arm = { upper: direction(0.15, 1, 0.05), fore: direction(0.05, 1, 0.05), hand: 'palm' };
const OUT: Arm = { upper: direction(1, 0.05, 0.1), fore: direction(1, 0.05, 0.1) };
const THUMB_UP: Arm = { upper: direction(0.15, -0.8, 0.6), fore: direction(-0.2, 0.35, 1), hand: 'thumb-up' };
const PALM: Arm = { upper: direction(0.1, -0.5, 0.85), fore: direction(0, 1, 0.1), hand: 'palm' };
const CLAP_OPEN: Arm = { upper: direction(0.3, -0.6, 0.75), fore: direction(0.6, 0.2, 1) };
const CLAP_SHUT: Arm = { upper: direction(0.3, -0.6, 0.75), fore: direction(-1, 0.2, 0.6) };

const waveArm = (deg: number): Arm => ({
  upper: direction(0.95, 0.1, 0.3),
  fore: direction(Math.sin(deg * D2R), Math.cos(deg * D2R), 0.15),
  hand: 'palm',
});

const salute = (reach: number): Arm => ({ upper: direction(1, 0.1, 0.35), fore: direction(-0.75 * reach, 0.55, 0.35) });

const circleArm = (deg: number): Arm => {
  const d = direction(Math.sin(deg * D2R), -Math.cos(deg * D2R), 0.2);

  return { upper: d, fore: d };
};

const scratchArm = (deg: number): Arm => ({
  upper: direction(0.9, 0.35, 0.1),
  fore: direction(-0.95 + Math.sin(deg * D2R) * 0.08, 0.32, -0.08),
});

type Side = 'left' | 'right';

const withArm = (side: Side, arm: Arm, pose: BodyPose = REST): BodyPose =>
  side === 'left' ? { ...pose, left: arm } : { ...pose, right: mirror(arm) };

const sequence = (list: Phase[], person: Person) => {
  const { seconds, at } = phases(list);

  return motion(seconds, at, person);
};

function held(arm: (side: Side) => BodyPose, options: { holdS?: number; person?: Person } = {}): PoseSample[] {
  const pose = arm('right');

  return sequence(
    [still(0.4), move(0.4, REST, pose), still(options.holdS ?? 1, pose), move(0.4, pose, REST), still(0.4)],
    options.person ?? ADULT,
  );
}

export interface WaveOptions {
  side?: Side;
  waveS?: number;
  hz?: number;
  person?: Person;
  facingDeg?: number;
}

export function wave({ side = 'right', waveS = 1.5, hz = 2.5, person = ADULT, facingDeg = 0 }: WaveOptions = {}) {
  const start = withArm(side, waveArm(0));
  const facing = (pose: BodyPose): BodyPose => ({ ...pose, facingDeg });

  return sequence(
    [
      still(0.4, facing(REST)),
      move(0.4, facing(REST), facing(start)),
      { seconds: waveS, pose: (t) => facing(withArm(side, waveArm(28 * Math.sin(2 * Math.PI * hz * t)))) },
      move(0.4, facing(start), facing(REST)),
      still(0.4, facing(REST)),
    ],
    person,
  );
}

export const raiseHand = (side: Side = 'right') => held(() => withArm(side, UP));

export const raiseBothHands = () => held(() => ({ left: UP, right: mirror(UP) }));

export const pointLeft = () => held(() => withArm('left', OUT));

export const pointRight = () => held(() => withArm('right', OUT));

export const thumbsUp = () => held(() => withArm('right', THUMB_UP));

export const openPalm = () => held(() => withArm('right', PALM));

export function clap(times = 2): PoseSample[] {
  const open: BodyPose = { left: CLAP_OPEN, right: mirror(CLAP_OPEN) };
  const shut: BodyPose = { left: CLAP_SHUT, right: mirror(CLAP_SHUT) };
  const claps = Array.from({ length: times }, () => [move(0.2, open, shut), move(0.25, shut, open), still(0.6, open)]);

  return sequence([still(0.4), move(0.5, REST, open), still(0.3, open), ...claps.flat(), move(0.5, open, REST)], ADULT);
}

const head = (pitchDeg: number, yawDeg: number): BodyPose => ({ ...REST, pitchDeg, yawDeg });

export const nod = () =>
  sequence(
    [
      still(0.4),
      move(0.25, head(0, 0), head(20, 0)),
      move(0.25, head(20, 0), head(0, 0)),
      move(0.25, head(0, 0), head(20, 0)),
      move(0.25, head(20, 0), head(0, 0)),
      still(0.6),
    ],
    ADULT,
  );

export const shakeHead = () =>
  sequence(
    [
      still(0.4),
      move(0.2, head(0, 0), head(0, 30)),
      move(0.35, head(0, 30), head(0, -30)),
      move(0.35, head(0, -30), head(0, 30)),
      move(0.2, head(0, 30), head(0, 0)),
      still(0.6),
    ],
    ADULT,
  );

export function saluteMotion(variant = 0): PoseSample[] {
  const pose = withArm('right', salute(1 + variant * 0.05));
  const person = { ...ADULT, seed: 500 + variant };
  const speed = 1 + variant * 0.12;

  return sequence(
    [still(0.4), move(0.45 * speed, REST, pose), still(0.6, pose), move(0.4 * speed, pose, REST), still(0.4)],
    person,
  );
}

export function armCircle(variant = 0): PoseSample[] {
  const seconds = 1.4 + variant * 0.12;
  const person = { ...ADULT, seed: 600 + variant };
  const circling: Phase = { seconds, pose: (t) => withArm('right', circleArm((360 * t) / seconds)) };

  return sequence(
    [still(0.4, withArm('right', circleArm(0))), circling, still(0.4, withArm('right', circleArm(0)))],
    person,
  );
}

export function walkPastScratching(): PoseSample[] {
  const walking = (t: number): BodyPose => {
    const swing = 0.35 * Math.sin(2 * Math.PI * t);
    const arm: Arm = { upper: direction(0.1, -1, swing), fore: direction(0.05, -1, swing + 0.15) };

    return {
      left: arm,
      right: mirror({ ...arm, upper: direction(0.1, -1, -swing), fore: direction(0.05, -1, 0.15 - swing) }),
      facingDeg: 60,
      at: [-1 + t * 0.6, 0, 0],
    };
  };
  const stop: BodyPose = { ...walking(2), facingDeg: 30 };
  const scratching = (t: number): BodyPose => ({
    ...stop,
    ...withArm('right', scratchArm(Math.sin(2 * Math.PI * 4 * t) * 45), stop),
  });
  const after = (t: number): BodyPose => ({ ...walking(2 + t), facingDeg: 60 });

  return sequence(
    [
      { seconds: 2, pose: walking },
      move(0.4, walking(2), scratching(0)),
      { seconds: 1.5, pose: scratching },
      move(0.4, scratching(1.5), after(0)),
      { seconds: 1.5, pose: after },
    ],
    ADULT,
  );
}

export const SMALL_AND_FAR: Person = { scale: 0.7, noiseM: 0.006, seed: 7 };
