import { describe, expect, it, vi } from 'vitest';
import { analyzeBodyEvidence, bodyAnalysisCurrent } from './bodyAnalysisAction';
import type { BodyAnalysisOutcome, BodyAnalysisRequest, BodyAnalysisResult } from '../reality/bodyAnalysisTypes';
import type { BodyEvidenceRef } from '../reality/bodyEvidence';

const reference = { recording: 'arm-run', unit: 'arm-a' } as BodyEvidenceRef;
const request = { source: { recording: 'arm-run', unit: 'arm-a' } } as BodyAnalysisRequest;
const outcome = { kind: 'analyzed', source: request.source } as BodyAnalysisResult;

function harness() {
  const initial = { generation: 0, unit: 'arm-a', parts: {}, project: {} };
  const current = { ...initial };
  let finish: () => void = () => undefined;
  const pending = new Promise<BodyAnalysisOutcome>((resolve) => {
    finish = () => resolve(outcome);
  });
  const retain = vi.fn();
  const ports = {
    read: vi.fn(async () => ({ request, sourceKey: 'source-a', calibration: {} })),
    remember: vi.fn(async () => reference),
    unchanged: vi.fn(async () => true),
  };
  const analyzed = vi.fn(() => pending);
  const action = { reference, analyze: analyzed, current: () => bodyAnalysisCurrent(initial, current), retain };

  return {
    action,
    ports,
    finish: () => finish(),
    invalidate: (cause: string) => {
      if (cause === 'unit selection') {
        current.unit = 'arm-b';

        return;
      }

      if (cause === 'calibration edit') {
        current.project = {};

        return;
      }

      if (cause === 'source edit') {
        current.parts = {};

        return;
      }

      current.generation++;
    },
    retain,
  };
}

describe('read-only retained body analysis action', () => {
  it('stores the worker result with its original inputs after validating the source', async () => {
    const h = harness();
    const promise = analyzeBodyEvidence(h.action, h.ports);

    h.finish();
    expect(await promise).toEqual(outcome);
    expect(h.action.analyze).toHaveBeenCalledWith(request);
    expect(h.ports.remember).toHaveBeenCalledWith({ request, sourceKey: 'source-a', calibration: {}, result: outcome });
    expect(h.retain).toHaveBeenCalledWith(reference);
  });

  it.each(['source edit', 'calibration edit', 'unit selection', 'try selection', 'cancellation'])(
    'rejects a pending result after %s',
    async (cause) => {
      const h = harness();
      const promise = analyzeBodyEvidence(h.action, h.ports);

      await h.ports.read.mock.results[0].value;
      await Promise.resolve();
      h.invalidate(cause);
      h.finish();
      expect(await promise).toBeNull();
      expect(h.action.analyze).toHaveBeenCalledOnce();
      expect(h.ports.remember).not.toHaveBeenCalled();
      expect(h.retain).not.toHaveBeenCalled();
    },
  );

  it('refuses a missing retained model before starting physics', async () => {
    const h = harness();
    const ports = { ...h.ports, read: vi.fn(async () => null) };

    expect(await analyzeBodyEvidence(h.action, ports)).toEqual({ kind: 'refused', reason: 'provenance', replays: 0 });
    expect(h.action.analyze).not.toHaveBeenCalled();
    expect(h.ports.remember).not.toHaveBeenCalled();
  });

  it('refuses a changed source recording before replay and preserves historical evidence', async () => {
    const h = harness();

    h.ports.unchanged.mockResolvedValue(false);
    expect(await analyzeBodyEvidence(h.action, h.ports)).toBeNull();
    expect(h.action.analyze).not.toHaveBeenCalled();
    expect(h.retain).not.toHaveBeenCalled();
  });
});
