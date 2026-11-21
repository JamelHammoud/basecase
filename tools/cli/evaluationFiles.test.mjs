import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkedDeclaration, checkedFiles, digest, identity, json, readFile, writeFiles } from './evaluationFiles.mjs';
import { inspectReport, reportHtml } from './evaluationReport.mjs';

const dirs = [];
const temporary = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluation-files-'));

  dirs.push(dir);

  return dir;
};
const declaration = (changes = {}) => {
  const body = {
    format: 'basecase-evaluation',
    version: 1,
    cases: [{ task: { seconds: 2 } }],
    seeds: [5, 2],
    conditions: 'fixed',
    randomization: { friction: [1, 1], mass: [1, 1], strength: [1, 1], latencyMs: [0, 0] },
    jointNoiseDeg: 0,
    fixedCase: true,
    revisions: { baseline: { controller: { kind: 'reference' } }, candidate: { controller: { kind: 'reference' } } },
    ...changes,
  };

  return { ...body, id: identity(body) };
};

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

it('bounds declared physics and preserves explicit seed order', () => {
  expect(checkedDeclaration(declaration()).seeds).toEqual([5, 2]);

  for (const seeds of [[], [2, 2], [-1], [0x100000000], [1.5], Array.from({ length: 33 }, (_, i) => i)])
    expect(() => checkedDeclaration(declaration({ seeds }))).toThrow();

  expect(() => checkedDeclaration(declaration({ cases: [{ task: { seconds: 31 } }] }))).toThrow();
  expect(() =>
    checkedDeclaration(
      declaration({ cases: [{ task: { seconds: 27.2727 } }], seeds: Array.from({ length: 11 }, (_, i) => i) }),
    ),
  ).toThrow();
  expect(() =>
    checkedDeclaration(
      declaration({ cases: [{ task: { seconds: 30 } }], seeds: Array.from({ length: 11 }, (_, i) => i) }),
    ),
  ).toThrow();
  expect(() => checkedDeclaration({ ...declaration(), conditions: 'randomized' })).toThrow();
});

it('refuses corrupt, missing, escaped and symbolic-linked files before reuse', () => {
  const root = temporary();
  const outside = temporary();

  fs.writeFileSync(path.join(root, 'asset'), 'geometry');
  fs.writeFileSync(path.join(outside, 'secret'), 'outside');
  fs.symlinkSync(outside, path.join(root, 'link'), 'junction');
  expect(checkedFiles(root, { asset: digest('geometry') }).asset.toString()).toBe('geometry');
  expect(() => checkedFiles(root, { asset: digest('altered') })).toThrow('differs');
  expect(() => checkedFiles(root, { missing: digest('geometry') })).toThrow();

  for (const file of ['../secret', '/secret', 'link/secret', 'https://example.com/mesh', 'link\\secret', './asset'])
    expect(() => readFile(root, file)).toThrow();
});

it('keeps interrupted reports incomplete and readable without physics and verifies all retained bytes', () => {
  const dir = path.join(temporary(), 'report');
  const bytes = Buffer.from('retained input');
  const frozen = declaration({ files: { scene: digest(bytes) } });
  const report = {
    format: 'basecase-comparison',
    version: 1,
    status: 'incomplete',
    reason: 'Execution has not finished.',
    baseline: identity(frozen.revisions.baseline),
    candidate: identity(frozen.revisions.candidate),
    evaluation: frozen.id,
    regressions: 0,
    improvements: 0,
    pairs: [],
    files: { 'inputs/scene': digest(bytes), 'inputs/evaluation.json': digest(json(frozen)) },
  };
  const sealed = { ...report, id: identity(report) };

  writeFiles(dir, {
    'inputs/scene': bytes,
    'inputs/evaluation.json': json(frozen),
    'comparison.json': json(sealed),
    'report.html': Buffer.from(reportHtml(sealed)),
  });
  expect(inspectReport(dir).status).toBe('incomplete');
  expect(readFile(dir, 'report.html').toString()).toContain('incomplete');
  expect(readFile(dir, 'report.html').toString()).not.toContain('<script');

  const forged = { ...report, status: 'complete' };
  const forgedReport = { ...forged, id: identity(forged) };

  fs.writeFileSync(path.join(dir, 'comparison.json'), json(forgedReport));
  fs.writeFileSync(path.join(dir, 'report.html'), reportHtml(forgedReport));
  expect(() => inspectReport(dir)).toThrow('differs');
  fs.writeFileSync(path.join(dir, 'comparison.json'), json(sealed));
  fs.writeFileSync(path.join(dir, 'report.html'), reportHtml(sealed));
  fs.writeFileSync(path.join(dir, 'inputs', 'scene'), 'corrupt');
  expect(() => inspectReport(dir)).toThrow('differs');
});

it('escapes scene-controlled HTML text', () => {
  const html = reportHtml({ status: 'incomplete', reason: '<img src=x>', pairs: [], regressions: 0, improvements: 0 });

  expect(html).toContain('&lt;img src=x&gt;');
  expect(html).not.toContain('<img');
});
