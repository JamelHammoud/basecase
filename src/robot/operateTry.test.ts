import { describe, expect, it } from 'vitest';
import { TRY_FILE_VERSION, type StoredTry } from '../cases/tryFile';
import type { Recording } from '../sim/recorder';
import { drivingInput } from '../sim/inputSources';
import { readOperateLog } from './operateLog';
import { OPERATOR_VIDEO, operateEpisode, operatePlan, operateStored } from './operateTry';

const LOG = [
  { t: 0, k: 'status', mode: 'test', run: 'running', q: [0.1, 0.2] },
  { t: 0.1, k: 'intent', q: [0.15, 0.2] },
  { t: 0.1, k: 'status', mode: 'test', run: 'running', q: [null, 0.25] },
  { t: 0.2, k: 'status', mode: 'test', run: 'running', q: [0.3, null], e: [1.5, 0.5] },
]
  .map((line) => JSON.stringify(line))
  .join('\n');

const MANIFEST: StoredTry = {
  version: TRY_FILE_VERSION,
  id: 'operate-1',
  sceneId: 'scene-1',
  robot: { name: 'Arm', modelHash: 'a'.repeat(64), joints: ['shoulder', 'elbow'] },
  case: null,
  source: 'operate',
  input: 'camera',
  startedAt: '2026-11-14T10:00:00.000Z',
  seconds: 0.2,
  rate: 15,
  frames: 3,
  outcome: { verdict: 'unjudged', margin: null },
  seed: 0,
  sourceTry: null,
  faults: [],
};

describe('an Operate try from its session log', () => {
  it('makes one frame per status, holding a joint that didn’t answer at its last angle', () => {
    const log = readOperateLog(LOG);
    const episode = operateEpisode(log, 2);

    expect([...episode.t]).toEqual([0, 0.1, 0.2]);
    expect([...episode.state]).toEqual([0.1, 0.2, 0.1, 0.25, 0.3, 0.25]);
    expect(log.statuses[2].e).toEqual([1.5, 0.5]);
    expect(operatePlan(['shoulder', 'elbow'], episode)).toMatchObject({ joints: ['shoulder', 'elbow'], unit: 'rad' });
  });

  it('places the camera’s video where its segment started in the try', () => {
    const recording = { frames: 3, dt: 0.1, t: Float32Array.from([0, 0.1, 0.2]) } as unknown as Recording;
    const stored = operateStored(MANIFEST, recording, { seconds: 5 });

    expect(stored).toMatchObject({ frames: 3, rate: 10 });

    const opened = Date.parse(MANIFEST.startedAt) + 1500;

    expect(stored.videos).toEqual([{ ...OPERATOR_VIDEO, from: 0, to: 5 }]);
    expect(operateStored(MANIFEST, recording, { seconds: 5, startedAt: opened }).videos).toEqual([
      { ...OPERATOR_VIDEO, from: 1.5, to: 6.5 },
    ]);
    expect(operateStored(MANIFEST, recording, null).videos).toBeUndefined();
  });

  it('names the input that moved, with its raw values', () => {
    const readings = {
      keys: { v: [0, 0, 0] as [number, number, number] },
      code: { v: [1, 0, 0.5] as [number, number, number] },
    };

    expect(drivingInput(['keys', 'code'], readings)).toEqual({ id: 'code', values: [1, 0, 0.5] });
    expect(drivingInput(['keys'], readings)).toBeNull();
  });
});
