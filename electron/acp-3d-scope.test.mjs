import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import { afterAll, describe, expect, it } from 'vitest';
import { offlineRefusal, OFFLINE_SCOPE } from './acp-3d-scope.mjs';
import { buildPromptBlocks } from './backend/promptBlocks.mjs';

const AGENT = fileURLToPath(new URL('./acp-3d-agent.mjs', import.meta.url));
const children = [];

async function offlineAgent() {
  const child = spawn(process.execPath, [AGENT], { stdio: ['pipe', 'pipe', 'inherit'] });
  const seen = { text: '', titles: [], writes: [] };
  const client = {
    sessionUpdate: async ({ update }) => {
      if (update.sessionUpdate === 'agent_message_chunk') seen.text += update.content.text;

      if (update.title) seen.titles.push(update.title);
    },
    writeTextFile: async (params) => {
      seen.writes.push(params.path);

      return {};
    },
    requestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
  };
  const conn = new ClientSideConnection(
    () => client,
    ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)),
  );

  children.push(child);
  await conn.initialize({ protocolVersion: PROTOCOL_VERSION, clientCapabilities: { fs: { writeTextFile: true } } });

  const { sessionId } = await conn.newSession({ cwd: process.cwd(), mcpServers: [] });

  return async (promptText) => {
    await conn.prompt({ sessionId, prompt: buildPromptBlocks({ promptText }, { isAiAgent: false }) });

    return seen;
  };
}

afterAll(() => children.forEach((child) => child.kill()));

describe('what the offline agent makes', () => {
  it('answers a Teach request in words and makes no part', async () => {
    const seen = await (await offlineAgent())('/train drive forward');

    expect(seen.writes).toEqual([]);
    expect(seen.text).toBe(OFFLINE_SCOPE);
  });

  it('answers a Fix from Checks in words and makes no part', async () => {
    const seen = await (await offlineAgent())('Quoted from Checks:\n> These parts overlap by 3 mm.\n\nFix this.');

    expect(seen.writes).toEqual([]);
    expect(seen.text).toBe(OFFLINE_SCOPE);
  });

  it('makes a part from a description without showing where the file went', async () => {
    const seen = await (await offlineAgent())('A servo bracket with four standoffs');

    expect(seen.writes).toHaveLength(1);
    expect([seen.text, ...seen.titles].join('\n')).not.toMatch(/library\/|\.json/);
  });

  it('reads a command when a note follows it, and leaves a quote from the chat alone', () => {
    expect(offlineRefusal('/coach Walk: lift its feet\n\n(The user is running the Case Reach a Spot.)')).toBe(
      OFFLINE_SCOPE,
    );
    expect(offlineRefusal('Quoted from my message:\n> a wheel hub\n\nMake it wider')).toBeNull();
  });
});
