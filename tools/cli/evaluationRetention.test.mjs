import { expect, it, vi } from 'vitest';
import { LIMITS } from './evaluationFiles.mjs';
import { retainFailure } from './evaluationRun.mjs';

it.each(['snapshot', 'archive'])(
  'bounds reconstruction attempts when every %s exceeds retention limits',
  async (limit) => {
    const source = {
      scene: new Uint8Array(limit === 'snapshot' ? 8 * 1024 * 1024 + 1 : 0),
      meshes: {},
      model: { xml: '' },
    };
    const replay = vi.fn(async () => source);
    const archive = vi.fn(() => new Uint8Array(LIMITS.recordingBytes + 1));
    const modules = {
      'src/cases/evaluation.ts': { evaluationRecording: archive },
      'src/cases/evaluationReplay.ts': { evaluationReplay: replay, readEvaluationReplay: () => true },
      'src/cases/recordingValues.ts': { keepTyped: undefined },
    };
    const context = {
      load: async (file) => modules[file],
      declaration: { id: 'evaluation' },
      revisions: { baseline: { scene: {}, meshes: {} } },
      name: 'baseline',
      kase: { id: 'case' },
      retained: { attempts: 0, bytes: 0 },
    };

    for (let seed = 0; seed < LIMITS.recordings + 2; seed++) {
      const trial = { passed: false, revision: 'revision' };

      await retainFailure({ model: source.model }, trial, { ...context, seed });
      expect(trial.recordingStatus).toBe('limit');
      expect(trial.recording).toBeUndefined();
    }

    expect(replay).toHaveBeenCalledTimes(LIMITS.recordings);
    expect(archive).toHaveBeenCalledTimes(limit === 'archive' ? LIMITS.recordings : 0);
    expect(context.retained.attempts).toBe(LIMITS.recordings);
    expect(context.retained.bytes).toBe(0);
  },
);
