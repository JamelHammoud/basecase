import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { answerText, runMetrics } from './metrics.mjs';
import { appendIndex, archiveRun, indexEntry, readIndex } from './archive.mjs';
import { indexReport } from './report.mjs';
import { messageAt, stepsFromConversation, stepsFromEvents, userMessages } from './replaySteps.mjs';
import { activeLessons, appendLesson, parsePlaybook } from './playbook.mjs';

const update = (t, u) => ({ t, type: 'acp-session-update', workspaceId: 'main', update: u });
const subagent = { claudeCode: { parentToolUseId: 'toolu_agent' } };

const EVENTS = [
  update(100, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Looking at the scene. ' } }),
  update(200, {
    sessionUpdate: 'tool_call',
    toolCallId: 't1',
    title: 'get_scene',
    _meta: { claudeCode: { toolName: 'mcp__robotics_cad__get_scene' } },
  }),
  update(300, {
    sessionUpdate: 'tool_call',
    toolCallId: 't2',
    _meta: { claudeCode: { toolName: 'mcp__robotics_cad__model_part' } },
  }),
  update(400, { sessionUpdate: 'tool_call_update', toolCallId: 't2', status: 'failed' }),
  update(450, {
    sessionUpdate: 'tool_call',
    toolCallId: 't3',
    _meta: { claudeCode: { toolName: 'mcp__robotics_cad__model_part', ...subagent.claudeCode } },
  }),
  update(500, {
    sessionUpdate: 'usage_update',
    used: 999,
    size: 200000,
    cost: { amount: 9, currency: 'USD' },
    _meta: subagent,
  }),
  update(600, { sessionUpdate: 'usage_update', used: 52000, size: 200000, cost: { amount: 0.41, currency: 'USD' } }),
  update(700, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'The knee is in Warn.' } }),
  update(710, { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hidden' }, _meta: subagent }),
  { t: 65000, type: 'agent-status', status: 'idle' },
];

describe('run metrics', () => {
  it('reads cost, context, tokens and tool calls from the session updates', () => {
    const m = runMetrics(EVENTS, {
      result: {
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 20, cachedReadTokens: 5, totalTokens: 35 },
      },
    });

    expect(m).toMatchObject({
      seconds: 65,
      stopReason: 'end_turn',
      costUsd: 0.41,
      contextUsed: 52000,
      toolCalls: 3,
      failedTools: 1,
      subagentToolCalls: 1,
      toolsByName: { get_scene: 1, model_part: 2 },
      tokens: { input: 10, output: 20, cacheRead: 5, cacheWrite: 0, total: 35 },
    });
  });

  it('keeps only the lead agent text as the answer', () => {
    expect(answerText(EVENTS)).toBe('Looking at the scene. The knee is in Warn.');
  });
});

describe('run archive', () => {
  it('writes the scene and summary, and the index keeps the latest entry per run and task', () => {
    const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-archive-'));
    const dir = path.join(runs, 'r1', 'reachy-mini');

    fs.mkdirSync(dir, { recursive: true });

    const summary = {
      seconds: 900,
      score: { total: 80.1 },
      judge: { score: 6.2, costUsd: 0.3, issues: ['Head too boxy'] },
      metrics: runMetrics(EVENTS),
    };

    archiveRun({
      runsDir: runs,
      run: 'r1',
      task: 'reachy-mini',
      kind: 'robot',
      dir,
      summary,
      scene: { parts: [] },
      git: { commit: 'abc', dirty: false },
    });
    appendIndex(runs, {
      ...indexEntry({ run: 'r1', task: 'reachy-mini', kind: 'robot', summary: { ...summary, score: { total: 81 } } }),
    });

    expect(JSON.parse(fs.readFileSync(path.join(dir, 'scene.json'), 'utf8'))).toEqual({ parts: [] });

    const index = readIndex(runs);

    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({ score: 81, judge: 6.2, critique: ['Head too boxy'], costUsd: 0.41, toolCalls: 3 });
    expect(indexReport(index)).toContain('$0.41');
  });
});

