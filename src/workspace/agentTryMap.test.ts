import { describe, expect, it, vi } from 'vitest';
import type { TryRecord } from '../cases/tries';
import { ROS2_POINT_CLOUD2 } from '../datasets/import/decode/fixtures';
import { writeMcap } from '../datasets/import/mcapFixtures';
import { readMcap } from '../datasets/import/recordingFiles';
import { cdrMessage } from '../datasets/import/topicFixtures';
import type { SimModel } from '../sim/mjcfTypes';
import type { Recording } from '../sim/recorder';
import { DEFAULT_PROJECT } from '../types/robotics';
import { buildRig } from '../utils/kinematics';
import { readTry, type TryReadContext } from './agentTryRequests';
import type { TryTimeline } from './useTryTimeline';

const model: SimModel = {
  version: 1,
  xml: '',
  bodies: [],
  joints: [],
  robots: [],
  initial: { values: {} },
  massKg: {},
};

const record: TryRecord = {
  id: 'map-try',
  caseId: 'scan',
  robot: 'Rover',
  at: '2026-11-14T10:00:00Z',
  passed: true,
  margin: 0,
  seconds: 1,
  manifest: {} as TryRecord['manifest'],
};

async function cloudRecording(): Promise<Recording> {
  const data = new Uint8Array(Float32Array.from([1, 2, 3, 2, 4, 6]).buffer);
  const message = cdrMessage(ROS2_POINT_CLOUD2, '/points', [
    1,
    {
      header: { stamp: { sec: 1, nanosec: 0 }, frame_id: 'map' },
      height: 1,
      width: 2,
      fields: ['x', 'y', 'z'].map((name, i) => ({ name, offset: i * 4, datatype: 7, count: 1 })),
      is_bigendian: false,
      point_step: 12,
      row_step: 24,
      data,
      is_dense: true,
    },
  ]);
  const bytes = await writeMcap([message]);
  const imported = await readMcap([{ name: 'points.mcap', bytes }]);
  const episode = imported.episodes[0];

  return {
    dt: 0.02,
    frames: episode.t.length,
    nq: 0,
    nv: 0,
    nu: 0,
    nbody: 0,
    t: Float32Array.from(episode.t),
    ctrl: new Float32Array(),
    qpos: new Float64Array(),
    qvel: new Float32Array(),
    poses: new Float32Array(),
    topics: episode.topics ?? undefined,
  };
}

function context(recording: Recording, matching = true, scanModel = model) {
  const timeline = {
    open: true,
    record,
    frame: 0,
    recording,
    efforts: { peaks: [], forces: [] },
    scene: null,
    trips: [],
    seek: vi.fn(),
  };
  const ctx: TryReadContext = {
    project: () => ({ ...DEFAULT_PROJECT, tries: [record] }),
    viewport: () => null,
    setAction: () => {},
    cases: { cases: [] },
    tryRead: {
      timeline: () => timeline as unknown as TryTimeline,
      model: () => scanModel,
      rig: () => buildRig([], []),
      sought: () => ({ frame: 0 }),
      mapMatching: () => matching,
    },
    listTries: async () => [],
  };

  return { ctx, timeline };
}

describe('read_try map facts', () => {
  it('returns the whole imported map’s point count and bounds in its ROS frame and meters', async () => {
    const { ctx, timeline } = context(await cloudRecording(), false);
    const result = await readTry({ signals: ['robot.tilt'], from: 0, to: 0 }, ctx);

    expect(result).toMatchObject({
      ok: true,
      map: { frame: 'map', points: 2, bounds: { min: [1, 2, 3], max: [2, 4, 6] } },
    });
    expect(timeline.seek).toHaveBeenLastCalledWith(0);
  });

  it('returns null for a try with no scans', async () => {
    const recording = await cloudRecording();
    const { ctx } = context({ ...recording, topics: undefined });

    expect(await readTry({ signals: ['robot.tilt'] }, ctx)).toMatchObject({ ok: true, map: null });
  });

  it('returns map facts from the simulation’s recorded LiDAR ranges', async () => {
    const recording: Recording = {
      ...(await cloudRecording()),
      topics: undefined,
      nbody: 1,
      scanWidth: 1,
      scan: new Float32Array([0.5]),
      poses: new Float32Array([0, 0, 0, 1, 0, 0, 0]),
    };
    const scanModel: SimModel = {
      ...model,
      bodies: [{ name: 'base', parts: ['lidar'], origin: [0, 0, 0] }],
      scans: [{ part: 'lidar', body: 'base', pos: [0, 0, 0], dirs: [1, 0, 0], cols: 1, rows: 1, rangeM: 2 }],
    };
    const { ctx } = context(recording, true, scanModel);

    expect(await readTry({ signals: ['robot.tilt'] }, ctx)).toMatchObject({
      ok: true,
      map: { frame: null, points: 1, bounds: { min: [1, 0, 0], max: [1, 0, 0] } },
    });
  });
});
