import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import type { RobotJoint, ScenePart } from '../types/robotics';
import { prettyJointName } from './kinematics';

/**
 * Imports a published robot description (URDF or MuJoCo MJCF) with its meshes: every link with
 * geometry becomes a `mesh` part at the zero pose, and every revolute / prismatic joint becomes a
 * joint, so the robot can be posed straight away. Robot frames are REP-103 (meters, X forward,
 * Y left, Z up); the studio is mm, Y up, front +Z, left +X.
 */

export interface RobotPreset {
  id: string;
  title: string;
  maker: string;
  /** What it is, one line */
  description: string;
  url: string;
}

const RAW = 'https://raw.githubusercontent.com';

export const ROBOT_PRESETS: RobotPreset[] = [
  {
    id: 'unitree-g1',
    title: 'Unitree G1',
    maker: 'Unitree',
    description: '1.3 m humanoid, 29 joints',
    url: `${RAW}/unitreerobotics/unitree_ros/master/robots/g1_description/g1_29dof_rev_1_0.urdf`,
  },
  {
    id: 'unitree-h1',
    title: 'Unitree H1',
    maker: 'Unitree',
    description: '1.8 m humanoid, 19 joints',
    url: `${RAW}/unitreerobotics/unitree_ros/master/robots/h1_description/urdf/h1.urdf`,
  },
  {
    id: 'unitree-go2',
    title: 'Unitree Go2',
    maker: 'Unitree',
    description: 'Quadruped, 12 joints',
    url: `${RAW}/unitreerobotics/unitree_ros/master/robots/go2_description/urdf/go2_description.urdf`,
  },
  {
    id: 'berkeley-humanoid',
    title: 'Berkeley Humanoid',
    maker: 'UC Berkeley HybridRobotics',
    description: 'Research biped, 12 leg joints',
    url: `${RAW}/HybridRobotics/berkeley_humanoid_description/main/urdf/robot.urdf`,
  },
  {
    id: 'open-duck-mini',
    title: 'Open Duck Mini v2',
    maker: 'Antoine Pirrone',
    description: 'Open-source printed biped',
    url: `${RAW}/apirrone/Open_Duck_Mini/v2/mini_bdx/robots/open_duck_mini_v2/robot.urdf`,
  },
  {
    id: 'so101',
    title: 'SO-101 Arm',
    maker: 'TheRobotStudio',
    description: 'Open-source 6-axis arm',
    url: `${RAW}/TheRobotStudio/SO-ARM100/main/Simulation/SO101/so101_new_calib.urdf`,
  },
];

export interface ImportOptions {
  onProgress?: (message: string) => void;
  /** Triangle budget for the whole robot (meshes are simplified to fit) */
  maxTriangles?: number;
  /** Name shown on the parts (defaults to the description's own) */
  name?: string;
}

export interface ImportedRobot {
  name: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  triangles: number;
  /** Files that couldn't be read, and anything else worth knowing */
  notes: string[];
}

/** Where files come from: a URL (the description's own) or a folder the user picked */
type Source =
  | { kind: 'url'; url: string }
  | { kind: 'files'; files: File[] };

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

/** github.com/…/blob/… → raw.githubusercontent.com/… */
export function rawUrl(url: string): string {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(url.trim());
  return m ? `${RAW}/${m[1]}/${m[2]}/${m[3]}` : url.trim();
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  let buf = await res.arrayBuffer();
  // Git LFS pointer: fetch the real file
  if (buf.byteLength < 300) {
    const head = new TextDecoder().decode(buf);
    const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/(.+)$/.exec(url);
    if (head.startsWith('version https://git-lfs') && m) {
      const lfs = await fetch(`https://media.githubusercontent.com/media/${m[1]}/${m[2]}/${m[3]}`);
      if (!lfs.ok) throw new Error(`LFS ${lfs.status}`);
      buf = await lfs.arrayBuffer();
    }
  }
  return buf;
}

