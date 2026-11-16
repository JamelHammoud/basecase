import { readDiagnosticArchive } from './diagnosticArtifacts.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'three/addons/libs/fflate.module.js';
import { collectDiagnostic, compareDiagnostic, submitDiagnostic } from './diagnostics.mjs';
import { diagnosticEnvironment, diagnosticSelection } from './diagnosticContract.mjs';

const dirs = [];
const sha = 'a'.repeat(40);
const selection = {
  revision: sha,
  platform: 'windows',
  file: 'e2e/gallery.e2e.test.ts',
  test: 'opens a scene',
  runs: 10,
  workers: 1,
};

afterEach(() => dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

function world(overrides = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostic-'));
  const calls = [];
  const manifest = {
    version: 1,
    selection,
    revision: sha,
    workflowRevision: sha,
    workload: { retries: 0 },
    environment: { platform: 'win32' },
    results: Array.from({ length: 10 }, () => ({ selected: 1, status: 'passed' })),
  };
  const measurements = Array.from({ length: 10 }, (_, index) => [
    [`run-${index + 1}.json`, strToU8('{}')],
    [`run-${index + 1}.log`, strToU8('test output')],
  ]).flat();
  const archive = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...Object.fromEntries(measurements) });
  const api = (endpoint, body) => {
    calls.push({ endpoint, body });

    if (endpoint.endsWith(`/commits/${sha}`)) return { sha };

    if (endpoint.includes('/contents/')) return { type: 'file' };

    if (endpoint.endsWith('/commits/main')) return { sha };

    if (endpoint.endsWith('/dispatches'))
      return { workflow_run_id: 42, html_url: 'https://github.com/o/r/actions/runs/42' };

    if (endpoint.endsWith('/runs/42'))
      return {
        id: 42,
        display_title: 'diagnostic-ticket',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        html_url: 'https://github.com/o/r/actions/runs/42',
      };

    if (endpoint.endsWith('/42/jobs?per_page=100'))
      return {
        jobs: [
          {
            started_at: '2026-11-15T00:00:00Z',
            completed_at: '2026-11-15T00:02:00Z',
            steps: [{ name: 'Install', conclusion: 'success' }],
          },
        ],
      };

    if (endpoint.endsWith('/42/artifacts?per_page=100'))
      return { artifacts: [{ id: 7, name: 'diagnostic-ticket', size_in_bytes: archive.length, expired: false }] };

    throw new Error(endpoint);
  };

  dirs.push(cwd);
  fs.mkdirSync(path.join(cwd, 'scratch'));
  fs.writeFileSync(
    path.join(cwd, 'scratch/task-handoff.json'),
    JSON.stringify({ task: '#1139', decisions: ['retain assertions'] }),
  );

  return { cwd, calls, api, download: () => archive, repository: 'o/r', ticket: () => 'ticket', ...overrides };
}

it('drives submit, completed Windows evidence retrieval and the same repair handoff without a new session', () => {
  const context = world();
  const request = submitDiagnostic(selection, context);
  const result = collectDiagnostic(request.ticket, context);
  const handoff = JSON.parse(fs.readFileSync(path.join(context.cwd, 'scratch/task-handoff.json')));

  expect(result.state).toBe('completed');
  expect(result.verified).toBe(true);
  expect(result.ciMinutes).toBe(2);
  expect(result.manifest.results).toHaveLength(10);
  expect(handoff.task).toBe('#1139');
  expect(handoff.decisions).toEqual(['retain assertions']);
  expect(handoff.diagnostics[0].url).toContain('/runs/42');
  expect(context.calls.find(({ body }) => body?.inputs)?.body).toEqual({
    ref: 'main',
    return_run_details: true,
    inputs: { selection: JSON.stringify({ ...selection, ticket: 'ticket' }) },
  });
  expect(fs.readFileSync(path.join(context.cwd, 'scratch/diagnostics/ticket/run-1.log'), 'utf8')).toBe('test output');
});

it('returns an unfinished run immediately and keeps its durable reference for the same context', () => {
  const context = world();
  const original = context.api;

  context.api = (endpoint, request) => {
    const response = original(endpoint, request);

    if (response?.id === 42) response.status = 'in_progress';

    return response;
  };
  submitDiagnostic(selection, context);

  expect(collectDiagnostic('ticket', context).state).toBe('in_progress');
  expect(context.calls.some(({ endpoint }) => endpoint.includes('/artifacts'))).toBe(false);
});

