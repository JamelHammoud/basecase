import * as THREE from 'three';
import type { JointValues, RobotJoint, RootOffset } from '../types/robotics';
import { clampJoint, forwardKinematics, posedAxis, type PosedRig } from './kinematicsMotion';
import { isMovable, type Rig, type V3 } from './kinematicsRig';

export interface IkTarget {
  partId: string;
  point: V3;
  target: V3;
  weight?: number;
}

export interface IkOptions {
  joints?: string[];
  root?: RootOffset;
  iterations?: number;
  tolerance?: number;
  prefer?: JointValues;
  preferWeight?: number;
  stiffTorso?: boolean;
}

export interface IkResult {
  values: JointValues;
  errors: number[];
  maxError: number;
}

interface Residual {
  p: THREE.Vector3;
  r: THREE.Vector3;
}

interface IkProblem {
  rig: Rig;
  targets: IkTarget[];
  owners: Array<string | null>;
  vars: RobotJoint[];
  stiff: number[];
  mu: number;
  opts: IkOptions;
}

interface IkState {
  values: JointValues;
  posed: PosedRig;
  cur: Residual[];
  cost: number;
  lambda: number;
}

type StepResult = 'improved' | 'converged' | 'worse';

const DEG = Math.PI / 180;
const MAX_STEP = 15;
const TORSO = /waist|torso|spine|trunk|chest/i;

function ikProblem(rig: Rig, targets: IkTarget[], opts: IkOptions): IkProblem {
  const owners = targets.map((t) => rig.ownerOf.get(t.partId) ?? null);
  const allowed = opts.joints ? new Set(opts.joints) : null;
  const vars = rig.joints.filter(
    (j) => isMovable(j) && (!allowed || allowed.has(j.id)) && owners.some((o) => o && rig.chain.get(o)?.has(j.id)),
  );
  const stiff = vars.map((j) => (opts.stiffTorso !== false && (j.limb === 'torso' || TORSO.test(j.name)) ? 2000 : 1));

  return { rig, targets, owners, vars, stiff, mu: opts.preferWeight ?? 0.02, opts };
}

function residuals(pb: IkProblem, posed: PosedRig): Residual[] {
  return pb.targets.map((t, i) => {
    const owner = pb.owners[i];
    const m = owner ? posed.joint.get(owner) : posed.root;
    const p = new THREE.Vector3(...t.point).applyMatrix4(m ?? posed.root);

    return { p, r: new THREE.Vector3(...t.target).sub(p) };
  });
}

function costOf(pb: IkProblem, c: Residual[], v: JointValues): number {
  const prefer = pb.vars.reduce((s, j, a) => {
    const pref = pb.opts.prefer?.[j.id];

    return pref === undefined ? s : s + pb.stiff[a] * (pref - (v[j.id] ?? 0)) ** 2;
  }, 0);

  return c.reduce((s, e, i) => s + (pb.targets[i].weight ?? 1) * e.r.lengthSq(), 0) + pb.mu * prefer;
}

function jacobianColumns(pb: IkProblem, state: IkState): THREE.Vector3[][] {
  const axes = pb.vars.map((j) => posedAxis(pb.rig, state.posed, j));

  return pb.targets.map((_, i) => {
    const owner = pb.owners[i];

    return pb.vars.map((j, a) => {
      if (!owner || !pb.rig.chain.get(owner)?.has(j.id)) return new THREE.Vector3();

      if (j.type === 'prismatic') return axes[a].axis.clone();

      return axes[a].axis.clone().cross(state.cur[i].p.clone().sub(axes[a].origin)).multiplyScalar(DEG);
    });
  });
}

function normalEquations(pb: IkProblem, state: IkState, cols: THREE.Vector3[][]) {
  const n = pb.vars.length;
  const JtJ = Array.from({ length: n }, () => new Float64Array(n));
  const g = new Float64Array(n);

  pb.targets.forEach((t, i) => {
    const w = t.weight ?? 1;

    for (let a = 0; a < n; a++) {
      const ca = cols[i][a];

      g[a] += w * ca.dot(state.cur[i].r);

      for (let c = a; c < n; c++) JtJ[a][c] += w * ca.dot(cols[i][c]);
    }
  });

  for (let a = 0; a < n; a++) {
    for (let c = 0; c < a; c++) JtJ[a][c] = JtJ[c][a];

    const pref = pb.opts.prefer?.[pb.vars[a].id];

    if (pref !== undefined) g[a] += pb.mu * pb.stiff[a] * (pref - (state.values[pb.vars[a].id] ?? 0));
  }

  return { JtJ, g };
}