const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+/g, '/');
function joinPath(base: string, rel: string): string {
  const parts = base.split('/');
  parts.pop();
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

interface Resolver {
  /** The description file itself */
  entry: { name: string; text: string };
  read: (ref: string, from?: string) => Promise<{ data: ArrayBuffer; path: string } | null>;
}

/** Candidate locations for a mesh reference, most likely first */
function candidates(ref: string, entryPath: string): string[] {
  const out: string[] = [];
  let r = ref.trim();
  if (/^file:\/\//.test(r)) r = r.replace(/^file:\/\//, '');
  const pkg = /^package:\/\/([^/]*)\/(.*)$/.exec(r);
  if (pkg) {
    const [, name, rest] = pkg;
    // The package folder appears in the description's own path
    if (name) {
      const i = entryPath.lastIndexOf(`/${name}/`);
      if (i >= 0) out.push(entryPath.slice(0, i + name.length + 2) + rest);
    }
    out.push(joinPath(entryPath, `../${rest}`), joinPath(entryPath, rest), joinPath(entryPath, `../../${rest}`));
    const file = rest.split('/').pop()!;
    out.push(joinPath(entryPath, file), joinPath(entryPath, `meshes/${file}`), joinPath(entryPath, `../meshes/${file}`), joinPath(entryPath, `assets/${file}`));
  } else if (/^https?:\/\//.test(r)) {
    out.push(r);
  } else if (r.startsWith('/')) {
    out.push(r);
  } else {
    out.push(joinPath(entryPath, r));
  }
  return [...new Set(out)];
}

async function urlResolver(url: string): Promise<Resolver> {
  const entryUrl = rawUrl(url);
  const text = new TextDecoder().decode(await fetchBytes(entryUrl).catch((e) => {
    throw new Error(`Couldn't download the description (${e.message}). Check the link.`);
  }));
  const u = new URL(entryUrl);
  const origin = u.origin;
  const entryPath = decodeURIComponent(u.pathname);
  // The rule that found the last mesh usually finds the next
  let winning: number | null = null;
  return {
    entry: { name: entryPath.split('/').pop() ?? 'robot', text },
    read: async (ref, from) => {
      const base = from ?? entryPath;
      const list = candidates(ref, base);
      const order = winning !== null && winning < list.length ? [winning, ...list.keys()].filter((v, i, a) => a.indexOf(v) === i) : [...list.keys()];
      for (const i of order) {
        const path = list[i];
        try {
          const data = await fetchBytes(/^https?:/.test(path) ? path : origin + encodeURI(path));
          winning = i;
          return { data, path };
        } catch {
          /* next candidate */
        }
      }
      return null;
    },
  };
}

function filesResolver(files: File[]): Resolver & { pickEntry: () => Promise<void> } {
  const byPath = new Map(files.map((f) => [norm((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name), f]));
  const entryFile =
    [...byPath].find(([p]) => /\.urdf$/i.test(p)) ??
    [...byPath].find(([p]) => /\.(xml|mjcf)$/i.test(p) && !/scene/i.test(p.split('/').pop()!)) ??
    [...byPath].find(([p]) => /\.(xml|mjcf)$/i.test(p));
  if (!entryFile) throw new Error('No URDF or MJCF file in that folder.');
  const resolver = {
    entry: { name: entryFile[0], text: '' },
    pickEntry: async () => {
      resolver.entry.text = await entryFile[1].text();
    },
    read: async (ref: string, from?: string) => {
      const base = from ?? entryFile[0];
      for (const c of candidates(ref, base)) {
        const f = byPath.get(norm(c).replace(/^\//, ''));
        if (f) return { data: await f.arrayBuffer(), path: c };
      }
      // Last resort: the same file name anywhere in the folder
      const name = ref.split('/').pop()!.toLowerCase();
      const hit = [...byPath].find(([p]) => p.toLowerCase().endsWith('/' + name) || p.toLowerCase() === name);
      return hit ? { data: await hit[1].arrayBuffer(), path: hit[0] } : null;
    },
  };
  return resolver;
}

/* ------------------------------------------------------------------ */
/* Model: links with visuals, joints, zero-pose frames (robot frame)   */
/* ------------------------------------------------------------------ */

type Geometry =
  | { type: 'mesh'; file: string; scale: THREE.Vector3; from?: string }
  | { type: 'box'; size: THREE.Vector3 }
  | { type: 'cylinder'; radius: number; length: number }
  | { type: 'capsule'; radius: number; length: number }
  | { type: 'sphere'; radius: number }
  | { type: 'ellipsoid'; radii: THREE.Vector3 };

interface Visual {
  geometry: Geometry;
  /** Link frame → geometry frame */
  origin: THREE.Matrix4;
  color?: THREE.Color;
}

interface ModelJoint {
  name: string;
  type: 'revolute' | 'prismatic' | 'fixed';
  parent: string;
  child: string;
  /** World frame of the joint at the zero pose (robot frame, m) */
  world: THREE.Matrix4;
  /** Axis in the joint frame */
  axis: THREE.Vector3;
  /** rad or m */
  limit?: [number, number];
  /** MJCF: the joint before this one on the same body (several hinges in one body chain) */
  after?: ModelJoint;
}

interface Model {
  name: string;
  /** World frame of each link at zero (robot frame, m) */
  links: Map<string, { world: THREE.Matrix4; visuals: Visual[] }>;
  joints: ModelJoint[];
  root: string;
}

const nums = (s: string | null | undefined, def: number[]) => (s ? s.trim().split(/\s+/).map(Number) : def);
const elems = (el: Element, tag: string) => [...el.children].filter((c) => c.tagName === tag);
const elem = (el: Element | null | undefined, tag: string) => (el ? [...el.children].find((c) => c.tagName === tag) ?? null : null);

function urdfOrigin(el: Element | null): THREE.Matrix4 {
  const [x, y, z] = nums(el?.getAttribute('xyz'), [0, 0, 0]);
  const [r, p, yw] = nums(el?.getAttribute('rpy'), [0, 0, 0]);
  // Fixed-axis roll, pitch, yaw: R = Rz(yaw) Ry(pitch) Rx(roll)
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(r, p, yw, 'ZYX'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
}

function parseUrdf(doc: Document): Model {
  const robot = doc.documentElement;
  const materials = new Map<string, THREE.Color>();
  const colorOf = (m: Element | null) => {
    if (!m) return undefined;
    const c = elem(m, 'color')?.getAttribute('rgba');
    if (c) {
      const [r, g, b] = nums(c, [0.7, 0.7, 0.7]);
      return new THREE.Color(r, g, b);
    }
    return materials.get(m.getAttribute('name') ?? '');
  };
  for (const m of elems(robot, 'material')) {
    const c = colorOf(m);
    if (c) materials.set(m.getAttribute('name') ?? '', c);
  }
  const links = new Map<string, { world: THREE.Matrix4; visuals: Visual[] }>();
  for (const l of elems(robot, 'link')) {
    const visuals: Visual[] = [];
    for (const v of elems(l, 'visual')) {
      const g = elem(v, 'geometry');
      const shape = g?.children[0];
      if (!shape) continue;
      let geometry: Geometry | null = null;
      if (shape.tagName === 'mesh') {
        const [sx, sy, sz] = nums(shape.getAttribute('scale'), [1, 1, 1]);
        geometry = { type: 'mesh', file: shape.getAttribute('filename') ?? '', scale: new THREE.Vector3(sx, sy ?? sx, sz ?? sx) };
      } else if (shape.tagName === 'box') {
        const [x, y, z] = nums(shape.getAttribute('size'), [0.01, 0.01, 0.01]);
        geometry = { type: 'box', size: new THREE.Vector3(x, y, z) };
      } else if (shape.tagName === 'cylinder') {
        geometry = { type: 'cylinder', radius: Number(shape.getAttribute('radius') ?? 0.01), length: Number(shape.getAttribute('length') ?? 0.01) };
      } else if (shape.tagName === 'sphere') {
        geometry = { type: 'sphere', radius: Number(shape.getAttribute('radius') ?? 0.01) };
      } else if (shape.tagName === 'capsule') {
        geometry = { type: 'capsule', radius: Number(shape.getAttribute('radius') ?? 0.01), length: Number(shape.getAttribute('length') ?? 0.01) };
      }
      if (geometry) visuals.push({ geometry, origin: urdfOrigin(elem(v, 'origin')), color: colorOf(elem(v, 'material')) });
    }
    links.set(l.getAttribute('name') ?? '', { world: new THREE.Matrix4(), visuals });
  }
  const raw = elems(robot, 'joint')
    .map((j) => {
      const parent = elem(j, 'parent')?.getAttribute('link');
      const child = elem(j, 'child')?.getAttribute('link');
      if (!parent || !child) return null;
      const t = j.getAttribute('type') ?? 'fixed';
      const lim = elem(j, 'limit');
      const lo = lim?.getAttribute('lower');
      const hi = lim?.getAttribute('upper');
      const [ax, ay, az] = nums(elem(j, 'axis')?.getAttribute('xyz'), [1, 0, 0]);
      return {
        name: j.getAttribute('name') ?? `${parent}-${child}`,
        type: (t === 'revolute' || t === 'continuous' ? 'revolute' : t === 'prismatic' ? 'prismatic' : 'fixed') as ModelJoint['type'],
        parent,
        child,
        origin: urdfOrigin(elem(j, 'origin')),
        axis: new THREE.Vector3(ax, ay, az).normalize(),
        limit: t !== 'continuous' && lo != null && hi != null && Number(hi) > Number(lo) ? ([Number(lo), Number(hi)] as [number, number]) : undefined,
      };
    })
    .filter((j): j is NonNullable<typeof j> => !!j);
  const isChild = new Set(raw.map((j) => j.child));
  const root = [...links.keys()].find((l) => !isChild.has(l)) ?? [...links.keys()][0];
  const joints: ModelJoint[] = [];
  const walk = (link: string, world: THREE.Matrix4, depth: number) => {
    const l = links.get(link);
    if (l) l.world = world;
    if (depth > 200) return;
    for (const j of raw.filter((x) => x.parent === link)) {
      const jw = world.clone().multiply(j.origin);
      joints.push({ name: j.name, type: j.type, parent: j.parent, child: j.child, world: jw, axis: j.axis, limit: j.limit });
      walk(j.child, jw, depth + 1);
    }
  };
  walk(root, new THREE.Matrix4(), 0);
  return { name: robot.getAttribute('name') ?? 'Robot', links, joints, root };
}

/* MJCF ------------------------------------------------------------- */

interface MjDefaults {
  /** class → tag → attributes */
  classes: Map<string, Map<string, Record<string, string>>>;
}

function readDefaults(root: Element): MjDefaults {
  const classes = new Map<string, Map<string, Record<string, string>>>();
  const visit = (el: Element, inherited: Map<string, Record<string, string>>) => {
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

function parseMjcf(doc: Document): Model {
  const mj = doc.documentElement;
  const compiler = elem(mj, 'compiler');
  const degrees = (compiler?.getAttribute('angle') ?? 'degree') !== 'radian';
  const meshdir = compiler?.getAttribute('meshdir') ?? compiler?.getAttribute('assetdir') ?? '';
  const eulerseq = compiler?.getAttribute('eulerseq') ?? 'xyz';
  const defaults = readDefaults(mj);
  const toRad = (v: number) => (degrees ? (v * Math.PI) / 180 : v);

  const meshes = new Map<string, { file: string; scale: THREE.Vector3 }>();
  const materials = new Map<string, THREE.Color>();
  for (const asset of elems(mj, 'asset')) {
    for (const m of elems(asset, 'mesh')) {
      const file = m.getAttribute('file');
      if (!file) continue;
      const cls = defaults.classes.get(m.getAttribute('class') ?? 'main')?.get('mesh') ?? {};
      const [sx, sy, sz] = nums(m.getAttribute('scale') ?? cls.scale, [1, 1, 1]);
      const name = m.getAttribute('name') ?? file.split('/').pop()!.replace(/\.[^.]+$/, '');
      meshes.set(name, { file: meshdir ? `${meshdir.replace(/\/$/, '')}/${file}` : file, scale: new THREE.Vector3(sx, sy, sz) });
    }
    for (const m of elems(asset, 'material')) {
      const [r, g, b] = nums(m.getAttribute('rgba'), [0.7, 0.7, 0.7, 1]);
      materials.set(m.getAttribute('name') ?? '', new THREE.Color(r, g, b));
    }
  }

  /** Orientation of a body, geom, site…: quat, axisangle, euler, xyaxes or zaxis */
  const orient = (a: (k: string) => string | undefined): THREE.Quaternion => {
    const q = new THREE.Quaternion();
    if (a('quat')) {
      const [w, x, y, z] = nums(a('quat'), [1, 0, 0, 0]);
      return q.set(x, y, z, w).normalize();
    }
    if (a('axisangle')) {
      const [x, y, z, ang] = nums(a('axisangle'), [0, 0, 1, 0]);
      return q.setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), toRad(ang));
    }
    if (a('euler')) {
      const e = nums(a('euler'), [0, 0, 0]).map(toRad);
      // MuJoCo eulerseq: lower case = rotating axes (intrinsic)
      const intrinsic = eulerseq === eulerseq.toLowerCase();
      const seq = eulerseq.toLowerCase();
      for (let i = 0; i < 3; i++) {
        const axis = new THREE.Vector3(seq[i] === 'x' ? 1 : 0, seq[i] === 'y' ? 1 : 0, seq[i] === 'z' ? 1 : 0);
        const r = new THREE.Quaternion().setFromAxisAngle(axis, e[i]);
        if (intrinsic) q.multiply(r);
        else q.premultiply(r);
      }
      return q;
    }
    if (a('xyaxes')) {
      const [x1, x2, x3, y1, y2, y3] = nums(a('xyaxes'), [1, 0, 0, 0, 1, 0]);
      const x = new THREE.Vector3(x1, x2, x3).normalize();
      let y = new THREE.Vector3(y1, y2, y3);
      y = y.sub(x.clone().multiplyScalar(x.dot(y))).normalize();
      const z = x.clone().cross(y);
      return q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    }
    if (a('zaxis')) {
      const [x, y, z] = nums(a('zaxis'), [0, 0, 1]);
      return q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(x, y, z).normalize());
    }
    return q;
  };

  const links = new Map<string, { world: THREE.Matrix4; visuals: Visual[] }>();
  const joints: ModelJoint[] = [];
  const geomAll: Array<{ link: string; attrs: (k: string) => string | undefined; cls: string }> = [];
  let anon = 0;

  const visitBody = (body: Element, parentWorld: THREE.Matrix4, parentLink: string | null, childclass: string) => {
    const cc = body.getAttribute('childclass') ?? childclass;
    const name = body.getAttribute('name') ?? `body_${anon++}`;
    const own = (k: string) => body.getAttribute(k) ?? undefined;
    const [x, y, z] = nums(own('pos'), [0, 0, 0]);
    const world = parentWorld.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), orient(own), new THREE.Vector3(1, 1, 1)));
    links.set(name, { world, visuals: [] });
    if (parentLink) {
      const js = [...elems(body, 'joint')];
      if (!js.length) joints.push({ name: `${name}_fixed`, type: 'fixed', parent: parentLink, child: name, world, axis: new THREE.Vector3(1, 0, 0) });
      let prev: ModelJoint | undefined;
      for (const j of js) {
        const cls = j.getAttribute('class') ?? cc;
        const def = defaults.classes.get(cls)?.get('joint') ?? defaults.classes.get('main')?.get('joint') ?? {};
        const a = (k: string) => j.getAttribute(k) ?? def[k];
        const type = a('type') ?? 'hinge';
        if (type === 'free' || type === 'ball') continue;
        const [px, py, pz] = nums(a('pos'), [0, 0, 0]);
        const [ax, ay, az] = nums(a('axis'), [0, 0, 1]);
        const range = a('range') ? nums(a('range'), [0, 0]) : null;
        const limited = a('limited') !== 'false' && range && range[1] > range[0];
        const lim: [number, number] | undefined = limited ? (type === 'slide' ? [range![0], range![1]] : [toRad(range![0]), toRad(range![1])]) : undefined;
        const made: ModelJoint = {
          name: j.getAttribute('name') ?? `${name}_joint`,
          type: type === 'slide' ? 'prismatic' : 'revolute',
          parent: parentLink,
          child: name,
          world: world.clone().multiply(new THREE.Matrix4().makeTranslation(px, py, pz)),
          axis: new THREE.Vector3(ax, ay, az).normalize(),
          limit: lim,
          after: prev,
        };
        joints.push(made);
        prev = made;
      }
    }
    for (const g of elems(body, 'geom')) {
      const cls = g.getAttribute('class') ?? cc;
      const def = defaults.classes.get(cls)?.get('geom') ?? defaults.classes.get('main')?.get('geom') ?? {};
      geomAll.push({ link: name, attrs: (k) => g.getAttribute(k) ?? def[k], cls });
    }
    for (const b of elems(body, 'body')) visitBody(b, world, name, cc);
  };
  const worldbody = elem(mj, 'worldbody');
  if (worldbody) {
    links.set('world', { world: new THREE.Matrix4(), visuals: [] });
    for (const g of elems(worldbody, 'geom')) {
      const def = defaults.classes.get(g.getAttribute('class') ?? 'main')?.get('geom') ?? {};
      geomAll.push({ link: 'world', attrs: (k) => g.getAttribute(k) ?? def[k], cls: g.getAttribute('class') ?? 'main' });
    }
    for (const b of elems(worldbody, 'body')) visitBody(b, new THREE.Matrix4(), null, 'main');
  }

  // Visual geoms: those that never collide, or in a "visual" class; otherwise everything but collision
  const visualOnly = (g: (typeof geomAll)[number]) => (g.attrs('contype') === '0' && g.attrs('conaffinity') === '0') || /visual/i.test(g.cls);
  const any = geomAll.some(visualOnly);
  const chosen = geomAll.filter((g) =>
    any ? visualOnly(g) : !/collision/i.test(g.cls) && g.attrs('group') !== '3' && (g.attrs('type') ?? 'sphere') !== 'plane'
  );
  for (const g of chosen) {
    const a = g.attrs;
    const type = a('type') ?? (a('mesh') ? 'mesh' : 'sphere');
    if (type === 'plane' || type === 'hfield') continue;
    const size = nums(a('size'), [0.005, 0.005, 0.005]);
    let origin = new THREE.Matrix4().compose(new THREE.Vector3(...nums(a('pos'), [0, 0, 0])), orient(a), new THREE.Vector3(1, 1, 1));
    let geometry: Geometry | null = null;
    if (type === 'mesh') {
      const m = meshes.get(a('mesh') ?? '');
      if (m) geometry = { type: 'mesh', file: m.file, scale: m.scale };
    } else if (type === 'box') geometry = { type: 'box', size: new THREE.Vector3(size[0] * 2, (size[1] ?? size[0]) * 2, (size[2] ?? size[0]) * 2) };
    else if (type === 'sphere') geometry = { type: 'sphere', radius: size[0] };
    else if (type === 'ellipsoid') geometry = { type: 'ellipsoid', radii: new THREE.Vector3(size[0], size[1] ?? size[0], size[2] ?? size[0]) };
    else if (type === 'cylinder' || type === 'capsule') {
      let length = (size[1] ?? 0.01) * 2;
      if (a('fromto')) {
        const [x1, y1, z1, x2, y2, z2] = nums(a('fromto'), [0, 0, 0, 0, 0, 0]);
        const p1 = new THREE.Vector3(x1, y1, z1), p2 = new THREE.Vector3(x2, y2, z2);
        length = p1.distanceTo(p2);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), p2.clone().sub(p1).normalize());
        origin = new THREE.Matrix4().compose(p1.clone().add(p2).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
      }
      geometry = { type, radius: size[0], length };
    }
    if (!geometry) continue;
    const rgba = a('rgba');
    const color = rgba ? new THREE.Color(...(nums(rgba, [0.5, 0.5, 0.5]).slice(0, 3) as [number, number, number])) : materials.get(a('material') ?? '');
    links.get(g.link)?.visuals.push({ geometry, origin, color });
  }
  const isChild = new Set(joints.map((j) => j.child));
  const root = [...links.keys()].find((l) => l !== 'world' && !isChild.has(l)) ?? 'world';
  return { name: mj.getAttribute('model') ?? 'Robot', links, joints, root };
}

/** Inlines <include file="…"/> (MJCF scenes include the robot file) */
async function inlineIncludes(text: string, read: Resolver['read'], from: string, depth = 0): Promise<string> {
  if (depth > 4 || !/<include\b/.test(text)) return text;
  const parts: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/<include\s+file\s*=\s*"([^"]+)"\s*\/>/g)) {
    parts.push(text.slice(last, m.index));
    last = m.index! + m[0].length;
    const got = await read(m[1], from);
    if (!got) continue;
    let inner = new TextDecoder().decode(got.data);
    inner = await inlineIncludes(inner, read, got.path, depth + 1);
    // Keep what's inside the included file's <mujoco> root
    const body = /<mujoco\b[^>]*>([\s\S]*)<\/mujoco>/.exec(inner)?.[1] ?? inner;
    parts.push(body);
  }
  parts.push(text.slice(last));
  return parts.join('');
}