const conversation = {
  id: 'chat-1',
  messages: [
    { role: 'user', text: 'Build a crab' },
    {
      role: 'agent',
      text: '',
      toolCalls: [
        { toolName: 'mcp__robotics_cad__add_parts', status: 'completed', rawInput: { parts: [{ id: 'body' }] } },
        {
          toolName: 'Agent',
          status: 'completed',
          rawInput: { prompt: 'legs' },
          children: [
            {
              toolName: 'mcp__robotics_cad__model_part',
              status: 'completed',
              rawInput: { id: 'leg', code: 'cube(1);' },
            },
          ],
        },
        { toolName: 'mcp__robotics_cad__update_parts', status: 'failed', rawInput: { updates: [] } },
      ],
    },
    { role: 'user', text: 'The head is too basic' },
    {
      role: 'agent',
      text: '',
      toolCalls: [{ toolName: 'mcp__robotics_cad__delete_parts', status: 'completed', rawInput: { ids: ['body'] } }],
    },
  ],
};

describe('replay steps', () => {
  it('stops a chat replay before message N, including subagent calls', () => {
    expect(stepsFromConversation(conversation, { stopAt: 2 }).map((s) => s.name)).toEqual([
      'mcp__robotics_cad__add_parts',
      'mcp__robotics_cad__model_part',
    ]);
    expect(stepsFromConversation(conversation)).toHaveLength(3);
    expect(messageAt(conversation, 2).text).toBe('The head is too basic');
    expect(userMessages(conversation).map((m) => m.index)).toEqual([0, 2]);
  });

  it('stops an events replay at tool call N', () => {
    const lines = [
      {
        update: { toolCallId: 'a', _meta: { claudeCode: { toolName: 'mcp__x__add_parts' } }, rawInput: { parts: [] } },
      },
      { update: { toolCallId: 'a', status: 'completed' } },
      { update: { toolCallId: 'b', _meta: { claudeCode: { toolName: 'mcp__x__look' } }, rawInput: { views: [] } } },
      {
        update: {
          toolCallId: 'c',
          _meta: { claudeCode: { toolName: 'mcp__x__delete_parts' } },
          rawInput: { ids: ['x'] },
        },
      },
      { update: { toolCallId: 'c', status: 'completed' } },
    ];

    expect(stepsFromEvents(lines)).toHaveLength(2);
    expect(stepsFromEvents(lines, { stopAtCall: 2 })).toHaveLength(1);
  });
});

describe('lessons playbook', () => {
  it('appends numbered entries and supersedes instead of rewriting', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-')), 'playbook.md');
    const first = appendLesson(file, {
      title: 'Neutral pose',
      lesson: 'Build at zero.',
      evidence: ['r9/unitree-g1'],
      date: '2026-10-29',
    });
    const before = fs.readFileSync(file, 'utf8');
    const second = appendLesson(file, {
      title: 'Neutral pose, except G1 elbows',
      lesson: 'Match the photos.',
      evidence: ['r12/unitree-g1', 'r13/unitree-g1'],
      supersedes: [first],
      date: '2026-10-30',
    });
    const entries = parsePlaybook(fs.readFileSync(file, 'utf8'));

    expect([first, second]).toEqual(['L-001', 'L-002']);
    expect(fs.readFileSync(file, 'utf8').startsWith(before)).toBe(true);
    expect(entries[1]).toMatchObject({
      evidence: ['r12/unitree-g1', 'r13/unitree-g1'],
      supersedes: ['L-001'],
      lesson: 'Match the photos.',
    });
    expect(activeLessons(entries).map((e) => e.id)).toEqual(['L-002']);
    expect(() => appendLesson(file, { title: 'x', lesson: 'y', evidence: [] })).toThrow(/evidence/);
  });
});
