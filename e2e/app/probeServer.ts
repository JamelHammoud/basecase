import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProbeTargets } from './kernelProbes';

export interface ProbeWorld {
  targets: ProbeTargets;
  hits: string[];
  close: () => Promise<void>;
}

const SECRET_MARKER = 'basecase-probe-secret';

function secretFiles() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-probe-'));
  const secretPath = path.join(dir, 'secret.scad');
  const modulePath = path.join(dir, 'module.mjs');

  fs.writeFileSync(secretPath, `cube(77); // ${SECRET_MARKER}\n`);
  fs.writeFileSync(modulePath, 'export const reached = true;\n');

  return { dir, secretPath, modulePath };
}

export async function startProbeWorld(bridgeUrl: string): Promise<ProbeWorld> {
  const hits: string[] = [];
  const { dir, secretPath, modulePath } = secretFiles();
  const server = http.createServer((req, res) => {
    hits.push(`http ${req.url}`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', req.url?.endsWith('.js') ? 'text/javascript' : 'text/plain');
    res.end(req.url?.endsWith('.js') ? 'globalThis.__reached = true;' : SECRET_MARKER);
  });

  server.on('upgrade', (req, socket) => {
    hits.push(`upgrade ${req.url}`);
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address() as AddressInfo;

  return {
    hits,
    targets: {
      secretPath,
      secretUrl: pathToFileURL(secretPath).href,
      secretMarker: SECRET_MARKER,
      moduleFileUrl: pathToFileURL(modulePath).href,
      localUrl: `http://127.0.0.1:${port}`,
      wsUrl: `ws://127.0.0.1:${port}/socket`,
      externalUrl: 'https://example.com/',
      externalWsUrl: 'wss://example.com/socket',
      otherOriginUrl: 'app://basecase/index.html',
      bridgeUrl,
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
