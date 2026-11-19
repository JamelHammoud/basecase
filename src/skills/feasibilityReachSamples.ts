import { seededRandom } from '../utils/seededRandom';
import { bodyPoint, norm, refresh, sub, type JointInfo, type Kin, type V3 } from './feasibilityKinematics';

const SAMPLES = 2048;
const REFINED = 6;

export const reachSampleRandom = () => seededRandom('5eedc0de5eedc0de5eedc0de5eedc0de');

interface ReachSample {
  gap: number;
  q: Float64Array;
}

function randomPose(kin: Kin, joints: JointInfo[], random: () => number) {
  for (const j of joints) {
    const [lo, hi] = j.range ?? [-Math.PI, Math.PI];

    kin.data.qpos[j.qpos] = lo + (hi - lo) * random();
  }

  refresh(kin);
}

export function bestReachSamples(
  kin: Kin,
  options: { joints: JointInfo[]; tip: { body: number; local: V3 }; target: V3 },
) {
  const { joints, tip, target } = options;
  const random = reachSampleRandom();
  const samples: ReachSample[] = [];

  for (let i = 0; i < SAMPLES; i++) {
    randomPose(kin, joints, random);

    const gap = norm(sub(target, bodyPoint(kin, tip.body, tip.local)));

    if (samples.length === REFINED && gap >= samples[REFINED - 1].gap) continue;

    const before = samples.findIndex((sample) => sample.gap > gap);
    const at = before < 0 ? samples.length : before;

    if (at === REFINED) continue;

    const sample = samples.length === REFINED ? samples.pop()! : { gap, q: new Float64Array(joints.length) };

    sample.gap = gap;
    joints.forEach((j, k) => (sample.q[k] = kin.data.qpos[j.qpos]));
    samples.splice(at, 0, sample);
  }

  return samples;
}
