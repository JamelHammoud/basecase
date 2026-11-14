import { describe, expect, it } from 'vitest';
import { leadPrompt } from '../lanes/lead.mjs';
import {
  conflictsByFile,
  conflictsSection,
  recordConflict,
  TOP_CONFLICTS,
  topConflictsSection,
  weekConflicts,
} from './conflicts.mjs';
import { digestBody, weekStats } from './stats.mjs';

const FROM = '2026-11-06T00:00:00Z';
const TO = '2026-11-13T00:00:00Z';
const API = 'src/workspace/devStudioApi.ts';
const HOOK = 'src/workspace/useDevStudioHook.ts';
const CASES = 'docs/guide/cases.md';

function memoryLog() {
  const entries = new Map();
  const get = (key) => ({ resolutions: [], ...structuredClone(entries.get(String(key)) ?? {}) });

  return {
    get,
    all: () => [...entries.entries()].map(([key, entry]) => ({ ...entry, key })),
    update: (key, change) => {
      const next = { ...get(key), ...change(get(key)) };

      entries.set(String(key), next);

      return next;
    },
  };
}

function seeded() {
  const log = memoryLog();

  recordConflict(log, { pull: 412, files: [API, HOOK, API], at: '2026-11-07T10:00:00.250Z' });
  recordConflict(log, { pull: 412, files: [API], at: '2026-11-08T10:00:00Z' });
  recordConflict(log, { pull: 433, files: [HOOK, CASES], at: '2026-11-12T23:59:59Z' });
  recordConflict(log, { pull: 401, files: [CASES], at: '2026-11-01T00:00:00Z' });

  return log;
}

describe('recordConflict', () => {
  it('keeps each resolution of a pull request with its files, once each and sorted', () => {
    const log = seeded();

    expect(log.get(412).resolutions).toEqual([
      { at: '2026-11-07T10:00:00.250Z', files: [API, HOOK] },
      { at: '2026-11-08T10:00:00Z', files: [API] },
    ]);
  });

  it('records nothing for a merge with no conflicted files', () => {
    const log = memoryLog();

    expect(recordConflict(log, { pull: 9, files: [] })).toBeNull();
    expect(log.all()).toEqual([]);
  });
});

describe('conflictsByFile', () => {
  it("counts the week's conflicts per file with their pull requests, most first", () => {
    expect(conflictsByFile(seeded().all(), { from: FROM, to: TO })).toEqual([
      { file: HOOK, count: 2, pulls: [412, 433] },
      { file: API, count: 2, pulls: [412] },
      { file: CASES, count: 1, pulls: [433] },
    ]);
  });

  it('counts each week on its own', () => {
    expect(conflictsByFile(seeded().all(), { from: '2026-10-30T00:00:00Z', to: FROM })).toEqual([
      { file: CASES, count: 1, pulls: [401] },
    ]);
  });

  it('reads the last seven days from the log', () => {
    expect(weekConflicts(Date.parse(TO), seeded())[0]).toEqual({ file: HOOK, count: 2, pulls: [412, 433] });
  });
});

describe('the digest', () => {
  const base = { pulls: [], comments: [], commits: [], runs: [], openSteps: 0, owner: 'me', from: FROM, to: TO };

  it('ranks the conflicted files, one line each with the count and pull requests', () => {
    const conflicts = conflictsByFile(seeded().all(), { from: FROM, to: TO });
    const body = digestBody(weekStats({ ...base, conflicts }));

    expect(body).toContain(
      [
        'Conflicts the rebase lane met, by file:',
        '',
        `- \`${HOOK}\`: 2, in #412, #433`,
        `- \`${API}\`: 2, in #412`,
        `- \`${CASES}\`: 1, in #433`,
      ].join('\n'),
    );
  });

  it('says when there were none', () => {
    expect(digestBody(weekStats(base))).toContain('The rebase lane met no conflicts.');
    expect(conflictsSection([])).toBe('The rebase lane met no conflicts.');
  });
});

describe('the lead prompt', () => {
  const world = { comments: [], requests: [], tracked: [], arcs: [], ideas: [], steps: [] };
  const ranked = Array.from({ length: 7 }, (_, i) => ({ file: `src/file${i}.ts`, count: 7 - i, pulls: [100 + i] }));

  it("carries the week's top five conflicted files", () => {
    const text = leadPrompt(world, { merged: '', copyLine: '', worst: null, conflicts: ranked });

    expect(text).toContain("## Where this week's conflicts landed");
    expect(text).toContain('- `src/file0.ts`: 7, in #100');
    expect(text).toContain(`- \`src/file${TOP_CONFLICTS - 1}.ts\``);
    expect(text).not.toContain(`src/file${TOP_CONFLICTS}.ts`);
  });

  it('leaves the section out in a week without conflicts', () => {
    expect(topConflictsSection([])).toEqual([]);
    expect(leadPrompt(world, { merged: '', copyLine: '', worst: null })).not.toContain('conflicts landed');
  });
});
