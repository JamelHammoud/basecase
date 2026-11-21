import { describe, expect, it, vi } from 'vitest';
import { recommendBodyEvidence } from './bodyMotionAction';
import type { BodyEvidenceRef, BodyEvidenceSnapshot } from '../reality/bodyEvidence';
import type { BodyMotionOutcome } from '../reality/bodyMotionTypes';

const reference = { content: 'old', unit: 'arm-a', scene: 'arm-scene' } as BodyEvidenceRef;
const saved = {
  request: { source: { unit: 'arm-a' } },
  sourceKey: 'physical-source',
  calibration: { active: 2 },
  result: { kind: 'analyzed' },
} as BodyEvidenceSnapshot;
const outcome = { kind: 'no-improvement', selected: [0] } as BodyMotionOutcome;

function setup() {
  let current = true;
  let complete = (_: BodyMotionOutcome) => {};
  const pending = new Promise<BodyMotionOutcome>((resolve) => {
    complete = resolve;
  });
  const ports = {
    read: vi.fn(async () => saved),
    remember: vi.fn(async () => ({ ...reference, content: 'new' })),
    unchanged: vi.fn(async () => true),
  };
  const action = {
    reference,
    selected: [0],
    recommend: vi.fn(() => pending),
    current: () => current,
    retain: vi.fn(),
  };

  return {
    ports,
    action,
    finish: () => complete(outcome),
    invalidate: () => {
      current = false;
    },
  };
}

describe('retained next-motion action', () => {
  it('uses exact historical inputs and publishes only after successful retention', async () => {
    const h = setup();
    const before = structuredClone(saved);
    const pending = recommendBodyEvidence(h.action, h.ports);

    h.finish();
    expect(await pending).toEqual(outcome);
    expect(h.action.recommend).toHaveBeenCalledWith({ request: saved.request, result: saved.result, selected: [0] });
    expect(h.ports.remember).toHaveBeenCalledWith({ ...saved, motion: outcome });
    expect(h.action.retain).toHaveBeenCalledWith({ ...reference, content: 'new' });
    expect(saved).toEqual(before);
  });

  it.each(['unit switch', 'scene switch', 'source edit', 'calibration edit', 'cancellation'])(
    'rejects publication after %s',
    async () => {
      const h = setup();
      const pending = recommendBodyEvidence(h.action, h.ports);

      await vi.waitFor(() => expect(h.action.recommend).toHaveBeenCalledOnce());
      h.invalidate();
      h.finish();
      expect(await pending).toBeNull();
      expect(h.ports.remember).not.toHaveBeenCalled();
      expect(h.action.retain).not.toHaveBeenCalled();
    },
  );

  it('keeps the prior reference when storage refuses a recommendation', async () => {
    const h = setup();

    h.ports.remember.mockRejectedValue(new Error('Storage unavailable'));

    const pending = recommendBodyEvidence(h.action, h.ports);

    h.finish();
    await expect(pending).rejects.toThrow('Storage unavailable');
    expect(h.action.retain).not.toHaveBeenCalled();
  });

  it('refuses changed recordings before submitting a job', async () => {
    const h = setup();

    h.ports.unchanged.mockResolvedValue(false);
    expect(await recommendBodyEvidence(h.action, h.ports)).toBeNull();
    expect(h.action.recommend).not.toHaveBeenCalled();
  });
});
