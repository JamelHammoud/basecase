import * as THREE from 'three';
import {
  childrenOf,
  mjAngles,
  placement,
  readDefaults,
  type Attrs,
  type MjAngles,
  type MjDefaults,
} from './mjcfFrames';
import { mjGeomVisual, pickVisualGeoms, type MjGeom, type MjMesh } from './mjcfGeoms';
import { displayRgb, elem, elems, nums, type Model, type ModelJoint, type ModelLink } from './model';

interface MjContext extends MjAngles {
  defaults: MjDefaults;
  meshes: Map<string, MjMesh>;
  materials: Map<string, THREE.Color>;
  links: Map<string, ModelLink>;
  joints: ModelJoint[];
  geoms: MjGeom[];
  anon: number;
}

interface BodyVisit {
  body: Element;
  parentWorld: THREE.Matrix4;
  parentLink: string | null;
  childclass: string;
  frame: THREE.Matrix4;
}

interface BodyLink {
  name: string;
  world: THREE.Matrix4;
  parent: string;
  childclass: string;
}

const classDefaults = (ctx: MjContext, cls: string, tag: string) =>
  ctx.defaults.classes.get(cls)?.get(tag) ?? ctx.defaults.classes.get('main')?.get(tag) ?? {};

function assetMesh(m: Element, defaults: MjDefaults, meshdir: string): [string, MjMesh] | null {
  const file = m.getAttribute('file');

  if (!file) return null;

  const cls = defaults.classes.get(m.getAttribute('class') ?? 'main')?.get('mesh') ?? {};
  const [sx, sy, sz] = nums(m.getAttribute('scale') ?? cls.scale, [1, 1, 1]);
  const name =
    m.getAttribute('name') ??
    file
      .split('/')
      .pop()!
      .replace(/\.[^.]+$/, '');

  return [
    name,
    { file: meshdir ? `${meshdir.replace(/\/$/, '')}/${file}` : file, scale: new THREE.Vector3(sx, sy, sz) },
  ];
}

function readAssets(mj: Element, defaults: MjDefaults) {
  const compiler = elem(mj, 'compiler');
  const meshdir = compiler?.getAttribute('meshdir') ?? compiler?.getAttribute('assetdir') ?? '';
  const meshes = new Map<string, MjMesh>();
  const materials = new Map<string, THREE.Color>();

  for (const asset of elems(mj, 'asset')) {
    for (const m of elems(asset, 'mesh')) {
      const entry = assetMesh(m, defaults, meshdir);

      if (entry) meshes.set(...entry);
    }

    for (const m of elems(asset, 'material')) {
      const [r, g, b] = nums(m.getAttribute('rgba'), [0.7, 0.7, 0.7, 1]);

      materials.set(m.getAttribute('name') ?? '', displayRgb(r, g, b));
    }
  }

  return { meshes, materials };
}

function mjLimit(ctx: MjContext, a: Attrs, type: string): [number, number] | undefined {
  const range = a('range') ? nums(a('range'), [0, 0]) : null;
  const limited = a('limited') !== 'false' && range && range[1] > range[0];

  if (!limited) return undefined;

  return type === 'slide' ? [range[0], range[1]] : [ctx.toRad(range[0]), ctx.toRad(range[1])];
}

const largest = (a: Attrs, key: string) => (a(key) ? Math.max(...nums(a(key), [0, 0]).map(Math.abs)) : 0);

function mjJoint(ctx: MjContext, j: Element, link: BodyLink, after: ModelJoint | undefined): ModelJoint | null {
  const def = classDefaults(ctx, j.getAttribute('class') ?? link.childclass, 'joint');
  const a: Attrs = (k) => j.getAttribute(k) ?? def[k];
  const type = a('type') ?? 'hinge';

  if (type === 'free' || type === 'ball') return null;

  const [px, py, pz] = nums(a('pos'), [0, 0, 0]);
  const [ax, ay, az] = nums(a('axis'), [0, 0, 1]);
  const frc = largest(a, 'actuatorfrcrange');

  return {
    effort: frc > 0 ? frc : undefined,
    name: j.getAttribute('name') ?? `${link.name}_joint`,
    type: type === 'slide' ? 'prismatic' : 'revolute',
    parent: link.parent,
    child: link.name,
    world: link.world.clone().multiply(new THREE.Matrix4().makeTranslation(px, py, pz)),
    axis: new THREE.Vector3(ax, ay, az).normalize(),
    limit: mjLimit(ctx, a, type),
    after,
  };
}

