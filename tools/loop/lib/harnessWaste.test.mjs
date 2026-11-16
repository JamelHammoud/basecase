import fs from 'node:fs';
import { expect, it } from 'vitest';
import { wastePatterns } from './harnessWaste.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/harness-waste.json', import.meta.url), 'utf8'));

function replay(rows) {
  let t = 0;

  return rows.flatMap(([toolName, rawInput, rawOutput, status, duration], i) => {
    const call = {
      t,
      type: 'acp-session-update',
      update: { sessionUpdate: 'tool_call', toolCallId: `${i}`, toolName, rawInput },
    };

    t += duration;

    return [
      call,
      {
        t,
        type: 'acp-session-update',
        update: { sessionUpdate: 'tool_call_update', toolCallId: `${i}`, rawOutput, status },
      },
    ];
  });
}

it('replays repeated reads, checks across mutations and unsuccessful sequences without exposing content', () => {
  expect(wastePatterns(replay(fixture.reads))).toEqual([
    { kind: 'repeated-read', tools: ['get_scene'], frequency: 2, milliseconds: 70, missingDurations: 0 },
  ]);
  expect(wastePatterns(replay(fixture.checks))).toEqual([
    { kind: 'unchanged-check', tools: ['check_scene'], frequency: 1, milliseconds: 70, missingDurations: 0 },
  ]);
  expect(wastePatterns(replay(fixture.failures))).toEqual([
    {
      kind: 'unsuccessful-sequence',
      tools: ['model_part', 'update_parts'],
      frequency: 1,
      milliseconds: 55,
      missingDurations: 0,
    },
  ]);
  expect(JSON.stringify(wastePatterns(replay(fixture.failures)))).not.toContain('bad');
});

it('does not count changed replies, incomplete calls or unmeasured durations as zero-cost evidence', () => {
  const records = replay(fixture.reads.slice(0, 2));

  delete records.at(-1).t;
  expect(wastePatterns(records)[0]).toMatchObject({ milliseconds: 0, missingDurations: 1 });
  records.at(-1).update.rawOutput = 'different';
  expect(wastePatterns(records)).toEqual([]);
});

it.each(['wrapped', 'dotted', 'claude'])('recognizes %s provider records and requires actual replies', (shape) => {
  const records = replay(fixture.reads);

  for (const { update } of records.filter((record) => record.update.sessionUpdate === 'tool_call')) {
    delete update.toolName;

    if (shape === 'wrapped') update.rawInput = { server: 'robotics_cad', tool: 'get_scene', arguments: {} };

    if (shape === 'dotted') update.title = 'mcp.robotics_cad.get_scene';

    if (shape === 'claude') update._meta = { claudeCode: { toolName: 'mcp__robotics_cad__get_scene' } };
  }

  expect(wastePatterns(records)[0]).toMatchObject({ frequency: 2, milliseconds: 70 });

  for (const { update } of records) delete update.rawOutput;

  expect(wastePatterns(records)).toEqual([]);
});
