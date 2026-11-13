const MASK = (1n << 64n) - 1n;
const GOLDEN = 0x9e3779b97f4a7c15n;
const STREAM_MIX = 0xd6e8feb86659fd93n;
const UNIT = 2 ** -53;

export const GATE_SEED_OFFSET = 1000;
export const RESET_JOINT_NOISE = 0.05;

const rotl = (x: bigint, k: bigint) => ((x << k) | (x >> (64n - k))) & MASK;

function splitMix(state: { v: bigint }) {
  state.v = (state.v + GOLDEN) & MASK;

  let z = state.v;

  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;

  return z ^ (z >> 31n);
}

export class Rng {
  private words: [bigint, bigint, bigint, bigint];

  constructor(seed: number, stream: number) {
    const mix = { v: ((BigInt(seed) * GOLDEN) & MASK) ^ (((BigInt(stream) + 1n) * STREAM_MIX) & MASK) };

    this.words = [splitMix(mix), splitMix(mix), splitMix(mix), splitMix(mix)];
  }

  nextU64() {
    let [a, b, c, d] = this.words;
    const result = (rotl((a + d) & MASK, 23n) + a) & MASK;
    const shifted = (b << 17n) & MASK;

    c ^= a;
    d ^= b;
    b ^= c;
    a ^= d;
    c ^= shifted;
    d = rotl(d, 45n);
    this.words = [a, b, c, d];

    return result;
  }

  unit() {
    return Number(this.nextU64() >> 11n) * UNIT;
  }

  uniform(low: number, high: number) {
    return low + (high - low) * this.unit();
  }
}

export interface StartSpec {
  qpos: ArrayLike<number>;
  rootQpos: number;
  jointQpos: number[];
  ctrlLow: number[];
  ctrlHigh: number[];
  noise: number;
  seed: number;
}

function turned(half: number, q: number[]) {
  const a = [Math.cos(half), 0, 0, Math.sin(half)];

  return [
    a[0] * q[0] - a[1] * q[1] - a[2] * q[2] - a[3] * q[3],
    a[0] * q[1] + a[1] * q[0] + a[2] * q[3] - a[3] * q[2],
    a[0] * q[2] - a[1] * q[3] + a[2] * q[0] + a[3] * q[1],
    a[0] * q[3] + a[1] * q[2] - a[2] * q[1] + a[3] * q[0],
  ];
}

export function gateStart(spec: StartSpec, robot: number): number[] {
  const rng = new Rng(spec.seed + GATE_SEED_OFFSET, robot);
  const qpos = Array.from(spec.qpos);

  spec.jointQpos.forEach((adr, j) => {
    qpos[adr] = Math.min(Math.max(qpos[adr] + rng.uniform(-spec.noise, spec.noise), spec.ctrlLow[j]), spec.ctrlHigh[j]);
  });

  const half = rng.uniform(-Math.PI, Math.PI) / 2;
  const at = spec.rootQpos + 3;

  qpos.splice(at, 4, ...turned(half, qpos.slice(at, at + 4)));

  return qpos;
}
