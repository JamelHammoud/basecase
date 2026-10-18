import * as THREE from 'three';
import { elem, elems, nums, unitScale } from './model';

export type Attrs = (k: string) => string | undefined;

type ClassDefaults = Map<string, Record<string, string>>;

export interface MjDefaults {
  classes: Map<string, ClassDefaults>;
}

export interface MjAngles {
  toRad: (v: number) => number;
  eulerseq: string;
}

export function readDefaults(root: Element): MjDefaults {
  const classes = new Map<string, ClassDefaults>();
  const visit = (el: Element, inherited: ClassDefaults) => {
    const name = el.getAttribute('class') ?? 'main';
    const own = new Map([...inherited].map(([k, v]) => [k, { ...v }]));

    for (const c of el.children) {
      if (c.tagName === 'default') continue;

      const attrs = Object.fromEntries([...c.attributes].map((a) => [a.name, a.value]));

      own.set(c.tagName, { ...own.get(c.tagName), ...attrs });
    }

    classes.set(name, own);

    for (const c of elems(el, 'default')) visit(c, own);
  };

  for (const d of elems(root, 'default')) visit(d, new Map());

  return { classes };
}

export function mjAngles(mj: Element): MjAngles {
  const compiler = elem(mj, 'compiler');
  const degrees = (compiler?.getAttribute('angle') ?? 'degree') !== 'radian';

  return {
    toRad: (v: number) => (degrees ? (v * Math.PI) / 180 : v),
    eulerseq: compiler?.getAttribute('eulerseq') ?? 'xyz',
  };
}

function eulerQuaternion(v: string, angles: MjAngles): THREE.Quaternion {
  const q = new THREE.Quaternion();
  const e = nums(v, [0, 0, 0]).map(angles.toRad);
  const intrinsic = angles.eulerseq === angles.eulerseq.toLowerCase();
  const seq = angles.eulerseq.toLowerCase();

  for (let i = 0; i < 3; i++) {
    const axis = new THREE.Vector3(seq[i] === 'x' ? 1 : 0, seq[i] === 'y' ? 1 : 0, seq[i] === 'z' ? 1 : 0);
    const r = new THREE.Quaternion().setFromAxisAngle(axis, e[i]);

    if (intrinsic) q.multiply(r);
    else q.premultiply(r);
  }

  return q;
}

function xyAxesQuaternion(v: string): THREE.Quaternion {
  const [x1, x2, x3, y1, y2, y3] = nums(v, [1, 0, 0, 0, 1, 0]);
  const x = new THREE.Vector3(x1, x2, x3).normalize();
  let y = new THREE.Vector3(y1, y2, y3);

  y = y.sub(x.clone().multiplyScalar(x.dot(y))).normalize();

  const z = x.clone().cross(y);

  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const ORIENTERS: Array<[string, (v: string, angles: MjAngles) => THREE.Quaternion]> = [
  [
    'quat',
    (v) => {
      const [w, x, y, z] = nums(v, [1, 0, 0, 0]);

      return new THREE.Quaternion().set(x, y, z, w).normalize();
    },
  ],
  [
    'axisangle',
    (v, angles) => {
      const [x, y, z, ang] = nums(v, [0, 0, 1, 0]);

      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), angles.toRad(ang));
    },
  ],
  ['euler', eulerQuaternion],
  ['xyaxes', xyAxesQuaternion],
  [
    'zaxis',
    (v) => {
      const [x, y, z] = nums(v, [0, 0, 1]);

      return new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(x, y, z).normalize(),
      );
    },
  ],
];

export function orient(a: Attrs, angles: MjAngles): THREE.Quaternion {
  for (const [key, make] of ORIENTERS) {
    const v = a(key);

    if (v) return make(v, angles);
  }

  return new THREE.Quaternion();
}

export function placement(a: Attrs, angles: MjAngles): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...nums(a('pos'), [0, 0, 0])), orient(a, angles), unitScale());
}

export function childrenOf(
  el: Element,
  tag: string,
  angles: MjAngles,
  at = new THREE.Matrix4(),
): Array<{ el: Element; frame: THREE.Matrix4 }> {
  return [...el.children].flatMap((c) => {
    if (c.tagName === tag) return [{ el: c, frame: at }];

    if (c.tagName !== 'frame') return [];

    const frame = placement((k) => c.getAttribute(k) ?? undefined, angles);

    return childrenOf(c, tag, angles, at.clone().multiply(frame));
  });
}
