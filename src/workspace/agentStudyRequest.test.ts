import { describe, expect, it, vi } from 'vitest';
import type { Case } from '../cases/schema';
import type { StudyKnob, StudyRow } from '../study/types';
import { DEFAULT_PROJECT } from '../types/robotics';
import { studyRequest } from './agentStudyRequest';
import type { Cases } from './useCases';
import type { StudyResult } from './useStudy';

const kase = { id: 'touch', name: 'Touch the Dots' } as Case;
const knobs: StudyKnob[] = [{ id: 'power', kind: 'voltage', values: [7.4, 12] }];
const baseline: StudyRow = {
  key: 'current',
  sceneKey: 'base',
  selection: [-1],
  label: 'current design',
  checks: [],
  costUsd: 50,
  massG: 100,
  metrics: { massG: 100, torque: 'pass' },
};
const row: StudyRow = {
  ...baseline,
  key: 'volts12',
  selection: [1],
  label: '12 V',
  costUsd: 45,
  metrics: { massG: 90, torque: 'pass' },
};

function context(result: StudyResult | string) {
  const run = vi.fn(async () => result);

  return {
    cases: { cases: [kase], active: kase } as unknown as Cases,
    setAction: vi.fn(),
    study: { run },
  };
}

function result(): StudyResult {
  return {
    base: { parts: [], project: DEFAULT_PROJECT },
    baseKey: 'base',
    knobs,
    current: baseline,
    rows: [row],
    seed: 7,
    total: 2,
  };
}

describe('study_design request', () => {
  it('forwards combined knobs, bounds and the named Case to the shared study runner', async () => {
    const ctx = context(result());
    const reply = await studyRequest({ case: 'Touch the Dots', knobs, cap: 12, seed: 7 }, ctx);

    expect(ctx.study.run).toHaveBeenCalledWith({ kase, knobs, limit: 12, seed: 7 });
    expect(reply).toMatchObject({ ok: true, case: kase.name, seed: 7, knobs, rows: [row] });
    expect(reply).toHaveProperty('text', expect.stringContaining('Servo torque'));
    expect(reply).toHaveProperty('designs', expect.arrayContaining([expect.objectContaining({ cost_usd: 45 })]));
  });

  it('maps the previous sweep payload into one knob without running an open Case', async () => {
    const ctx = context(result());

    await studyRequest({ parameter: 'battery_offset', offsets_mm: [[10, 20, 30]] }, ctx);

    expect(ctx.study.run).toHaveBeenCalledWith({
      kase: null,
      knobs: [{ id: 'battery-offset', kind: 'battery_offset', values: [[10, 30, -20]] }],
      limit: undefined,
      seed: undefined,
    });
  });

  it('uses the open Case for discovery and refuses unknown Cases before starting', async () => {
    const ctx = context('No usable knobs.');

    expect(await studyRequest({}, ctx)).toEqual({ ok: false, problem: 'No usable knobs.' });
    expect(ctx.study.run).toHaveBeenCalledWith({ kase, knobs: undefined, limit: undefined, seed: undefined });
    expect(await studyRequest({ case: 'Missing' }, ctx)).toEqual({
      ok: false,
      problem: 'This scene has no Case named Missing.',
    });
    expect(ctx.study.run).toHaveBeenCalledTimes(1);
  });
  it('refuses malformed direct payloads before invoking the runner', async () => {
    const ctx = context(result());

    expect(await studyRequest({ knobs: [{ id: 'bad', kind: 'voltage', values: [Infinity] }] }, ctx)).toMatchObject({
      ok: false,
    });
    expect(await studyRequest({ parameter: 'battery_offset', offsets_mm: [[1, 2]] }, ctx)).toMatchObject({ ok: false });
    expect(await studyRequest({ cap: 65 }, ctx)).toMatchObject({ ok: false });
    expect(await studyRequest({ seed: -1 }, ctx)).toMatchObject({ ok: false });
    expect(ctx.study.run).not.toHaveBeenCalled();
  });

  it('converts explicit battery offsets from the agent frame once', async () => {
    const ctx = context(result());

    await studyRequest({ knobs: [{ id: 'battery', kind: 'battery_offset', values: [[10, 20, 30]] }] }, ctx);

    expect(ctx.study.run).toHaveBeenCalledWith(
      expect.objectContaining({
        kase: null,
        knobs: [{ id: 'battery', kind: 'battery_offset', values: [[10, 30, -20]] }],
      }),
    );
  });
});
