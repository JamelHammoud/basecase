import { cameraMatrixRotation } from './cameraFrame';
import { Matrix4, Vector3 } from 'three';
import { clampLens, horizontalDeg, type Lens } from '../cameras/lens';
import { isCameraPart } from '../routines/capabilities';
import type { ScenePart } from '../types/robotics';
import { partMatrix, type V3 } from '../utils/kinematics';
import { recordValue, vectorValue } from './recordValues';
import type { StudyKnob, StudyScene } from './types';

export function validCameraLens(value: unknown): value is Lens {
  if (!recordValue(value) || (value.model !== 'pinhole' && value.model !== 'fisheye')) return false;

  const lens = value as Lens;
  const angle = horizontalDeg(lens);

  return Number.isFinite(angle) && horizontalDeg(clampLens(lens)) === angle;
}

export const validCameraPose = (value: unknown) =>
  recordValue(value) &&
  vectorValue(value.position) &&
  vectorValue(value.rotation) &&
  value.position.every((n) => Math.abs(n) <= 500000) &&
  value.rotation.every((n) => Math.abs(n) <= 360);

function mountedIds(parts: ScenePart[], id: string): Set<string> {
  const links = new Map(parts.map((part) => [part.id, new Set<string>()]));

  for (const part of parts) {
    const targets = [...(part.mates ?? []).map((mate) => mate.target), ...(part.frame ? [part.frame] : [])];

    for (const target of targets) {
      links.get(part.id)!.add(target);
      links.get(target)?.add(part.id);
    }
  }

  const ids = new Set([id]);

  for (const found of ids) for (const next of links.get(found) ?? []) ids.add(next);

  return ids;
}

function transformed(part: ScenePart, transform: Matrix4): ScenePart {
  const matrix = partMatrix(part).premultiply(transform);

  return {
    ...part,
    position: new Vector3().setFromMatrixPosition(matrix).toArray() as V3,
    rotation: cameraMatrixRotation(matrix),
  };
}

export function applyCameraChoice(
  scene: StudyScene,
  knob: Extract<StudyKnob, { kind: 'camera_pose' | 'camera_lens' }>,
  index: number,
): StudyScene {
  const part = scene.parts.find((part) => part.id === knob.part);

  if (!part || !isCameraPart(part)) throw new Error(`${knob.id}: Choose a catalog camera in the scene.`);

  const chosen = knob.values[index];
  const supported = knob.kind === 'camera_lens' ? validCameraLens(chosen) : validCameraPose(chosen);

  if (!supported) throw new Error('Choose a supported camera pose or lens.');

  if (knob.kind === 'camera_lens')
    return { ...scene, parts: scene.parts.map((p) => (p === part ? { ...p, cameraLens: knob.values[index] } : p)) };

  const pose = knob.values[index];
  const transform = partMatrix({ ...part, ...pose }).multiply(partMatrix(part).invert());
  const ids = mountedIds(scene.parts, part.id);

  return { ...scene, parts: scene.parts.map((p) => (ids.has(p.id) ? transformed(p, transform) : p)) };
}

export function assertCameraSelections(scene: StudyScene, knobs: StudyKnob[], selection: number[]) {
  knobs.forEach((knob, i) => {
    if (knob.kind !== 'camera_pose') return;

    const part = scene.parts.find((part) => part.id === knob.part)!;
    const expected = partMatrix({ ...part, ...knob.values[selection[i]] });
    const actual = partMatrix(part);

    if (expected.elements.some((value, index) => Math.abs(value - actual.elements[index]) > 1e-7))
      throw new Error('Choose camera poses that keep their shared mount rigid.');
  });
}
