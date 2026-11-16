import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { specToPart } from '../../../src/agent/agentScene';
import { boltedPair } from '../../../bench/micro/bolted.mjs';
import { FAULTS } from '../../../bench/micro/faults.mjs';
import { recordFromFixture } from '../../../bench/micro/materialize.mjs';
import { ALL_TASKS } from '../../../bench/micro/tasks/index.mjs';
import { WASTE_LIMITS } from './harnessArchiveWaste.mjs';
import { archiveCandidates, chooseCandidate } from './harnessEvidence.mjs';

const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/harness-waste.json', import.meta.url), 'utf8'));

function archive(root, task, rows, extra = {}) {
  const entry = {
    at: '2026-11-15',
    run: 'replay',
    task,
    kind: 'micro',
    servedBy: 'gpt-6.1-sol',
    heldOut: false,
    seed: 1,
    grade: 'pass',
    tokens: { total: 200 },
    ...extra,
  };
  const dir = path.join(root, 'replay', 'micro', task, 'seed-1');
  let t = 0;
  const records = rows.flatMap(([toolName, rawInput, rawOutput, status, duration], i) => {
    const start = {
      t,
      type: 'acp-session-update',
      update: { sessionUpdate: 'tool_call', toolCallId: `${i}`, toolName, rawInput },
    };

    t += duration;

    return [
      start,
      {
        t,
        type: 'acp-session-update',
        update: { sessionUpdate: 'tool_call_update', toolCallId: `${i}`, status, rawOutput },
      },
    ];
  });

  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(root, 'index.jsonl'), JSON.stringify(entry) + '\n');
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(entry));
  fs.writeFileSync(path.join(dir, 'events.jsonl'), records.map((row) => JSON.stringify(row)).join('\n'));
}

it('ranks measured tune waste, deduplicates archives and excludes held-out content before replay', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-replay-'));

  try {
    archive(root, 'A1', fixtures.reads);
    archive(root, 'S1', fixtures.checks);
    archive(root, 'held-secret', fixtures.reads, { heldOut: true, critique: ['secret'] });

    const candidates = archiveCandidates([root, root], '2026-11-07');
    const selected = chooseCandidate({ candidates, journal: [], experiments: [] });

    expect(candidates).toHaveLength(2);
    expect(selected).toMatchObject({
      kind: 'repeated-read',
      measured: { frequency: 2, milliseconds: 70, supportingTokens: 200 },
    });
    expect(JSON.stringify(candidates)).not.toContain('secret');
    expect(chooseCandidate({ candidates: [...candidates].reverse(), journal: [], experiments: [] })).toEqual(selected);
    expect(chooseCandidate({ candidates, journal: [{ candidate: selected.key }], experiments: [] }).kind).toBe(
      'unchanged-check',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('replays comparison arms, falls through partial duplicates and rejects oversized and held-out archives', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-boundary-'));
  const partial = path.join(root, 'partial');
  const complete = path.join(root, 'complete');

  try {
    archive(complete, 'A1', fixtures.reads, { tokens: null });
    fs.mkdirSync(partial);
    fs.copyFileSync(path.join(complete, 'index.jsonl'), path.join(partial, 'index.jsonl'));
    fs.mkdirSync(path.join(complete, 'replay', 'working-tree'));
    fs.renameSync(path.join(complete, 'replay', 'micro'), path.join(complete, 'replay', 'working-tree', 'micro'));
    archive(complete, ALL_TASKS.find((task) => task.heldOut).id, fixtures.reads, { heldOut: undefined });

    const candidates = archiveCandidates([partial, complete], '2026-11-07');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].measured).toMatchObject({ frequency: 2, missingTokens: 1, supportingTokens: 0 });

    const events = path.join(complete, 'replay', 'working-tree', 'micro', 'A1', 'seed-1', 'events.jsonl');

    fs.writeFileSync(events, ' '.repeat(WASTE_LIMITS.fileBytes + 1));
    expect(archiveCandidates([complete], '2026-11-07')).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('preserves missed-check evidence from a passing tune archive without a separate harvest', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-missed-check-'));

  try {
    archive(root, 'A1', [['get_readiness', {}, 'READY TO BUILD. No blockers.', 'completed', 10]]);

    const dir = path.join(root, 'replay', 'micro', 'A1', 'seed-1');
    const scene = await recordFromFixture(FAULTS.shortScrew(boltedPair({ layout: 'visor' })), specToPart);
    const events = fs
      .readFileSync(path.join(dir, 'events.jsonl'), 'utf8')
      .split('\n')
      .map((row) => JSON.parse(row));

    events[0].update.title = 'mcp__robotics_cad__get_readiness';
    events[1].update.content = [{ type: 'text', text: 'READY TO BUILD. No blockers.' }];
    fs.writeFileSync(path.join(dir, 'events.jsonl'), events.map((row) => JSON.stringify(row)).join('\n'));
    fs.writeFileSync(path.join(dir, 'scene.json'), JSON.stringify(scene));

    const candidates = archiveCandidates([root], '2026-11-07');

    expect(candidates).toContainEqual(
      expect.objectContaining({ source: 'run', kind: 'short', graded: true, ids: ['visor-1'] }),
    );
    expect(candidates[0].ref).toContain('replay/micro/A1/seed-1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
