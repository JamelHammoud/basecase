import { expect, it } from 'vitest';
import { armCache } from './arms.mjs';
import { resolveModel, runModelProblem } from './models.mjs';

it('verifies concrete Codex models and refuses a different answering model', () => {
  const resolved = resolveModel('gpt-6.1-sol', [{ id: 'gpt-6.1-sol', name: 'GPT 6.1 Sol' }]);

  expect(runModelProblem({ servedBy: 'gpt-6.1-sol' }, resolved)).toBeNull();
  expect(runModelProblem({ servedBy: 'claude-opus-5-5' }, resolved)).toContain('but');
  expect(runModelProblem({ servedBy: null }, resolved)).toContain('No answering model');
});

it('separates baseline evidence by provider and refuses legacy unattributed Codex rows', () => {
  const arm = { cache: true, harness: 'h', model: 'gpt-6.1-sol', provider: 'codex' };
  const row = {
    kind: 'micro',
    harness: 'h',
    effort: 'medium',
    servedBy: arm.model,
    grade: 'pass',
    task: 'A1',
    at: '2026-11-15',
  };
  const rows = [row, { ...row, provider: 'claude' }, { ...row, provider: 'codex' }];
  const cached = armCache(rows, arm, { effort: 'medium', useCache: true });

  expect(cached.get('A1')).toEqual([rows[2]]);
});

it('rejects a secondary responding model even when the main model matches', () => {
  const model = resolveModel('gpt-6.1-sol', [{ id: 'gpt-6.1-sol' }]);

  expect(runModelProblem({ servedBy: 'gpt-6.1-sol', served: [{ model: 'claude-opus-5-5' }] }, model)).toContain('but');
});
