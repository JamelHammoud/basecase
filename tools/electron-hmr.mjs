#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'vite';

const PORT = 5173;

process.env.BASECASE_HMR_PORT = String(PORT);

const server = await createServer({ server: { port: PORT, strictPort: true } });

await server.listen();
server.printUrls();

const electron = spawn(process.execPath, ['tools/electron-dev.mjs', '.'], { stdio: 'inherit' });
const stop = () => electron.kill();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, stop);
}

electron.on('exit', async (code) => {
  await server.close();
  process.exit(code ?? 0);
});