/* ------------------------------------------------------------------ */
/* Meshes                                                              */
/* ------------------------------------------------------------------ */

async function loadMesh(data: ArrayBuffer, path: string): Promise<THREE.BufferGeometry | null> {
  const ext = path.split('.').pop()!.toLowerCase();
  const collect = (root: THREE.Object3D) => {
    root.updateMatrixWorld(true);
    const geos: THREE.BufferGeometry[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', m.geometry.getAttribute('position').clone());
      if (m.geometry.index) g.setIndex(m.geometry.index.clone());
      g.applyMatrix4(m.matrixWorld);
      geos.push(g.index ? g.toNonIndexed() : g);
    });
    return geos.length ? mergeGeometries(geos, false) : null;
  };
  if (ext === 'stl') {
    const g = new STLLoader().parse(data);
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.getAttribute('position'));
    return out;
  }
  if (ext === 'obj') return collect(new OBJLoader().parse(new TextDecoder().decode(data)));
  if (ext === 'dae') {
    const text = new TextDecoder().decode(data);
    const dae = new ColladaLoader().parse(text, '');
    if (!dae) return null;
    // Robot descriptions use the file's own axes (as ROS does); undo the loader's Z-up turn, keep its units
    if (/<up_axis>\s*Z_UP/i.test(text)) dae.scene.rotation.set(0, 0, 0);
    else if (/<up_axis>\s*Y_UP/i.test(text)) dae.scene.rotation.set(Math.PI / 2, 0, 0);
    return collect(dae.scene);
  }
  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new GLTFLoader().parseAsync(data, '');
    return collect(gltf.scene);
  }
  return null;
}

