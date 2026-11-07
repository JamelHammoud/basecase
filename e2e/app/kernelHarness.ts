import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ElectronApplication } from 'playwright-core';
import { launchPackaged, type RunningApp } from './packagedApp';

const CAPTURE_AGENT = `import fs from 'node:fs';
import readline from 'node:readline';

const out = new URL('./session.json', import.meta.url);
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line);

  if (message.method === 'initialize') reply(message.id, { protocolVersion: 1, agentCapabilities: {}, authMethods: [] });
  else if (message.method === 'session/new') {
    fs.writeFileSync(out, JSON.stringify(message.params));
    reply(message.id, { sessionId: 'kernel-test' });
  } else if (message.id !== undefined) reply(message.id, {});
});
`;

interface McpServerEntry {
  command: string;
  args: string[];
  env: { name: string; value: string }[];
}

export interface KernelApp {
  run: RunningApp;
  mcpServer: McpServerEntry;
  bridgeUrl: string;
  close: () => Promise<void>;
}

async function capturedSession(file: string): Promise<{ mcpServers: McpServerEntry[] }> {
  const deadline = Date.now() + 60000;

  while (!fs.existsSync(file)) {
    if (Date.now() > deadline) throw new Error('The app never started an agent session.');

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export async function launchKernelApp(): Promise<KernelApp> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-acp-3d-agent-'));
  const agent = path.join(dir, 'acp-3d-agent-capture.mjs');

  fs.writeFileSync(agent, CAPTURE_AGENT);

  const run = await launchPackaged({ agentCommand: `node ${agent}` });
  const { mcpServers } = await capturedSession(path.join(dir, 'session.json'));
  const mcpServer = mcpServers[0];
  const bridgeUrl = mcpServer.env.find((e) => e.name === 'CAD_BRIDGE_URL')?.value ?? '';

  return {
    run,
    mcpServer,
    bridgeUrl,
    close: async () => {
      await run.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

export async function connectMcp(server: McpServerEntry): Promise<Client> {
  const env = Object.fromEntries(server.env.map((e) => [e.name, e.value]));
  const transport = new StdioClientTransport({ command: server.command, args: server.args, env, stderr: 'ignore' });
  const client = new Client({ name: 'kernel-sandbox-test', version: '1.0.0' });

  await client.connect(transport);

  return client;
}

export interface KernelResult {
  ok: boolean;
  error?: string;
  stats?: { volume: number; bbox: { size: number[] } };
}

export async function kernelRender(
  bridgeUrl: string,
  job: { language: string; code: string; timeoutMs?: number },
): Promise<KernelResult> {
  const res = await fetch(`${bridgeUrl}/agent/kernel_render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(job),
  });

  return res.json();
}

export interface KernelWindowInfo {
  pid: number;
  url: string;
  sandboxed: boolean | undefined;
  preferences: Record<string, unknown>;
}

export const kernelWindows = (app: ElectronApplication): Promise<KernelWindowInfo[]> =>
  app.evaluate(({ app: electronApp, BrowserWindow }) => {
    const metrics = electronApp.getAppMetrics();

    return BrowserWindow.getAllWindows()
      .filter((w) => w.webContents.getURL().startsWith('basecase-kernel:'))
      .map((w) => {
        const pid = w.webContents.getOSProcessId();

        return {
          pid,
          url: w.webContents.getURL(),
          sandboxed: metrics.find((m) => m.pid === pid)?.sandboxed,
          preferences: (
            w.webContents as unknown as { getLastWebPreferences: () => Record<string, unknown> }
          ).getLastWebPreferences(),
        };
      });
  });

export const sessionFetch = (app: ElectronApplication, url: string): Promise<string> =>
  app.evaluate(async ({ session }, target) => {
    try {
      await session.fromPartition('basecase-kernel-sandbox').fetch(target);

      return 'ALLOWED';
    } catch (err) {
      return `denied: ${String((err as Error)?.message ?? err)}`;
    }
  }, url);

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
}
