import * as THREE from 'three';
import { BVHLoader } from 'three/examples/jsm/loaders/BVHLoader.js';
import type { RobotAnimation, RobotJoint } from '../types/robotics';
import { isMovable, type Rig } from './kinematics';
import type { Mocap } from './mocapBones';

export { autoMapBones, autoMapRobot, KEYPOINT_LABELS, KEYPOINTS, type Keypoint, type Mocap } from './mocapBones';
export { retarget, type RetargetOptions, type RetargetResult } from './mocapRetarget';

function endSites(all: THREE.Bone[]): Array<[string, THREE.Bone]> {
  const taken = new Set(all.map((b) => b.name));

  return all
    .filter((b) => b.name === 'ENDSITE' && (b.parent as THREE.Bone | null)?.isBone)
    .map((b) => {
      const base = `${b.parent!.name}End`;
      let n = 1;
      let name = base;

      while (taken.has(name)) name = `${base}${++n}`;

      taken.add(name);

      return [name, b];
    });
}

export function parseBvh(text: string, name = 'Motion'): Mocap {
  const loader = new BVHLoader();
  const { skeleton, clip } = loader.parse(text);
  const bones = skeleton.bones.filter((b) => b.name !== 'ENDSITE');
  const ends = endSites(skeleton.bones);
  const root = skeleton.bones[0];
  const parentOf = new Map<string, string | null>();

  for (const b of bones) parentOf.set(b.name, b.parent && (b.parent as THREE.Bone).isBone ? b.parent.name : null);

  for (const [name, b] of ends) parentOf.set(name, b.parent!.name);

  const tracked: Array<[string, THREE.Bone]> = [...bones.map((b): [string, THREE.Bone] => [b.name, b]), ...ends];
  const collect = () => {
    root.updateMatrixWorld(true);

    return new Map(tracked.map(([name, b]) => [name, new THREE.Vector3().setFromMatrixPosition(b.matrixWorld)]));
  };
  const rest = collect();
  const mixer = new THREE.AnimationMixer(root);

  mixer.clipAction(clip).play();

  const frameTime = (() => {
    const m = /Frame Time:\s*([\d.eE+-]+)/.exec(text);

    return m ? Number(m[1]) : 1 / 30;
  })();
  const frames = Number(/Frames:\s*(\d+)/.exec(text)?.[1] ?? 0);
  const setTime = (t: number) => {
    mixer.setTime(Math.min(Math.max(t, 0), clip.duration));
    root.updateMatrixWorld(true);
  };

  return {
    name,
    frameTime,
    frames,
    duration: clip.duration,
    bones: bones.map((b) => b.name),
    ends: ends.map(([name]) => name),
    sample: (t) => {
      setTime(t);

      return collect();
    },
    rootQuaternion: (t) => {
      setTime(t);

      return root.getWorldQuaternion(new THREE.Quaternion());
    },
    rest,
    root: root.name,
    parentOf,
  };
}

export function unmappedJoints(rig: Rig, anim: RobotAnimation): RobotJoint[] {
  const moved = new Set<string>();
  const first = anim.keyframes[0]?.values ?? {};

  for (const k of anim.keyframes)
    for (const [id, v] of Object.entries(k.values)) if (Math.abs(v - (first[id] ?? 0)) > 0.5) moved.add(id);

  return rig.joints.filter((j) => isMovable(j) && !moved.has(j.id));
}
