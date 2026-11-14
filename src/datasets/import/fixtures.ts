import { box, fixtureMeasures, fixtureTriangles, joint, type FixtureRobot } from '../../sim/fixtures/parts';
import { buildMjcf } from '../../sim/mjcf';
import type { SimModel } from '../../sim/mjcfTypes';
import { DEFAULT_PROJECT } from '../../types/robotics';
import { buildRig } from '../../utils/kinematics';
import { DATASET_FPS } from '../episodes';
import { lerobotFiles } from '../lerobot';
import type { DatasetSpec } from '../lerobotRows';
import { lerobotV3Files } from '../lerobotV3';
import type { SourceData, SourceEpisode } from './types';

export const SO101_JOINTS = ['shoulder_pan', 'shoulder_lift', 'elbow_flex', 'wrist_flex', 'wrist_roll', 'gripper'];

const LINK_MM = 60;

export interface ArmOptions {
  prefix?: string;
  x?: number;
  range?: [number, number];
}

export function namedArm(names: string[], { prefix = '', x = 0, range = [-150, 150] }: ArmOptions = {}): FixtureRobot {
  const id = (name: string) => `${prefix}${name}`;
  const parts = [box(id('base'), [x, 20, 0], [60, 40, 60], 300)];
  const joints = names.map((name, i) => {
    const link = id(`link${i}`);
    const y = 40 + LINK_MM * i;

    parts.push(box(link, [x, y + LINK_MM / 2, 0], [20, LINK_MM, 20], 40));

    return {
      ...joint({
        id: id(name),
        link: [i ? id(`link${i - 1}`) : id('base'), link],
        origin: [x, y, 0],
        axis: i % 2 ? [1, 0, 0] : [0, 1, 0],
        effortNm: 3,
        range,
        ...(i ? { parentJoint: id(names[i - 1]) } : {}),
        limb: 'arm',
      }),
      name,
    };
  });

  return { id: id('arm'), parts, joints, expect: { morphology: 'fixed', stand: 'n/a', walk: 'n/a' } };
}

export function sceneModel(robots: FixtureRobot[]): SimModel {
  const parts = robots.flatMap((r) => r.parts);
  const joints = robots.flatMap((r) => r.joints);

  return buildMjcf({
    parts,
    rig: buildRig(joints, parts),
    project: DEFAULT_PROJECT,
    measures: fixtureMeasures(parts),
    partTriangles: fixtureTriangles(parts),
  });
}

export interface EpisodeSpec {
  names: string[];
  frames: number;
  fps?: number;
  task?: string | null;
  value: (frame: number, column: number) => number;
}

export function episodeOf({ names, frames, fps = 30, task = null, value }: EpisodeSpec, index = 0): SourceEpisode {
  const state = new Float64Array(frames * names.length);

  for (let n = 0; n < frames; n++) for (let c = 0; c < names.length; c++) state[n * names.length + c] = value(n, c);

  return {
    index,
    task,
    t: Float64Array.from({ length: frames }, (_, n) => n / fps),
    state,
    action: null,
    videos: [],
  };
}

export const sourceOf = (names: string[], episodes: SourceEpisode[], robotType: string | null = null): SourceData => ({
  format: 'lerobot-v3.0',
  robotType,
  names,
  episodes,
});

export const sweepDeg = (frame: number, column: number) => 10 + 30 * Math.sin(frame / 10 + column);

export interface DatasetFixture {
  names: string[];
  lengths: number[];
  value: (frame: number, column: number, episode: number) => number;
  robotType?: string;
  version?: 'v2.1' | 'v3.0';
}

function datasetSpec({ names, lengths, value, robotType = 'so101_follower' }: DatasetFixture): DatasetSpec {
  const column = (length: number, k: number) =>
    Float32Array.from({ length: length * names.length }, (_, i) =>
      value(Math.floor(i / names.length), i % names.length, k),
    );

  return {
    robotType,
    jointNames: names,
    videos: [],
    episodes: lengths.map((length, k) => ({
      task: `Pick up cube ${k + 1}`,
      frames: Array.from({ length }, (_, i) => i),
      timestamps: Float32Array.from({ length }, (_, i) => i / DATASET_FPS),
      state: column(length, k),
      action: column(length, k),
      videos: {},
      imageStats: {},
      source: {},
    })),
    source: {},
  };
}

export function lerobotDataset(fixture: DatasetFixture): Record<string, Uint8Array> {
  const spec = datasetSpec(fixture);

  return fixture.version === 'v2.1' ? lerobotFiles(spec) : lerobotV3Files(spec, {});
}
