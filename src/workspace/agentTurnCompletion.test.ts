import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcpChatMessage } from '../types/robotics';
import { readinessOf } from '../readiness/readiness';
import { box } from '../sim/fixtures/parts';
import type { Finding } from '../readiness/types';
import { platformBridge } from '../utils/platformBridge';
import { newLane } from './agentLanes';
import { useAgentRun } from './useAgentRun';
import type { LaneFlags } from './useAgentLanes';

const blocker: Finding = {
  key: 'new-clash',
  level: 'blocker',
  area: 'fit',
  check: 'Fit',
  rule: 'clash',
  ruleName: 'Overlapping Parts',
  text: 'The parts overlap.',
  agentText: 'Separate the parts.',
  ids: [],
};

function setup() {
  const lane = newLane('main');
  const flags: LaneFlags = {
    busy: false,
    follow: true,
    queued: [],
    stopped: false,
    pendingResume: null,
    adopted: null,
  };
  const parts = [box('arm', [0, 0, 0], [10, 10, 10], 10)];
  const verdict = (findings: Finding[], fingerprint: string) =>
    readinessOf(findings, { parts, decisions: {}, fingerprint });
  const readiness = {
    checkNow: vi
      .fn()
      .mockResolvedValueOnce(verdict([], 'before'))
      .mockResolvedValue(verdict([blocker], 'after')),
    startTurn: vi.fn(),
  };
  const endLane = vi.fn();
  const clearLane = vi.fn();
  const options = {
    core: {
      studio: { autoFixBlockers: true, setCustomModels: vi.fn() },
      docs: { partsRef: { current: parts }, projectRef: { current: { marks: [] } } },
      caseRun: { live: false },
      readiness,
      versions: { begin: vi.fn().mockResolvedValue(undefined), finish: vi.fn().mockResolvedValue(undefined) },
      showToast: vi.fn(),
    },
    lanes: {
      current: lane,
      lanesRef: { current: [lane] },
      flagsOf: () => flags,
      keyOf: () => 'workspace',
      updateLane: (_id: string, update: (value: typeof lane) => typeof lane) => Object.assign(lane, update(lane)),
      setMessages: (_id: string, update: (value: AcpChatMessage[]) => AcpChatMessage[]) => {
        lane.messages = update(lane.messages);
      },
      setQueue: (_id: string, update: (value: typeof flags.queued) => typeof flags.queued) => {
        flags.queued = update(flags.queued);
      },
    },
    actors: { endLane },
    cursors: { clearLane },
    alive: () => true,
    placeCustomModel: vi.fn(),
  } as unknown as Parameters<typeof useAgentRun>[0];
  const send = vi
    .spyOn(platformBridge, 'sendAcpPrompt')
    .mockResolvedValue({ stopReason: 'end_turn', models: [], scenes: [] });
  const forget = vi.spyOn(platformBridge, 'forgetAcpRun').mockResolvedValue(undefined);

  vi.spyOn(platformBridge, 'listModels').mockResolvedValue([]);

  let run: ReturnType<typeof useAgentRun> | undefined;

  function Harness() {
    run = useAgentRun(options);

    return null;
  }

  renderToString(createElement(Harness));

  return { run: run!, lane, flags, readiness, send, forget, endLane, clearLane };
}

afterEach(() => vi.restoreAllMocks());

describe('agent turn completion', () => {
  it('finishes without appending or sending repairs when new blockers appear', async () => {
    const { run, lane, flags, readiness, send, forget, endLane, clearLane } = setup();

    await run.send({ text: 'Move the arm.' });

    expect(send).toHaveBeenCalledOnce();
    expect(lane.messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'Move the arm.'],
      ['agent', ''],
    ]);
    expect(readiness.checkNow).toHaveBeenCalledOnce();
    expect(readiness.startTurn).toHaveBeenCalledOnce();
    expect(flags.busy).toBe(false);
    expect(forget).toHaveBeenCalledExactlyOnceWith('workspace');
    expect(endLane).toHaveBeenCalledExactlyOnceWith('main');
    expect(clearLane).toHaveBeenCalledExactlyOnceWith('main');
  });

  it('still sends messages the person queued', async () => {
    const { run, lane, flags, send } = setup();

    send.mockImplementationOnce(async () => {
      await run.send({ text: 'Now move the wrist.' }, 'queue');

      return { stopReason: 'end_turn', models: [], scenes: [] };
    });
    await run.send({ text: 'Move the arm.' });

    expect(send.mock.calls.map(([payload]) => payload.promptText)).toEqual(['Move the arm.', 'Now move the wrist.']);
    expect(lane.messages.filter((message) => message.role === 'user').map((message) => message.text)).toEqual([
      'Move the arm.',
      'Now move the wrist.',
    ]);
    expect(flags.queued).toEqual([]);
    expect(flags.busy).toBe(false);
  });

  it('sends a repair when the person requests it', async () => {
    const { run, send } = setup();

    await run.send({ text: '/fix' });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].promptText).toBe('/fix');
  });
});
