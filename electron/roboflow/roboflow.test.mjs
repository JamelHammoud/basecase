import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFakeRoboflow } from '../../e2e/fakeRoboflow.ts';
import { RoboflowAccount, roboflowEndpoint, NO_KEY } from './index.mjs';
import { projectOfLink, isRoboflowLink } from '../../src/roboflow/roboflowLink.ts';
import { roboflowPostRoutes } from './routes.mjs';

const KEY = 'roboflow-test-private-key';
const LINK = 'https://app.roboflow.com/workspace/project/2';
const servers = [];
const dirs = [];
const sealing = {
  available: () => true,
  encrypt: (value) => Buffer.from(value).toString('base64'),
  decrypt: (value) => Buffer.from(value, 'base64').toString(),
};

async function serve(options = {}) {
  const server = await startFakeRoboflow({ key: KEY, ...options });

  servers.push(server);

  return server;
}

function account(endpoint, outbound) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roboflow-'));

  dirs.push(dir);

  return new RoboflowAccount({ libraryDir: dir, secrets: sealing, endpoint: () => endpoint, outbound });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));

  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('Roboflow links', () => {
  it('reads app and Universe project/version links', () => {
    expect(projectOfLink(LINK)).toEqual({ workspace: 'workspace', project: 'project', version: 2 });
    expect(projectOfLink('https://universe.roboflow.com/workspace/project/dataset/3')).toEqual({
      workspace: 'workspace',
      project: 'project',
      version: 3,
    });
    expect(projectOfLink('https://app.roboflow.com/workspace/project')).toEqual({
      workspace: 'workspace',
      project: 'project',
    });
    expect(isRoboflowLink(LINK)).toBe(true);
  });

  it.each([
    'https://app.roboflow.com.attacker.example/workspace/project/2',
    'https://user@app.roboflow.com/workspace/project/2',
    'http://app.roboflow.com/workspace/project/2',
    'https://app.roboflow.com/workspace/%2e%2e/2',
    'https://app.roboflow.com/workspace/../real/project/2',
    'https://app.roboflow.com/workspace/project/0',
    'https://app.roboflow.com/workspace/project/2?api_key=stolen',
    'https://app.roboflow.com/workspace/project/2/other',
  ])('refuses crafted project links %s', (link) => expect(() => projectOfLink(link)).toThrow());
});

