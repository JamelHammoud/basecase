import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestError } from '@agentclientprotocol/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { AcpAgent } from './acpAgent.mjs';
import { LEGACY_AGENT_COMMAND } from './constants.mjs';
import { libraryPaths } from './libraryPaths.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const agents = [];

function packagedAgent(command = LEGACY_AGENT_COMMAND) {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-acp-'));
  const paths = libraryPaths(dataRoot);

  fs.mkdirSync(paths.libraryDir, { recursive: true });
  fs.writeFileSync(path.join(paths.libraryDir, 'agent.json'), JSON.stringify({ command }));

  const agent = new AcpAgent({
    paths,
    workspaceRoot: repo,
    offline: true,
    bridge: { ready: Promise.resolve(), url: 'http://127.0.0.1:9/bridge', replay: () => {} },
    emit: () => {},
    libraryState: () => ({}),
    promptBlocks: (payload) => [{ type: 'text', text: payload.text }],
  });

  agents.push({ agent, dataRoot });

  return { agent, paths };
}

function failingAgent(error) {
  const { agent } = packagedAgent();

  agent.connection = {
    prompt: async () => {
      throw error;
    },
  };
  agent.connected = true;
  agent.agentInfo = { name: 'Claude Code' };
  agent.sessions.set('main', 'session-1');

  return agent;
}

const rejection = (promise) =>
  promise.then(
    () => null,
    (err) => err,
  );

afterEach(() => {
  for (const { agent, dataRoot } of agents.splice(0)) {
    agent.disconnect();
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});

describe('ACP agent failures', () => {
  it('runs the offline agent when the library lives apart from the app, as in a packaged build', async () => {
    const { agent, paths } = packagedAgent();
    const res = await agent.sendPrompt({ text: 'Servo bracket', workspaceId: 'main' });

    expect(res.stopReason).toBe('end_turn');
    expect(fs.readdirSync(paths.modelsDir).filter((f) => f.endsWith('.json'))).toHaveLength(1);
  }, 30000);

  it('turns an internal agent error into plain words with a next step, never a class name', async () => {
    const err = await rejection(
      failingAgent(RequestError.internalError({ details: 'boom' })).sendPrompt({ text: 'hi', workspaceId: 'main' }),
    );

    expect(err.name).toBe('Error');
    expect(String(err)).not.toMatch(/RequestError|Internal error/);
    expect(err.message).toBe('Claude Code stopped on an error. Try again, or pick another agent in Settings → Agent.');
  });

  it('points to the Agent tab when the agent wants a sign-in', async () => {
    const err = await rejection(
      failingAgent(RequestError.authRequired()).sendPrompt({ text: 'hi', workspaceId: 'main' }),
    );

    expect(err.message).toBe('Sign in to Claude Code from the Agent tab.');
  });

  it('points to Settings when no agent is connected', async () => {
    const { agent } = packagedAgent('node scratch/no-such-agent.mjs');
    const err = await rejection(agent.sendPrompt({ text: 'hi', workspaceId: 'main' }));

    expect(err.message).toBe('Agent isn’t connected. Set one up in Settings → Agent.');
  }, 30000);
});