function addBodyJoints(ctx: MjContext, body: Element, link: BodyLink) {
  const js = elems(body, 'joint');

  if (!js.length) {
    ctx.joints.push({
      name: `${link.name}_fixed`,
      type: 'fixed',
      parent: link.parent,
      child: link.name,
      world: link.world,
      axis: new THREE.Vector3(1, 0, 0),
    });

    return;
  }

  let prev: ModelJoint | undefined;

  for (const j of js) {
    const made = mjJoint(ctx, j, link, prev);

    if (!made) continue;

    ctx.joints.push(made);
    prev = made;
  }
}

function bodyLink(body: Element, world: THREE.Matrix4): ModelLink {
  const inertial = elems(body, 'inertial')[0];
  const mass = Number(inertial?.getAttribute('mass'));

  return {
    world,
    visuals: [],
    mass: mass > 0 ? mass : undefined,
    com: mass > 0 ? new THREE.Vector3(...nums(inertial?.getAttribute('pos'), [0, 0, 0])) : undefined,
  };
}

function visitBody(ctx: MjContext, visit: BodyVisit) {
  const { body } = visit;
  const cc = body.getAttribute('childclass') ?? visit.childclass;
  const name = body.getAttribute('name') ?? `body_${ctx.anon++}`;
  const own: Attrs = (k) => body.getAttribute(k) ?? undefined;
  const world = visit.parentWorld.clone().multiply(visit.frame).multiply(placement(own, ctx));

  ctx.links.set(name, bodyLink(body, world));

  if (visit.parentLink) addBodyJoints(ctx, body, { name, world, parent: visit.parentLink, childclass: cc });

  for (const { el: g, frame } of childrenOf(body, 'geom', ctx)) {
    const cls = g.getAttribute('class') ?? cc;
    const def = classDefaults(ctx, cls, 'geom');

    ctx.geoms.push({ link: name, attrs: (k) => g.getAttribute(k) ?? def[k], cls, frame });
  }

  for (const { el: b, frame } of childrenOf(body, 'body', ctx))
    visitBody(ctx, { body: b, parentWorld: world, parentLink: name, childclass: cc, frame });
}

function visitWorld(ctx: MjContext, worldbody: Element) {
  ctx.links.set('world', { world: new THREE.Matrix4(), visuals: [] });

  for (const g of elems(worldbody, 'geom')) {
    const def = ctx.defaults.classes.get(g.getAttribute('class') ?? 'main')?.get('geom') ?? {};

    ctx.geoms.push({
      link: 'world',
      attrs: (k) => g.getAttribute(k) ?? def[k],
      cls: g.getAttribute('class') ?? 'main',
    });
  }

  for (const { el: b, frame } of childrenOf(worldbody, 'body', ctx))
    visitBody(ctx, { body: b, parentWorld: new THREE.Matrix4(), parentLink: null, childclass: 'main', frame });
}

function actuatorEffort(ctx: MjContext, act: Element): number {
  const def = ctx.defaults.classes.get(act.getAttribute('class') ?? 'main')?.get(act.tagName) ?? {};
  const a: Attrs = (k) => act.getAttribute(k) ?? def[k];
  const force = largest(a, 'forcerange');
  const motor =
    act.tagName === 'motor' && a('ctrlrange') ? largest(a, 'ctrlrange') * (nums(a('gear'), [1])[0] || 1) : 0;

  return force || motor;
}

function applyActuators(ctx: MjContext, mj: Element) {
  for (const act of elems(mj, 'actuator').flatMap((x) => [...x.children])) {
    const j = ctx.joints.find((k) => k.name === act.getAttribute('joint'));

    if (!j || j.effort) continue;

    const effort = actuatorEffort(ctx, act);

    if (effort) j.effort = effort;
  }
}

export function parseMjcf(doc: Document): Model {
  const mj = doc.documentElement;
  const defaults = readDefaults(mj);
  const ctx: MjContext = {
    ...mjAngles(mj),
    defaults,
    ...readAssets(mj, defaults),
    links: new Map(),
    joints: [],
    geoms: [],
    anon: 0,
  };
  const worldbody = elem(mj, 'worldbody');

  if (worldbody) visitWorld(ctx, worldbody);

  for (const g of pickVisualGeoms(ctx.geoms)) {
    const visual = mjGeomVisual(g, ctx);

    if (visual) ctx.links.get(g.link)?.visuals.push(visual);
  }

  applyActuators(ctx, mj);

  const isChild = new Set(ctx.joints.map((j) => j.child));
  const root = [...ctx.links.keys()].find((l) => l !== 'world' && !isChild.has(l)) ?? 'world';

  return { name: mj.getAttribute('model') ?? 'Robot', links: ctx.links, joints: ctx.joints, root };
}
