import { seeded } from '../utils/seeded';

export interface ConfigurationJoint {
  range: [number, number];
  continuous: boolean;
  travelM: number;
  preferStart?: boolean;
}

export interface ConfigurationProblem {
  start: number[];
  goal: number[];
  joints: ConfigurationJoint[];
  clear: (q: number[]) => boolean;
  separation?: () => number;
  reserveM?: number;
  seed: number;
  stop: () => boolean;
  budget?: number;
}

export interface ConfigurationResult {
  status: 'found' | 'budget' | 'start' | 'goal' | 'limits' | 'cancelled';
  path: number[][];
  checks: number;
  nodes: number;
}

const TAU = 2 * Math.PI;
const TRAVEL_M = 0.0005;
const STEP_RAD = 0.3;
const NODE_LIMIT = 4096;
const CHECK_LIMIT = 65_536;

export function configurationDelta(from: number[], to: number[], joints: ConfigurationJoint[]): number[] {
  return from.map((v, i) => {
    const delta = to[i] - v;

    return joints[i].continuous ? delta - TAU * Math.round(delta / TAU) : delta;
  });
}

interface Node {
  q: number[];
  parent: number;
}

class Checker {
  checks = 0;
  stopped: 'budget' | 'cancelled' | null = null;
  readonly input: ConfigurationProblem;
  private readonly channel = new MessageChannel();
  private resume: (() => void) | null = null;

  constructor(input: ConfigurationProblem) {
    this.input = input;
    this.channel.port1.onmessage = () => this.resume?.();
  }

  clear(q: number[]): boolean | Promise<boolean> {
    return this.checks % 128 === 0 ? this.afterYield(q) : this.checked(q);
  }

  private async afterYield(q: number[]): Promise<boolean> {
    await new Promise<void>((resolve) => {
      const immediate = (globalThis as { setImmediate?: (callback: () => void) => unknown }).setImmediate;

      if (immediate) {
        immediate(resolve);

        return;
      }

      this.resume = resolve;
      this.channel.port2.postMessage(null);
    });

    return this.checked(q);
  }

  dispose() {
    this.channel.port1.close();
    this.channel.port2.close();
  }

  private checked(q: number[]): boolean {
    if (this.input.stop()) this.stopped = 'cancelled';

    if (this.checks >= (this.input.budget ?? CHECK_LIMIT)) this.stopped ??= 'budget';

    if (this.stopped) return false;

    this.checks++;

    return this.input.clear(q);
  }

  async edge(from: number[], to: number[]): Promise<boolean> {
    const delta = configurationDelta(from, to, this.input.joints);
    const travel = delta.reduce((sum, v, i) => sum + Math.abs(v) * this.input.joints[i].travelM, 0);
    let progress = 0;

    if (!(await this.clear(from))) return false;

    while (progress < 1) {
      const separated = this.input.separation?.();
      const step =
        separated === undefined
          ? TRAVEL_M
          : Math.max(TRAVEL_M, Math.min(0.01, (separated - (this.input.reserveM ?? 0.001)) / 2));

      progress = travel > 0 ? Math.min(1, progress + step / travel) : 1;

      const q = from.map((v, i) => v + delta[i] * progress);
      const checked = this.clear(q);

      if (typeof checked === 'boolean' ? !checked : !(await checked)) return false;
    }

    return true;
  }
}

function nearest(tree: Node[], q: number[], joints: ConfigurationJoint[]): number {
  let best = 0;
  let distance = Infinity;

  tree.forEach((node, i) => {
    const d = Math.hypot(...configurationDelta(node.q, q, joints));

    if (d < distance) {
      best = i;
      distance = d;
    }
  });

  return best;
}

async function extend(tree: Node[], target: number[], checker: Checker): Promise<number> {
  const parent = nearest(tree, target, checker.input.joints);
  const from = tree[parent].q;
  const delta = configurationDelta(from, target, checker.input.joints);
  const distance = Math.hypot(...delta);
  const share = Math.min(1, STEP_RAD / distance);
  const q = from.map((v, i) => v + delta[i] * share);

  if (distance < 1e-10) return parent;

  if (!(await checker.edge(from, q))) return -1;

  tree.push({ q, parent });

  return tree.length - 1;
}