describe('Roboflow account and downloads', () => {
  it('permits only a loopback test API override', () => {
    expect(roboflowEndpoint(undefined)).toBe('https://api.roboflow.com');
    expect(roboflowEndpoint('http://127.0.0.1:9999')).toBe('http://127.0.0.1:9999');
    expect(() => roboflowEndpoint('https://attacker.example')).toThrow();
    expect(() => roboflowEndpoint('http://attacker.example')).toThrow();
  });

  it('validates and seals the key, returns flags only and downloads COCO without a key on the archive', async () => {
    const fake = await serve();
    const rf = account(fake.url);

    await expect(rf.importProject(LINK)).rejects.toThrow(NO_KEY);
    expect(fake.requests).toEqual([]);
    await expect(rf.setKey('wrong-key')).rejects.toThrow('Roboflow didn’t accept');
    expect(await rf.setKey(KEY)).toEqual({ saved: true });
    expect(fs.readFileSync(rf.keys.file, 'utf8')).not.toContain(KEY);
    expect(rf.account()).toEqual({ saved: true });

    const imported = await rf.importProject(LINK);

    expect(imported.name).toBe('project-v2.zip');
    expect([...imported.data]).toEqual([80, 75, 3, 4]);
    expect(fake.requests.at(-1)).toEqual({ path: '/archive.zip', key: null });
    expect(JSON.stringify(imported)).not.toContain(KEY);

    const route = roboflowPostRoutes(rf).find(([name]) => name === '/roboflow-import');

    expect(await route[1]({ arg: LINK })).toEqual({ name: 'project-v2.zip', data: 'UEsDBA==' });
  });

  it('resolves a project link to its latest generated version', async () => {
    const fake = await serve();
    const rf = account(fake.url);

    await rf.setKey(KEY);
    await rf.importProject('https://app.roboflow.com/workspace/project');
    expect(fake.requests.map((request) => request.path)).toContain('/workspace/project/2/coco');
  });

  it('refuses hostile links before making a request', async () => {
    const outbound = vi.fn();
    const rf = account('https://api.roboflow.com', outbound);

    rf.keys.set('roboflow', KEY);
    await expect(rf.importProject('https://attacker.example/workspace/project/2')).rejects.toThrow();
    expect(outbound).not.toHaveBeenCalled();
  });

  it('refuses redirects and off-host export links without leaking the key', async () => {
    const away = await serve();
    const fake = await serve({ redirectTo: `${away.url}/steal` });
    const rf = account(fake.url);

    await rf.setKey(KEY);
    await expect(rf.importProject(LINK)).rejects.toThrow();
    expect(away.requests).toEqual([]);

    const hostile = await serve({ exportLink: `${away.url}/archive.zip` });
    const other = account(hostile.url);

    await other.setKey(KEY);
    await expect(other.importProject(LINK)).rejects.toThrow(/Roboflow download/);
    expect(away.requests).toEqual([]);
  });

  it.each([
    'https://app.roboflow.com.attacker.example/ds/token',
    'https://app.roboflow.com/other/token',
    'https://user@app.roboflow.com/ds/token',
    'http://app.roboflow.com/ds/token',
    'https://app.roboflow.com:8443/ds/token',
    'https://app.roboflow.com/ds/token#fragment',
    'https://storage.googleapis.com/roboflow/archive.zip',
  ])('refuses a crafted archive address %s', async (link) => {
    const outbound = vi.fn().mockResolvedValue(new Response(JSON.stringify({ export: { link } })));
    const rf = account('https://api.roboflow.com', outbound);

    rf.keys.set('roboflow', KEY);
    await expect(rf.importProject(LINK)).rejects.toThrow(/Roboflow download/);
    expect(outbound).toHaveBeenCalledOnce();
  });

  it('downloads only a Roboflow archive without forwarding the saved API key', async () => {
    const outbound = vi.fn();
    const rf = account('https://api.roboflow.com', outbound);

    rf.keys.set('roboflow', KEY);
    outbound.mockResolvedValueOnce(
      new Response('{"export":{"link":"https://app.roboflow.com/ds/token?key=export-token"}}'),
    );
    outbound.mockResolvedValueOnce(new Response(new Uint8Array([80, 75, 3, 4])));
    await rf.importProject(LINK);

    const [url, init] = outbound.mock.calls.at(-1);

    expect(url.href).toBe('https://app.roboflow.com/ds/token?key=export-token');
    expect(init.redirect).toBe('error');
    expect(JSON.stringify(init)).not.toContain(KEY);
    expect(url.href).not.toContain(KEY);
  });

  it('stops a streamed archive at the cap before buffering its oversized chunk', async () => {
    const outbound = vi.fn();
    const rf = account('https://api.roboflow.com', outbound);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue({ byteLength: 600000001 });
        controller.close();
      },
    });

    rf.keys.set('roboflow', KEY);
    outbound.mockResolvedValueOnce(new Response('{"export":{"link":"https://api.roboflow.com/archive.zip"}}'));
    outbound.mockResolvedValueOnce(new Response(body));
    await expect(rf.importProject(LINK)).rejects.toThrow(/larger/);
  });

  it('caps response headers and streamed archives and hides provider errors', async () => {
    const outbound = vi.fn(async () => new Response('{"workspace":"workspace"}'));
    const rf = account('https://api.roboflow.com', outbound);

    await rf.setKey(KEY);
    outbound.mockResolvedValueOnce(new Response('secret', { status: 500 }));
    await expect(rf.importProject(LINK)).rejects.toThrow('Roboflow');
    outbound.mockResolvedValueOnce(new Response('{}', { headers: { 'Content-Length': '2000000' } }));
    await expect(rf.importProject(LINK)).rejects.toThrow(/larger/);
    outbound.mockResolvedValueOnce(new Response('{"export":{"link":"https://api.roboflow.com/archive.zip"}}'));
    outbound.mockResolvedValueOnce(new Response('', { headers: { 'Content-Length': '600000001' } }));
    await expect(rf.importProject(LINK)).rejects.toThrow(/larger/);
  });
});
