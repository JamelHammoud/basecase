import { DEFAULT_PROJECT, type RobotJoint, type ScenePart } from '../types/robotics';
import type { VersionScene } from './sceneVersions';

export const versionPart = (id: string, x = 0): ScenePart => ({
  id,
  name: id,
  kind: 'box',
  category: 'structure',
  role: 'solid',
  position: [x, 0, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 20, height: 10, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

export const versionScene = (parts: ScenePart[], joints: RobotJoint[] = []): VersionScene => ({
  parts,
  project: { ...DEFAULT_PROJECT, joints },
  annotations: [],
  globalGoal: '',
});

export const versionJoint = (id: string, parent: string, child: string): RobotJoint => ({
  id,
  name: id,
  type: 'fixed',
  parent: [parent],
  child: [child],
  origin: [0, 0, 0],
  axis: [0, 0, 1],
});

export const versionPortPart = (id: string, port: string): ScenePart => ({
  ...versionPart(id),
  kind: 'cad_part',
  cad: {
    language: 'openscad',
    code: 'cube([20, 10, 20]);',
    positions: [0, 0, 0, 20, 0, 0, 0, 10, 0],
    indices: [0, 1, 2],
    originOffset: [0, 0, 0],
    baseSize: [20, 10, 20],
    ports: [{ name: port, kind: 'face', position: [0, 0, 0], axis: [0, 0, 1] }],
  },
});
