import * as THREE from 'three';
import type { Lens } from '../../cameras/lens';
import { renderMatFrame, type MatCamera } from '../../cameras/mat/matFrames';
import type { BaseFix, V3 } from '../../cameras/mat/matSolve';
import { createMatTracker, trackMat, type MatSample } from '../../cameras/mat/matTracker';
import { loadTagDetector, type TagDetector } from '../../cameras/mat/tagDetector';
import { simDeltas } from '../../sim/mjcfFrames';
import type { SimModel } from '../../sim/mjcfTypes';
import { framePoses, type Recording } from '../../sim/recorder';
import type { Rig } from '../../utils/kinematics';
import { matBounds, type BaseTag, type CaseMat } from './matLayout';
import type { RealSample } from './realTry';

export interface CameraSetup {
  tiltDeg?: number;
  rollDeg?: number;
  lens?: Lens;
  margin?: number;
}

const DEFAULT_LENS: Lens = { model: 'pinhole', hfovDeg: 70 };

export function matCamera(mat: CaseMat, setup: CameraSetup = {}): MatCamera {
  const { minX, maxX, minZ, maxZ } = matBounds(mat);
  const lens = setup.lens ?? DEFAULT_LENS;
  const hfov = lens.model === 'pinhole' ? lens.hfovDeg : 90;
  const vfov = 2 * Math.atan(Math.tan((hfov * Math.PI) / 360) * (9 / 16));
  const [across, along] = [maxX - minX, maxZ - minZ].sort((a, b) => b - a);
  const reach = Math.max(across / 2 / Math.tan((hfov * Math.PI) / 360), along / 2 / Math.tan(vfov / 2));
  const distance = reach * (setup.margin ?? 1.1);
  const tilt = ((setup.tiltDeg ?? 25) * Math.PI) / 180;
  const target: V3 = [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];
  const back = maxZ - minZ > maxX - minX ? [-1, 0] : [0, -1];

  return {
    position: [
      target[0] + back[0] * distance * Math.sin(tilt),
      distance * Math.cos(tilt),
      target[2] + back[1] * distance * Math.sin(tilt),
    ],
    target,
    lens,
    rollDeg: setup.rollDeg,
  };
}

export function tagFix(base: BaseTag, delta: THREE.Matrix4): BaseFix {
  const center = new THREE.Vector3(...base.center).applyMatrix4(delta);
  const up = new THREE.Vector3(base.up[0], 0, base.up[1]).transformDirection(delta);

  return { x: center.x, z: center.z, yaw: Math.atan2(up.x, up.z) };
}

export interface SimScene {
  model: SimModel;
  rig: Rig;
}

export function simTagFixes(recording: Recording, scene: SimScene, base: BaseTag) {
  const part = [...(scene.rig.robots[0]?.parts ?? [])].find((id) => !scene.rig.ownerOf.has(id))!;

  return (t: number): BaseFix => {
    const frame = Math.min(recording.frames - 1, Math.round(t / recording.dt));

    return tagFix(base, simDeltas(scene.model, framePoses(recording, frame)).get(part)!);
  };
}

export interface Shoot {
  mat: CaseMat;
  camera: MatCamera;
  width?: number;
  height?: number;
  fps?: number;
  seconds: number;
  pose: (t: number) => BaseFix | null;
  printScale?: number;
  keep?: (id: number) => boolean;
}

let detector: Promise<TagDetector> | null = null;

export const testDetector = () => {
  detector ??= loadTagDetector();

  return detector;
};

export async function shoot(options: Shoot): Promise<{ samples: MatSample[]; refusal: string | null }> {
  const { mat, camera, seconds, pose } = options;
  const width = options.width ?? 640;
  const height = options.height ?? 360;
  const fps = options.fps ?? 10;
  const tags = await testDetector();
  const tracker = createMatTracker(trackMat(mat));
  const samples: MatSample[] = [];
  let last: { key: string; gray: Uint8Array } | null = null;

  for (let i = 0; i <= Math.round(seconds * fps); i++) {
    const t = i / fps;
    const base = pose(t);
    const key = JSON.stringify(base && [base.x.toFixed(2), base.z.toFixed(2), base.yaw.toFixed(5)]);
    const gray: Uint8Array =
      last?.key === key
        ? last.gray
        : renderMatFrame({ mat, camera, width, height, base, printScale: options.printScale, seed: i });

    last = { key, gray };

    const seen = tags.detect(gray, width, height).filter((d) => options.keep?.(d.id) ?? true);

    samples.push(tracker.push(seen, { width, height }, t));
  }

  return { samples, refusal: tracker.refusal() };
}

export const realSamples = (samples: MatSample[]): RealSample[] => samples.map(({ t, base }) => ({ t, base }));
