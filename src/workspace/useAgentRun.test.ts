import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useAgentRun } from './useAgentRun';
import { newLane, type AgentLane } from './agentLanes';
import type { AgentLanes } from './useAgentLanes';
import type { WorkspaceCore } from './useWorkspaceCore';
import { platformBridge } from '../utils/platformBridge';
import { versionScene } from './sceneVersions.fixtures';

vi.mock('../utils/platformBridge', () => ({
  platformBridge: { sendAcpPrompt: vi.fn(), forgetAcpRun: vi.fn() },
}));

afterEach(() => vi.resetAllMocks());

it('leaves a failed reply with Retry when durable baseline storage refuses the prompt', async () => {
  const lanesRef = { current: [newLane('main')] };
  const flags = { stopped: false, busy: false };
  const updateLane = (id: string, update: (lane: AgentLane) => AgentLane) => {
    lanesRef.current = lanesRef.current.map((lane) => (lane.id === id ? update(lane) : lane));
  };
  const lanes = {
    get current() {
      return lanesRef.current[0];
    },
    lanesRef,
    keyOf: () => 'workspace',
    flagsOf: () => flags,
    updateLane,
    setMessages: (id: string, update: (messages: AgentLane['messages']) => AgentLane['messages']) =>
      updateLane(id, (lane) => ({ ...lane, messages: update(lane.messages) })),
  } as unknown as AgentLanes;
  const design = versionScene([]);
  const begin = vi.fn().mockRejectedValue(new Error('Disk full'));
  const finish = vi.fn().mockResolvedValue(undefined);
  const showToast = vi.fn();
  const core = {
    studio: { setCustomModels: vi.fn() },
    docs: { partsRef: { current: design.parts }, projectRef: { current: design.project } },
    caseRun: { live: false },
    versions: { begin, finish },
    showToast,
  } as unknown as WorkspaceCore;
  const endLane = vi.fn();
  const clearLane = vi.fn();
  const options = {
    core,
    lanes,
    actors: { endLane },
    cursors: { clearLane },
    alive: () => true,
    placeCustomModel: vi.fn(),
  } as unknown as Parameters<typeof useAgentRun>[0];
  const result: { current?: ReturnType<typeof useAgentRun> } = {};
  const Host = () => {
    result.current = useAgentRun(options);

    return null;
  };

  renderToStaticMarkup(createElement(Host));
  await result.current!.send({ text: 'Move the arm' });

  expect(begin).toHaveBeenCalledWith('workspace', expect.stringMatching(/^chat-/));
  expect(platformBridge.sendAcpPrompt).not.toHaveBeenCalled();
  expect(lanesRef.current[0].messages.at(-1)?.failed).toBe('Disk full');
  expect(flags.busy).toBe(false);
  expect(showToast).toHaveBeenCalledWith('Disk full', { tone: 'error' });
  expect(finish).toHaveBeenCalledWith('workspace', []);
  expect(endLane).toHaveBeenCalledWith('main');
  expect(clearLane).toHaveBeenCalledWith('main');
});
