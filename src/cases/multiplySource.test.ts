import { describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import { generatedTry, multiplySource, sha256, trySummary, TRY_VERSION, type TryRecord } from './tries';

const XML = '<mujoco/>';

const joints = [
  { id: 'j1', name: 'Shoulder', type: 'revolute' as const, actuator: 0, drive: 'position' as const, effort: 2 },
];

const recording = { frames: 100, dt: 0.02, commands: [{ t: 0 }] } as unknown as Recording;

async function stored(): Promise<TryRecord> {
  return {
    version: TRY_VERSION,
    id: 'try-a',
    sceneId: 'scene-1',
    robot: { name: 'Arm', modelHash: await sha256(XML), joints },
    case: null,
    source: 'case',
    input: null,
    at: '2026-11-13T10:00:00.000Z',
    seconds: 2,
    rate: 50,
    outcome: { result: 'passed', margin: 0.2 },
    seed: 0,
    sourceTry: null,
    frames: 100,
    faults: [],
    commands: 1,
  };
}

describe('the source Multiply builds variations from', () => {
  it('is the full stored try, so a variation from a listed summary keeps its joints', async () => {
    const full = await stored();
    const listed = trySummary(full);

    expect(listed.robot.joints).toBeUndefined();

    const source = await multiplySource(listed, XML, async () => ({ record: full, recording }));
    const variation = generatedTry({ source: source!.record, seed: 1, margin: 0.1, recording });

    expect(variation.robot.joints).toEqual(joints);
    expect(source!.recording).toBe(recording);
  });

  it('refuses a try recorded on another model or without commands', async () => {
    const full = await stored();
    const open = async () => ({ record: full, recording });

    expect(await multiplySource(full, '<mujoco model="edited"/>', open)).toBeNull();
    expect(
      await multiplySource(full, XML, async () => ({ record: full, recording: { ...recording, commands: undefined } })),
    ).toBeNull();
    expect(await multiplySource(full, XML, async () => null)).toBeNull();
  });
});
