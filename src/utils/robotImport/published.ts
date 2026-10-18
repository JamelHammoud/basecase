import * as THREE from 'three';
import type { RobotJoint } from '../../types/robotics';
import { prettyJointName } from '../kinematics';
import type { Model, ModelJoint } from './model';

export const ROBOT_DATA_VERSION = 2;

export const round = (v: number) => Math.round(v * 100) / 100;

export const S = new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1);

export function catalogFrame(rotate: Array<[string, number]>): THREE.Matrix4 {
  const r = new THREE.Matrix4();

  for (const [axis, deg] of rotate) {
    const a = axis.toLowerCase();

    r.premultiply(
      new THREE.Matrix4().makeRotationAxis(
        new THREE.Vector3(a === 'x' ? 1 : 0, a === 'y' ? 1 : 0, a === 'z' ? 1 : 0),
        THREE.MathUtils.degToRad(deg),
      ),
    );
  }

  return new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1).multiply(r);
}

export const linkLabel = (name: string) => prettyJointName(name.replace(/_link$|_link_/i, ' ').replace(/^link_?/i, ''));

export const limbOf = (name: string): RobotJoint['limb'] => {
  const n = name.toLowerCase();

  if (/hip|knee|ankle|leg|thigh|calf|foot|toe|haa|hfe|kfe|ffe|faa/.test(n)) return 'leg';

  if (/shoulder|elbow|wrist|arm|hand|finger|grip|thumb/.test(n)) return 'arm';

  if (/neck|head/.test(n)) return 'neck';

  if (/waist|torso|spine|trunk/.test(n)) return 'torso';

  return 'other';
};

export const hex = (c: THREE.Color) => '#' + c.getHexString(THREE.SRGBColorSpace);

export interface PublishedData {
  links: Map<string, { massKg: number; com: THREE.Vector3 }>;
  joints: Map<string, { effort?: number; velocity?: number; origin: THREE.Vector3; type: ModelJoint['type'] }>;
}

function sceneVelocity(j: ModelJoint): number | undefined {
  if (j.velocity === undefined) return undefined;

  return j.type === 'prismatic' ? j.velocity * 1000 : (j.velocity * 180) / Math.PI;
}

function linkBelongingTo(link: string, parentOf: Map<string, string>, partLinks: Set<string>): string | undefined {
  let at: string | undefined = link;

  for (let n = 0; at && !partLinks.has(at) && n < 200; n++) at = parentOf.get(at);

  return at;
}

export function publishedData(model: Model, frame: THREE.Matrix4, partLinks: Set<string>): PublishedData {
  const toScene = (v: THREE.Vector3) => v.clone().applyMatrix4(frame).multiplyScalar(1000);
  const parentOf = new Map(model.joints.map((j) => [j.child, j.parent]));
  const acc = new Map<string, { kg: number; m: THREE.Vector3 }>();

  for (const [link, l] of model.links) {
    if (!l.mass) continue;

    const at = linkBelongingTo(link, parentOf, partLinks);

    if (!at) continue;

    const com = toScene((l.com ?? new THREE.Vector3()).clone().applyMatrix4(l.world));
    const a = acc.get(at) ?? { kg: 0, m: new THREE.Vector3() };

    a.kg += l.mass;
    a.m.addScaledVector(com, l.mass);
    acc.set(at, a);
  }

  const links = new Map([...acc].map(([k, a]) => [k, { massKg: a.kg, com: a.m.divideScalar(a.kg) }]));
  const joints = new Map(
    model.joints.map((j) => [
      j.name,
      {
        type: j.type,
        effort: j.effort,
        velocity: sceneVelocity(j),
        origin: toScene(new THREE.Vector3().setFromMatrixPosition(j.world)),
      },
    ]),
  );

  return { links, joints };
}