function branch(tree: Node[], index: number): number[][] {
  const path: number[][] = [];

  for (let i = index; i >= 0; i = tree[i].parent) path.push(tree[i].q);

  return path.reverse();
}

function unwrap(path: number[][], joints: ConfigurationJoint[]): number[][] {
  const out = [[...path[0]]];

  for (const q of path.slice(1)) {
    const from = out.at(-1)!;
    const delta = configurationDelta(from, q, joints);

    if (Math.hypot(...delta) < 1e-10) continue;

    out.push(from.map((v, i) => v + delta[i]));
  }

  return out;
}

async function connect(
  trees: [Node[], Node[]],
  side: number,
  checker: Checker,
  sample: number[],
): Promise<number[][] | null> {
  const a = trees[side];
  const b = trees[1 - side];

  if (a.length + b.length >= NODE_LIMIT) return null;

  const ai = await extend(a, sample, checker);

  if (ai < 0 || a.length + b.length >= NODE_LIMIT) return null;

  let bi = await extend(b, a[ai].q, checker);

  while (bi >= 0 && !checker.stopped && a.length + b.length < NODE_LIMIT) {
    const distance = Math.hypot(...configurationDelta(a[ai].q, b[bi].q, checker.input.joints));

    if (distance < 1e-10) break;

    bi = await extend(b, a[ai].q, checker);
  }

  if (bi < 0 || checker.stopped || Math.hypot(...configurationDelta(a[ai].q, b[bi].q, checker.input.joints)) >= 1e-10)
    return null;

  const first = branch(a, ai);
  const second = branch(b, bi);

  return side === 0 ? [...first, ...second.reverse()] : [...second, ...first.reverse()];
}

const withinLimits = (input: ConfigurationProblem) =>
  [input.start, input.goal].every(
    (q) =>
      q.length === input.joints.length &&
      q.every(
        (v, i) =>
          Number.isFinite(v) &&
          (input.joints[i].continuous || (v >= input.joints[i].range[0] && v <= input.joints[i].range[1])),
      ),
  );

async function farthest(path: number[][], from: number, checker: Checker): Promise<number> {
  for (let i = path.length - 1; i > from + 1 && !checker.stopped; i--) {
    if (await checker.edge(path[from], path[i])) return i;
  }

  return from + 1;
}

async function shortened(path: number[][], checker: Checker): Promise<number[][]> {
  const out = [path[0]];
  let at = 0;

  while (at < path.length - 1 && !checker.stopped) {
    at = await farthest(path, at, checker);
    out.push(path[at]);
  }

  if (checker.stopped === 'budget') checker.stopped = null;

  return at === path.length - 1 ? out : [...out, ...path.slice(at + 1)];
}

async function searched(input: ConfigurationProblem, checker: Checker): Promise<ConfigurationResult> {
  let nodes = 0;
  const result = (status: ConfigurationResult['status'], path: number[][] = []): ConfigurationResult => ({
    status: checker.stopped ?? status,
    path: checker.stopped ? [] : path,
    checks: checker.checks,
    nodes,
  });

  if (!withinLimits(input)) return result('limits');

  if (!(await checker.clear(input.start))) return result('start');

  if (!(await checker.clear(input.goal))) return result('goal');

  if (await checker.edge(input.start, input.goal))
    return result('found', unwrap([input.start, input.goal], input.joints));

  const random = seeded(input.seed);
  const trees: [Node[], Node[]] = [[{ q: input.start, parent: -1 }], [{ q: input.goal, parent: -1 }]];
  let side = 0;

  for (let attempts = 0; attempts < NODE_LIMIT && !checker.stopped && nodes < NODE_LIMIT - 2; attempts++) {
    const sample = input.joints.map((j, i) =>
      j.preferStart && random() < 0.8 ? input.start[i] : j.range[0] + random() * (j.range[1] - j.range[0]),
    );
    const path = await connect(trees, side, checker, sample);

    nodes = trees[0].length + trees[1].length - 2;

    if (path) return result('found', unwrap(await shortened(path, checker), input.joints));

    side = 1 - side;
  }

  return result('budget');
}

export async function searchConfigurations(input: ConfigurationProblem): Promise<ConfigurationResult> {
  const checker = new Checker(input);

  try {
    return await searched(input, checker);
  } finally {
    checker.dispose();
  }
}