function primitive(g: Geometry): THREE.BufferGeometry | null {
  let geo: THREE.BufferGeometry;
  switch (g.type) {
    case 'box':
      geo = new THREE.BoxGeometry(g.size.x, g.size.y, g.size.z);
      break;
    case 'sphere':
      geo = new THREE.SphereGeometry(g.radius, 24, 16);
      break;
    case 'ellipsoid':
      geo = new THREE.SphereGeometry(1, 24, 16);
      geo.scale(g.radii.x, g.radii.y, g.radii.z);
      break;
    case 'cylinder':
      // Robot cylinders run along Z
      geo = new THREE.CylinderGeometry(g.radius, g.radius, g.length, 32);
      geo.rotateX(Math.PI / 2);
      break;
    case 'capsule':
      geo = new THREE.CapsuleGeometry(g.radius, g.length, 6, 24);
      geo.rotateX(Math.PI / 2);
      break;
    default:
      return null;
  }
  return geo.index ? geo.toNonIndexed() : geo;
}

/** Welds and simplifies a triangle soup to about `target` triangles */
function simplify(geo: THREE.BufferGeometry, target: number): { positions: Float32Array; indices: Uint32Array } {
  const soup = new THREE.BufferGeometry();
  soup.setAttribute('position', geo.getAttribute('position'));
  const welded = mergeVertices(soup, 1e-3);
  const positions = (welded.getAttribute('position').array as Float32Array).slice();
  let indices: Uint32Array = new Uint32Array(welded.index!.array as ArrayLike<number>);
  if (indices.length / 3 > target && MeshoptSimplifier.supported) {
    const [out] = MeshoptSimplifier.simplify(indices, positions, 3, Math.max(target * 3, 36), 0.02, ['Prune']);
    if (out.length >= 36) indices = out as Uint32Array;
  }
  return { positions, indices };
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

/** Robot frame (m, X forward, Y left, Z up) → scene (mm, front +Z, left +X, Y up) */
const S = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);
const toScenePoint = (v: THREE.Vector3) => v.clone().applyMatrix4(S).multiplyScalar(1000);