it('compares elapsed job minutes at the same workload revision without starting sessions', () => {
  const context = world();
  const original = context.api;

  context.api = (endpoint, request) => {
    if (endpoint.endsWith('/runs/100'))
      return {
        head_sha: sha,
        status: 'completed',
        event: 'schedule',
        path: '.github/workflows/check.yml',
        html_url: 'https://github.com/o/r/actions/runs/100',
      };

    if (endpoint.endsWith('/100/jobs?per_page=100'))
      return { jobs: [{ started_at: '2026-11-15T00:00:00Z', completed_at: '2026-11-15T00:20:00Z' }] };

    return original(endpoint, request);
  };
  submitDiagnostic(selection, context);

  const result = collectDiagnostic('ticket', context);

  expect(compareDiagnostic(result, 100, context)).toMatchObject({
    fullCheckMinutes: 20,
    diagnosticMinutes: 2,
    additionalSessionStarts: 0,
  });
});

it('refuses oversized hosted artifacts before downloading and retains the failed retrieval reference', () => {
  const context = world();
  const original = context.api;

  context.api = (endpoint, request) => {
    const response = original(endpoint, request);

    if (response?.artifacts) response.artifacts[0].size_in_bytes = 21 * 1024 * 1024;

    return response;
  };
  context.download = () => {
    throw new Error('must not download');
  };
  submitDiagnostic(selection, context);

  expect(collectDiagnostic('ticket', context)).toMatchObject({
    verified: false,
    runId: 42,
    error: 'Diagnostic artifact limit exceeded',
  });
});

it.each([
  { revision: 'main' },
  { platform: 'macos' },
  { file: '../secret.test.ts' },
  { file: 'e2e/none.ts' },
  { test: '' },
  { runs: 0 },
  { runs: 31 },
  { workers: 0 },
  { extra: 'secret' },
])('rejects malformed selections before dispatch: %j', (change) => {
  expect(() => diagnosticSelection({ ...selection, ...change })).toThrow();
});

it('retains failed dispatch and refuses nonexistent revisions or files', () => {
  const missing = world({
    api: () => {
      throw new Error('not found');
    },
  });

  expect(() => submitDiagnostic(selection, missing)).toThrow('not found');

  const missingFile = world();
  const readFile = missingFile.api;

  missingFile.api = (endpoint, request) => {
    if (endpoint.includes('/contents/')) throw new Error('test file not found');

    return readFile(endpoint, request);
  };

  expect(() => submitDiagnostic(selection, missingFile)).toThrow('test file not found');
  expect(missingFile.calls.some(({ endpoint }) => endpoint.endsWith('/dispatches'))).toBe(false);

  const failed = world();
  const original = failed.api;

  failed.api = (endpoint, body) => {
    if (endpoint.endsWith('/dispatches')) throw new Error('dispatch rejected');

    return original(endpoint, body);
  };

  expect(() => submitDiagnostic(selection, failed)).toThrow('dispatch rejected');
  expect(JSON.parse(fs.readFileSync(path.join(failed.cwd, 'scratch/diagnostics/ticket/request.json'))).error).toBe(
    'dispatch rejected',
  );
});

it.each(['cancelled', 'missing artifact'])('retains %s without marking the path verified', (failure) => {
  const context = world();
  const original = context.api;

  context.api = (endpoint, body) => {
    const response = original(endpoint, body);

    if (failure === 'cancelled' && response?.id === 42) response.conclusion = 'cancelled';

    if (failure === 'missing artifact' && response?.artifacts) response.artifacts = [];

    return response;
  };

  submitDiagnostic(selection, context);

  const result = collectDiagnostic('ticket', context);

  expect(result.conclusion).toBe(failure === 'cancelled' ? 'cancelled' : 'success');
  expect(result.verified).toBe(false);
  expect(result.jobs).toHaveLength(1);
});

it('bounds archive expansion and excludes credentials from the test environment', () => {
  expect(() => readDiagnosticArchive(zipSync({ '../auth.json': strToU8('secret') }))).toThrow();
  expect(() => readDiagnosticArchive(zipSync({ 'run-1.log': new Uint8Array(1024 * 1024 + 1) }))).toThrow();
  expect(() => readDiagnosticArchive(new Uint8Array(20 * 1024 * 1024 + 1))).toThrow();
  expect(
    diagnosticEnvironment({
      PATH: '/tools',
      GH_TOKEN: 'secret',
      OPENAI_API_KEY: 'secret',
      NODE_OPTIONS: '--require=secret',
      HOME: '/home/runner',
      SystemRoot: 'C:\\Windows',
    }),
  ).toEqual({
    PATH: '/tools',
    HOME: '/home/runner',
    SystemRoot: 'C:\\Windows',
    CI: 'true',
    BASECASE_QUARANTINE: 'off',
  });
});
