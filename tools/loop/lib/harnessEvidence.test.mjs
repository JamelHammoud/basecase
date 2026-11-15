import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveCandidates, candidateKey, chooseCandidate, indexedCandidates } from './harnessEvidence.mjs';

const candidate = { source: 'review', ref: '#525', text: 'The agent leaves a screw head sunk' };

describe('nightly experiment candidates', () => {
  it('selects deterministically and skips any recorded candidate including rejected proposals', () => {
    const other = { ...candidate, ref: '#713' };
    const options = { candidates: [candidate, other], journal: [], experiments: [] };
    const selected = chooseCandidate(options);

    expect(chooseCandidate({ ...options, candidates: [other, candidate] })).toEqual(selected);
    expect(chooseCandidate({ ...options, journal: [{ candidate: selected.key, verdict: 'rejected' }] }).key).not.toBe(
      selected.key,
    );
    expect(
      chooseCandidate({
        candidates: [candidate],
        journal: [],
        experiments: [{ tags: [`candidate:${candidateKey(candidate)}`] }],
      }),
    ).toBeNull();
  });

  it('collects failed measurements from both the home archive and the durable nightly archive', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-harness-sources-'));
    const roots = ['home-runs', 'nightly-runs'].map((name) => path.join(dir, name));

    try {
      for (const [i, root] of roots.entries()) {
        fs.mkdirSync(root);
        fs.writeFileSync(
          path.join(root, 'index.jsonl'),
          JSON.stringify({
            at: '2026-11-13',
            run: `archive-${i}`,
            task: 'A1',
            grade: 'fail',
            kind: 'micro',
            servedBy: 'claude-opus-5-5',
          }) + '\n',
        );
      }

      expect(archiveCandidates(roots, '2026-11-07').map((entry) => entry.ref)).toEqual([
        'archive-0/A1',
        'archive-1/A1',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses only this week’s failed tune runs and never held-out failures for proposals', () => {
    const entries = [
      { at: '2026-11-13', run: 'recent', task: 'A1', grade: 'fail', kind: 'micro', servedBy: 'claude-opus-5-5' },
      { at: '2026-11-13', run: 'refused', task: 'A5', grade: 'fail', kind: 'micro', servedBy: null },
      { at: '2026-11-13', run: 'heldout', task: 'A2', grade: 'fail', heldOut: true },
      { at: '2026-11-13', run: 'pass', task: 'A3', grade: 'pass', score: null },
      { at: '2026-10-01', run: 'old', task: 'A4', grade: 'fail' },
    ];

    expect(indexedCandidates(entries, '2026-11-07').map((entry) => entry.ref)).toEqual(['recent/A1']);
  });
});
