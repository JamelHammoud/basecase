import { describe, expect, it } from 'vitest';
import type { Recording } from '../sim/recorder';
import { decodeRecording, encodeRecording } from './recordingFile';
import { readStoredTry, storedTryOf, summaryOf, summaryRecord, tryRecordOf } from './tryFile';
import { goingWith, sourceTryOf, type TryRecord } from './tries';
import { MOTION_SAMPLES } from './trySearch/types';

const record = (extra: Partial<TryRecord> = {}): TryRecord => ({
  id: 'try-abc',
  caseId: 'touch-the-dots',
  robot: 'Arm',
  at: '2026-11-13T10:00:00.000Z',
  passed: true,
  margin: 0.25,
  seconds: 4,
  manifest: {
    formatVersion: 1,
    caseHash: 'c'.repeat(64),
    modelHash: 'm'.repeat(64),
    seed: 0,
    frames: 200,
    dt: 0.02,
    faults: [{ joint: 'elbow', kind: 'weak', at: 1.5, until: 2 }],
    commands: 12,
    world: 2,
  },
  ...extra,
});

const context = { sceneId: 'scene-a', caseName: 'Touch the Dots', joints: ['shoulder', 'elbow'] };

function recording(frames: number): Recording {
  const nq = 3;
  const nbody = 2;

  return {
    dt: 0.02,
    frames,
    nq,
    nv: 3,
    nu: 2,
    nbody,
    t: Float32Array.from({ length: frames }, (_, i) => i * 0.02),
    ctrl: Float32Array.from({ length: frames * 2 }, (_, i) => i / 7),
    qpos: Float64Array.from({ length: frames * nq }, (_, i) => Math.sin(i) * 1e-9 + i),
    qvel: Float32Array.from({ length: frames * 3 }, (_, i) => -i),
    poses: Float32Array.from({ length: frames * nbody * 7 }, (_, i) => i / 3),
    torque: new Float32Array(frames).fill(0.5),
    jointQpos: Int32Array.from([0, 1, 2]),
    jointDof: Int32Array.from([0, 1, 2]),
    root: [0, 0],
    faults: [{ joint: 'elbow', kind: 'stuck', at: 0.4 }],
    commands: [{ at: 0.1, command: { slot: 0, v: [1, 0, 0] } as never }],
    controller: { kind: 'hold', values: { elbow: 0.2 } },
    world: [],
  };
}

describe('a try’s manifest', () => {
  it('round-trips through try.json', () => {
    const stored = storedTryOf(record(), context);
    const read = readStoredTry(JSON.parse(JSON.stringify(stored)));

    expect(read).toEqual(stored);
    expect(stored).toMatchObject({
      sceneId: 'scene-a',
      robot: { name: 'Arm', joints: ['shoulder', 'elbow'] },
      case: { id: 'touch-the-dots', name: 'Touch the Dots' },
      source: 'case',
      rate: 50,
      outcome: { verdict: 'passed', margin: 0.25 },
    });
    expect(tryRecordOf(read!)).toEqual(record());
  });

  it('keeps a generated try’s seed and source, and a real try’s source', () => {
    const generated = record({
      id: 'try-abc-7',
      generated: true,
      manifest: { ...record().manifest, seed: 7, source: 'try-abc' },
    });
    const stored = storedTryOf(generated, context);

    expect(stored).toMatchObject({ source: 'generated', seed: 7, sourceTry: 'try-abc', input: 'script' });
    expect(tryRecordOf(stored)).toEqual(generated);
    expect(storedTryOf(record({ real: true }), context)).toMatchObject({ source: 'real', input: 'mat' });
    expect(tryRecordOf(storedTryOf(record({ real: true }), context)).real).toBe(true);
  });

  it('lists as a summary that opens as the same try', () => {
    const summary = summaryOf(storedTryOf(record(), context), { recording: true, strip: false });
    const { commands: _commands, world: _world, ...manifest } = record().manifest;

    expect(_commands).toBe(12);
    expect(_world).toBe(2);
    expect(summaryRecord(summary)).toEqual({ ...record(), manifest: { ...manifest, caseHash: '', faults: [] } });
  });

  it('refuses a manifest with a crafted id or a wrong shape', () => {
    const good = JSON.parse(JSON.stringify(storedTryOf(record(), context)));

    for (const bad of [
      { ...good, id: '../auth' },
      { ...good, sceneId: '..' },
      { ...good, sourceTry: 'a/b' },
      { ...good, version: 2 },
      { ...good, source: 'teleport' },
      { ...good, outcome: { verdict: 'won', margin: 1 } },
      { ...good, faults: [{ joint: 'elbow', kind: 'melted', at: 0 }] },
      { ...good, frames: -1 },
      { ...good, robot: { name: 'Arm', modelHash: 'm', joints: [1] } },
      null,
      [],
    ])
      expect(readStoredTry(bad)).toBeNull();
  });
});

