import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { permissionOutcome } from './acpClientHandler.mjs';
import { AgentBridge, rendererTimeout } from './agentBridge.mjs';
import { agentEnv } from './agentProcess.mjs';
import { EventHub } from './eventHub.mjs';
import { listModels, saveModel } from './models.mjs';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backend-'));
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('models', () => {
  it('writes compact JSON and still reads pretty-printed saves', () => {
    fs.writeFileSync(path.join(dir, 'old.json'), JSON.stringify({ id: 'old', createdAt: '2024-01-01' }, null, 2));
    saveModel(dir, { id: 'new', name: 'Arm', createdAt: '2025-01-01' });

    expect(fs.readFileSync(path.join(dir, 'new.json'), 'utf-8')).toBe(
      '{"id":"new","name":"Arm","createdAt":"2025-01-01"}',
    );
    expect(listModels(dir).map((m) => m.id)).toEqual(['new', 'old']);
  });
});

describe('agent policy', () => {
  const options = [
    { kind: 'allow_always', optionId: 'always' },
    { kind: 'allow_once', optionId: 'once' },
    { kind: 'reject_once', optionId: 'no' },
  ];

  it('allows CAD and web tools and rejects the rest', () => {
    const cad = { toolCall: { title: 'mcp__robotics_cad__look' }, options };
    const shell = { toolCall: { title: 'Bash', kind: 'execute' }, options };

    expect(permissionOutcome(cad)).toEqual({
      safe: true,
      title: 'mcp__robotics_cad__look',
      outcome: { outcome: 'selected', optionId: 'once' },
    });
    expect(permissionOutcome(shell).outcome).toEqual({ outcome: 'selected', optionId: 'no' });
    expect(permissionOutcome({ toolCall: { kind: 'execute' } })).toEqual({
      safe: false,
      title: 'Tool',
      outcome: { outcome: 'cancelled' },
    });
  });

  it('strips host-session variables from the agent env', () => {
    const env = agentEnv({
      CLAUDECODE: '1',
      CLAUDE_CODE_HOST_SESSION_ID: 'x',
      ANTHROPIC_BASE_URL: 'h',
      CLAUDE_HOME: 'k',
      PATH: '/bin',
    });

    expect(env).toEqual({ CLAUDE_HOME: 'k', PATH: '/bin' });
    expect(agentEnv({ ANTHROPIC_BASE_URL: 'h' })).toEqual({ ANTHROPIC_BASE_URL: 'h' });
  });
});

describe('AgentBridge', () => {
  it('routes agent calls to the renderer per workspace', async () => {
    const events = new EventHub();
    const bridge = new AgentBridge({ events, onError: () => {} });
    const url = await bridge.start();

    events.on((event) => {
      if (event.type === 'agent-request')
        bridge.resolveRequest({ requestId: event.requestId, result: { got: event.workspaceId } });
    });

    const post = (route, body) =>
      fetch(`${url}${route}`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());

    expect(await post('/w/tab2/agent/look', {})).toEqual({ got: 'tab2' });
    expect(await post('/agent/look', {})).toEqual({ got: 'main' });
    expect((await fetch(`${url}/nope`, { method: 'POST' })).status).toBe(404);
    expect([rendererTimeout('apply'), rendererTimeout('retarget'), rendererTimeout('constructor')]).toEqual([
      180000, 300000, 60000,
    ]);
    bridge.server.close();
  });
});