const linkLabel = (name: string) => prettyJointName(name.replace(/_link$|_link_/i, ' ').replace(/^link_?/i, ''));

const limbOf = (name: string): RobotJoint['limb'] => {
  const n = name.toLowerCase();
  if (/hip|knee|ankle|leg|thigh|calf|foot|toe|haa|hfe|kfe|ffe|faa/.test(n)) return 'leg';
  if (/shoulder|elbow|wrist|arm|hand|finger|grip|thumb/.test(n)) return 'arm';
  if (/neck|head/.test(n)) return 'neck';
  if (/waist|torso|spine|trunk/.test(n)) return 'torso';
  return 'other';
};

const hex = (c: THREE.Color) => '#' + c.getHexString(THREE.SRGBColorSpace);

export async function importRobot(source: Source, opts: ImportOptions = {}): Promise<ImportedRobot> {
  const say = opts.onProgress ?? (() => {});
  const notes: string[] = [];
  say('Reading the description');
  const resolver = source.kind === 'url' ? await urlResolver(source.url) : filesResolver(source.files);
  if ('pickEntry' in resolver) await (resolver as ReturnType<typeof filesResolver>).pickEntry();
  let text = resolver.entry.text;
  if (/<mujoco\b/.test(text)) text = await inlineIncludes(text, resolver.read, source.kind === 'url' ? new URL(rawUrl(source.url)).pathname : resolver.entry.name);
  const doc = new DOMParser().parseFromString(text.replace(/<!--[\s\S]*?-->/g, ''), 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('That file isn’t valid XML.');
  const rootTag = doc.documentElement.tagName;
  if (rootTag !== 'robot' && rootTag !== 'mujoco') throw new Error('Choose a URDF (<robot>) or MJCF (<mujoco>) file.');
  const model = rootTag === 'robot' ? parseUrdf(doc) : parseMjcf(doc);
  const name = opts.name ?? prettyJointName(model.name);

  // Meshes, each file once
  const files = new Map<string, THREE.BufferGeometry | null>();
  const meshRefs = [...model.links.values()].flatMap((l) => l.visuals.map((v) => v.geometry)).filter((g): g is Extract<Geometry, { type: 'mesh' }> => g.type === 'mesh');
  const unique = [...new Set(meshRefs.map((g) => g.file))];
  let done = 0;
  await MeshoptSimplifier.ready.catch(() => {});
  const queue = [...unique];
  const worker = async () => {
    for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
      const file = f;
      const got = await resolver.read(file).catch(() => null);
      let geo: THREE.BufferGeometry | null = null;
      if (got) geo = await loadMesh(got.data, got.path).catch(() => null);
      if (!geo) notes.push(`Couldn't read ${file.split('/').pop()}`);
      files.set(file, geo);
      done++;
      say(`Loading meshes ${done}/${unique.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, worker));

  // Each link's geometry in the scene frame
  say('Building parts');
  const linkGeo = new Map<string, { geo: THREE.BufferGeometry; color: THREE.Color }>();
  for (const [link, l] of model.links) {
    const pieces: THREE.BufferGeometry[] = [];
    const colors: THREE.Color[] = [];
    for (const v of l.visuals) {
      let g: THREE.BufferGeometry | null;
      if (v.geometry.type === 'mesh') {
        const src = files.get(v.geometry.file);
        if (!src) continue;
        g = src.clone();
        g.scale(v.geometry.scale.x, v.geometry.scale.y, v.geometry.scale.z);
      } else g = primitive(v.geometry);
      if (!g) continue;
      g.applyMatrix4(v.origin);
      g.applyMatrix4(l.world);
      g.applyMatrix4(S);
      g.scale(1000, 1000, 1000);
      pieces.push(g);
      if (v.color) colors.push(v.color);
    }
    if (!pieces.length) continue;
    const merged = pieces.length === 1 ? pieces[0] : mergeGeometries(pieces, false);
    if (!merged) continue;
    // Simulation models often leave links uncolored or in debug colors; default to a light grey
    const color = colors[0] ?? new THREE.Color('#c8c8c8');
    linkGeo.set(link, { geo: merged, color });
  }
  if (!linkGeo.size) throw new Error(notes.length ? `None of the meshes could be read (${notes.length} files).` : 'The description has no visual geometry.');

  // Simplify to the triangle budget, in proportion to each link's share
  const budget = opts.maxTriangles ?? 220_000;
  const total = [...linkGeo.values()].reduce((s, { geo }) => s + geo.getAttribute('position').count / 3, 0);
  const box = new THREE.Box3();
  linkGeo.forEach(({ geo }) => {
    geo.computeBoundingBox();
    box.union(geo.boundingBox!);
  });
  // Stand it on the floor, centered on the origin
  const shift = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  // Moving joints, and which one moves each link (fixed joints weld a link to its parent)
  // The last joint into a link moves it (MJCF bodies can chain several)
  const byChild = new Map(model.joints.map((j) => [j.child, j]));
  const ownerOfLink = new Map<string, ModelJoint | null>();
  const ownerOf = (link: string): ModelJoint | null => {
    if (ownerOfLink.has(link)) return ownerOfLink.get(link)!;
    ownerOfLink.set(link, null);
    const j = byChild.get(link);
    const o = !j ? null : j.type !== 'fixed' ? j : ownerOf(j.parent);
    ownerOfLink.set(link, o);
    return o;
  };
  const jointAbove = (j: ModelJoint): ModelJoint | null => j.after ?? ownerOf(j.parent);

  const groupId = `robot-${Date.now().toString(36)}`;
  const partOfLink = new Map<string, string>();
  const parts: ScenePart[] = [];
  let triangles = 0;
  for (const [link, { geo, color }] of linkGeo) {
    const tris = geo.getAttribute('position').count / 3;
    const target = total > budget ? Math.max(1500, Math.round((budget * tris) / total)) : tris;
    const { positions, indices } = simplify(geo, target);
    const b = new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(positions, 3));
    const center = b.getCenter(new THREE.Vector3());
    const size = b.getSize(new THREE.Vector3());
    const local: number[] = new Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      local[i] = Math.round((positions[i] - center.x) * 100) / 100;
      local[i + 1] = Math.round((positions[i + 1] - center.y) * 100) / 100;
      local[i + 2] = Math.round((positions[i + 2] - center.z) * 100) / 100;
    }
    // Compact unused vertices left by the simplifier
    const used = new Int32Array(positions.length / 3).fill(-1);
    const pos: number[] = [];
    const idx: number[] = [];
    for (const i of indices) {
      if (used[i] < 0) {
        used[i] = pos.length / 3;
        pos.push(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]);
      }
      idx.push(used[i]);
    }
    triangles += idx.length / 3;
    const id = `${groupId}-${link.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
    partOfLink.set(link, id);
    const baseSize: [number, number, number] = [Math.max(size.x, 0.01), Math.max(size.y, 0.01), Math.max(size.z, 0.01)];
    parts.push({
      id,
      name: linkLabel(link),
      kind: 'mesh',
      category: 'structure',
      role: 'solid',
      position: [round(center.x + shift.x), round(center.y + shift.y), round(center.z + shift.z)],
      rotation: [0, 0, 0],
      dimensions: { width: round(baseSize[0]), height: round(baseSize[1]), depth: round(baseSize[2]) },
      color: hex(color),
      note: '',
      mechanicalTag: `${name} · ${link}`,
      visible: true,
      locked: false,
      mesh: { positions: pos, indices: idx, baseSize, source: `${name} · ${link}` },
      group: { id: groupId, name },
    });
  }

  // Joints in the scene frame
  const idOf = new Map<ModelJoint, string>();
  const taken = new Set<string>();
  for (const j of model.joints) {
    if (j.type === 'fixed') continue;
    let id = j.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'joint';
    while (taken.has(id)) id += '_';
    taken.add(id);
    idOf.set(j, id);
  }
  const partsOwnedBy = (joint: ModelJoint | null) =>
    [...partOfLink].filter(([link]) => ownerOf(link) === joint).map(([, id]) => id);
  const joints: RobotJoint[] = [];
  for (const j of model.joints) {
    if (j.type === 'fixed') continue;
    const parentJoint = jointAbove(j);
    const origin = toScenePoint(new THREE.Vector3().setFromMatrixPosition(j.world)).add(shift);
    const axis = j.axis.clone().transformDirection(j.world).applyMatrix4(new THREE.Matrix4().extractRotation(S)).normalize();
    const range = j.limit
      ? j.type === 'prismatic'
        ? ([round(j.limit[0] * 1000), round(j.limit[1] * 1000)] as [number, number])
        : ([round((j.limit[0] * 180) / Math.PI), round((j.limit[1] * 180) / Math.PI)] as [number, number])
      : undefined;
    // A link several joints deep with no geometry between: the joint above still holds the parts
    let parentParts = partsOwnedBy(parentJoint);
    for (let at = parentJoint, n = 0; !parentParts.length && at && n < 50; n++) {
      at = jointAbove(at);
      parentParts = partsOwnedBy(at);
    }
    joints.push({
      id: idOf.get(j)!,
      name: j.name,
      type: j.type,
      parent: parentParts,
      child: partsOwnedBy(j),
      parentJoint: parentJoint ? idOf.get(parentJoint) : undefined,
      origin: [round(origin.x), round(origin.y), round(origin.z)],
      axis: [axis.x, axis.y, axis.z].map((v) => Math.round(v * 1e6) / 1e6) as [number, number, number],
      range,
      limb: limbOf(j.name),
    });
  }
  return { name, parts, joints, triangles, notes };
}

const round = (v: number) => Math.round(v * 100) / 100;