describe('what a try’s manifest keeps for search', () => {
  const motion = {
    body: 'fixed' as const,
    joints: 6,
    path: new Array(MOTION_SAMPLES * 3).fill(0.1),
    speed: new Array(MOTION_SAMPLES).fill(1),
  };
  const searched = {
    ...storedTryOf(record(), { ...context, task: 'Touch each dot in order' }),
    instruction: 'Touch the red dot first',
    tags: ['wobbly', 'demo'],
    segments: [
      { id: 'reach', label: 'reach red dot', start: 0, end: 1.5, tags: ['slow'], outcome: 'failed' as const },
      { id: 'touch', label: 'touch', start: 1.5, end: 2 },
    ],
    motion,
  };

  it('keeps the Case brief, instruction, tags, segments and motion', () => {
    expect(searched.task).toBe('Touch each dot in order');
    expect(readStoredTry(JSON.parse(JSON.stringify(searched)))).toEqual(searched);
    expect(storedTryOf(record(), context)).not.toHaveProperty('task');
  });

  it('refuses search fields of the wrong shape or size', () => {
    for (const bad of [
      { tags: ['x'.repeat(65)] },
      { tags: new Array(65).fill('t') },
      { instruction: 7 },
      { task: 'x'.repeat(5000) },
      { segments: [{ id: '../x', label: 'reach', start: 0, end: 1 }] },
      { segments: [{ id: 'a', label: 'reach', start: 2, end: 1 }] },
      { segments: [{ id: 'a', label: 'reach', start: 0, end: 1, outcome: 'won' }] },
      { segments: new Array(513).fill({ id: 'a', label: 'reach', start: 0, end: 1 }) },
      { motion: { ...motion, path: motion.path.slice(1) } },
      { motion: { ...motion, speed: [...motion.speed.slice(1), Number.NaN] } },
      { motion: { ...motion, body: 'floating' } },
    ])
      expect(
        readStoredTry({ ...JSON.parse(JSON.stringify(searched)), ...bad }),
        JSON.stringify(bad).slice(0, 80),
      ).toBeNull();
  });
});

describe('a try’s recording on disk', () => {
  it('round-trips as binary typed arrays', () => {
    const r = recording(300);
    const bytes = encodeRecording(r);
    const back = decodeRecording(bytes)!;

    expect(back).toEqual(r);
    expect(back.qpos).toBeInstanceOf(Float64Array);
    expect(back.jointQpos).toBeInstanceOf(Int32Array);
    expect(bytes.byteLength).toBeLessThan(r.qpos.byteLength + r.poses.byteLength + r.ctrl.byteLength + 8192);
  });

  it('keeps typed arrays inside the controller', () => {
    const r = {
      ...recording(2),
      controller: { kind: 'hold', weights: Float32Array.from([1, 2]) },
    } as unknown as Recording;
    const back = decodeRecording(encodeRecording(r)) as unknown as { controller: { weights: Float32Array } };

    expect(back.controller.weights).toEqual(Float32Array.from([1, 2]));
  });

  it('refuses a file that is cut short, lies about its sizes or isn’t one', () => {
    const bytes = encodeRecording(recording(50));
    const header = new DataView(bytes.buffer).getUint32(8, true);
    const lying = bytes.slice();
    const text = new TextDecoder().decode(lying.subarray(12, 12 + header)).replace('"frames":50', '"frames":90');

    lying.set(new TextEncoder().encode(text), 12);

    expect(decodeRecording(bytes.subarray(0, bytes.byteLength - 64))).toBeNull();
    expect(decodeRecording(lying)).toBeNull();
    expect(decodeRecording(new Uint8Array(4))).toBeNull();
    expect(decodeRecording(new TextEncoder().encode('{"frames":1}'))).toBeNull();
  });
});

describe('deleting a try', () => {
  it('takes the tries generated from it along', () => {
    const source = record();
    const tries = [
      source,
      record({ id: 'try-abc-1', generated: true, manifest: { ...source.manifest, source: 'try-abc' } }),
      record({ id: 'try-other' }),
      record({ id: 'try-other-1', generated: true, manifest: { ...source.manifest, source: 'try-other' } }),
    ];
    const goes = goingWith([source.id]);

    expect(tries.filter((t) => goes(t.id, sourceTryOf(t))).map((t) => t.id)).toEqual(['try-abc', 'try-abc-1']);
  });
});
