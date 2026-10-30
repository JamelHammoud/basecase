#!/usr/bin/env node
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROBOTS } from './robots.mjs';
import { argOption, here } from './harness.mjs';
import { readIndex } from './archive.mjs';
import { robotReport } from './report.mjs';

const args = process.argv.slice(2);
const runName = argOption(args, 'run', `weekly-${new Date().toISOString().slice(0, 10)}`);
const concurrency = Number(argOption(args, 'concurrency', 3));
const basePort = Number(argOption(args, 'port', 5200));
const wanted = argOption(args, 'robots', '').split(',').filter(Boolean);
const runDir = path.join(here, 'runs', runName);
const needsData = (key) => !ROBOTS[key].concept;
const hasData = (key) => fs.existsSync(path.join(here, 'data', key));
const robots = (wanted.length ? wanted : Object.keys(ROBOTS)).filter((k) => ROBOTS[k]);
const ready = robots.filter((k) => !needsData(k) || hasData(k));
const skipped = robots.filter((k) => !ready.includes(k));

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}

async function nextPort(state) {
  while (!(await portFree(state.port))) state.port++;

  return state.port++;
}

function runRobot(robot, port) {
  const logFile = path.join(runDir, `${robot}.log`);
  const child = spawn(process.execPath, [path.join(here, 'run.mjs'), robot, '--port', String(port), '--run', runName], {
    stdio: ['ignore', fs.openSync(logFile, 'a'), fs.openSync(logFile, 'a')],
  });

  return new Promise((resolve) => child.on('close', (code) => resolve({ robot, code })));
}

async function pool(items, size, fn) {
  const results = [];
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) results.push(await fn(queue.shift()));
  });

  await Promise.all(workers);

  return results;
}

console.log(`Weekly bench ${runName}: ${ready.join(', ')}`);

if (skipped.length) console.log(`Skipped (run node bench/fetch.mjs <robot> first): ${skipped.join(', ')}`);

if (args.includes('--dry')) process.exit(0);

fs.mkdirSync(runDir, { recursive: true });

const ports = { port: basePort };
const t0 = Date.now();
const finished = await pool(ready, concurrency, async (robot) => {
  const port = await nextPort(ports);
  const r = await runRobot(robot, port);

  console.log(`${robot} ${r.code === 0 ? 'done' : `failed (exit ${r.code}), see ${robot}.log`}`);

  return r;
});
const entries = readIndex(path.join(here, 'runs')).filter((e) => e.run === runName);
const cost = entries.reduce((s, e) => s + (e.costUsd ?? 0) + (e.judgeCostUsd ?? 0), 0);
const report = [
  `# Weekly bench ${runName}`,
  '',
  `${finished.filter((r) => r.code === 0).length} of ${ready.length} robots finished in ${Math.round((Date.now() - t0) / 60000)} min, $${cost.toFixed(2)} including the judge.`,
  skipped.length ? `Skipped for missing data: ${skipped.join(', ')}.` : '',
  '',
  robotReport([runName]),
]
  .filter((l) => l !== undefined)
  .join('\n');

fs.writeFileSync(path.join(runDir, 'report.md'), report + '\n');
console.log(report);