function trialValues(pb: IkProblem, state: IkState, delta: number[]): JointValues {
  const maxStep = Math.max(...delta.map(Math.abs));
  const scale = maxStep > MAX_STEP ? MAX_STEP / maxStep : 1;
  const trial: JointValues = { ...state.values };

  pb.vars.forEach((j, a) => (trial[j.id] = clampJoint(j, (state.values[j.id] ?? 0) + delta[a] * scale)));

  return trial;
}

function tryStep(pb: IkProblem, state: IkState, JtJ: Float64Array[], g: Float64Array): StepResult {
  const A = JtJ.map((row, a) => {
    const r = Float64Array.from(row);

    r[a] += state.lambda * (1 + row[a]) + pb.mu * pb.stiff[a];

    return r;
  });
  const delta = solveLinear(A, g);

  if (!delta) {
    state.lambda *= 4;

    return 'worse';
  }

  const trial = trialValues(pb, state, delta);
  const tPosed = forwardKinematics(pb.rig, { values: trial, root: pb.opts.root });
  const tErr = residuals(pb, tPosed);
  const tCost = costOf(pb, tErr, trial);
  const better = tCost < state.cost;

  if (!better) {
    state.lambda *= 4;

    return 'worse';
  }

  Object.assign(state.values, trial);
  state.posed = tPosed;
  state.cur = tErr;

  const gain = state.cost - tCost;

  state.cost = tCost;
  state.lambda = Math.max(state.lambda * 0.3, 1e-4);

  return gain < 1e-6 * Math.max(tCost, 1) ? 'converged' : 'improved';
}

function iterate(pb: IkProblem, state: IkState, tol: number): boolean {
  if (Math.max(...state.cur.map((e) => e.r.length())) < tol) return false;

  const { JtJ, g } = normalEquations(pb, state, jacobianColumns(pb, state));

  for (let tries = 0; tries < 6; tries++) {
    const step = tryStep(pb, state, JtJ, g);

    if (step !== 'worse') return step === 'improved';
  }

  return false;
}

export function solveIK(rig: Rig, start: JointValues, targets: IkTarget[], opts: IkOptions = {}): IkResult {
  const pb = ikProblem(rig, targets, opts);
  const values: JointValues = { ...start };
  const posed = forwardKinematics(rig, { values, root: opts.root });
  const cur = residuals(pb, posed);
  const state: IkState = { values, posed, cur, cost: costOf(pb, cur, values), lambda: 1 };
  const iterations = opts.iterations ?? 40;
  const tol = opts.tolerance ?? 0.3;

  for (let it = 0; it < iterations && pb.vars.length; it++) if (!iterate(pb, state, tol)) break;

  const errors = residuals(pb, state.posed).map((e) => e.r.length());

  return { values, errors, maxError: errors.length ? Math.max(...errors) : 0 };
}

export function preBend(rig: Rig, values: JointValues, ids: Iterable<string>, deg = 20): JointValues {
  const out = { ...values };

  for (const id of ids) {
    const j = rig.byId.get(id);

    if (!j || j.type !== 'revolute' || !j.range || Math.abs(out[id] ?? 0) > 1) continue;

    const [lo, hi] = [Math.min(...j.range), Math.max(...j.range)];

    if (lo >= -20 && hi >= 60) out[id] = Math.min(deg, hi);
    else if (hi <= 20 && lo <= -60) out[id] = Math.max(-deg, lo);
  }

  return out;
}

function pivotRow(M: number[][], c: number, n: number): number {
  let p = c;

  for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;

  return p;
}

function eliminateBelow(M: number[][], c: number, n: number) {
  for (let r = c + 1; r < n; r++) {
    const f = M[r][c] / M[c][c];

    if (!f) continue;

    for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
  }
}

function solveLinear(A: Float64Array[], b: Float64Array): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let c = 0; c < n; c++) {
    const p = pivotRow(M, c, n);

    if (Math.abs(M[p][c]) < 1e-12) return null;

    [M[c], M[p]] = [M[p], M[c]];
    eliminateBelow(M, c, n);
  }

  const x = new Array(n).fill(0);

  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];

    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];

    x[r] = s / M[r][r];
  }

  return x;
}
