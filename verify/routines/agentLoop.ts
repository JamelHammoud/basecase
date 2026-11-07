import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Page } from 'playwright-core';
import { repoPath } from '../lib/need';

interface Pending {
  event: { type: 'agent-request'; requestId: string; kind: string; payload: unknown };
  answer: (status: number, body: unknown) => void;
}

export interface AgentLoop {
  call: (tool: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  calls: () => number;
  close: () => Promise<void>;
}

const readBody = (req: http.IncomingMessage) =>
  new Promise<string>((resolve) => {
    let body = '';

    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });

function startBridge(pending: Map<string, Pending>) {
  let next = 0;
  const server = http.createServer(async (req, res) => {
    const kind = /\/agent\/([a-z_]+)$/.exec(req.url ?? '')?.[1];
    const body = await readBody(req);

    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST' || !kind) {
      res.statusCode = 404;
      res.end('{}');

      return;
    }

    next += 1;

    const requestId = `verify-${next}`;
    const answer = (status: number, reply: unknown) => {
      res.statusCode = status;
      res.end(JSON.stringify(reply));
    };

    pending.set(requestId, {
      event: { type: 'agent-request', requestId, kind, payload: body ? JSON.parse(body) : {} },
      answer,
    });
  });

  return new Promise<{ server: http.Server; url: string }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
    });
  });
}

async function routeEvents(page: Page, pending: Map<string, Pending>) {
  await page.route('**/api/events', (route) => {
    const events = [...pending.values()].map((p) => `data: ${JSON.stringify(p.event)}\n\n`).join('');

    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `retry: 150\n\n${events}` });
  });
  await page.route('**/api/bridge/agent-respond', (route) => {
    const { requestId, result, error } = route.request().postDataJSON() as {
      requestId: string;
      result?: unknown;
      error?: string;
    };
    const waiting = pending.get(requestId);

    pending.delete(requestId);
    waiting?.answer(error ? 500 : 200, error ? { error } : (result ?? { ok: true }));

    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
}

function replyJson(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  const text = content.find((c) => c.type === 'text')?.text ?? '';

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The tool must answer with a JSON object, got: ${text.slice(0, 300)}`);
  }
}

export async function startAgentLoop(page: Page): Promise<AgentLoop> {
  const pending = new Map<string, Pending>();
  const { server, url } = await startBridge(pending);

  await routeEvents(page, pending);

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [repoPath('electron', 'cad-mcp-server.mjs')],
    env: { PATH: process.env.PATH ?? '', CAD_BRIDGE_URL: url },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'routines-gate', version: '1.0.0' });
  let count = 0;

  await client.connect(transport);

  return {
    call: async (tool, args) => {
      count += 1;

      return replyJson(await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 300000 }));
    },
    calls: () => count,
    close: async () => {
      await client.close();
      server.close();
    },
  };
}

export async function toolNames(): Promise<string[]> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [repoPath('electron', 'cad-mcp-server.mjs')],
    env: { PATH: process.env.PATH ?? '', CAD_BRIDGE_URL: 'http://127.0.0.1:9/none' },
    stderr: 'ignore',
  });
  const client = new Client({ name: 'routines-gate', version: '1.0.0' });

  await client.connect(transport);

  const { tools } = await client.listTools();

  await client.close();

  return tools.map((t) => t.name);
}
