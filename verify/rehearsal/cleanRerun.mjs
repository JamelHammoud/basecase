import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, pass, ROOT, sh } from '../lib/gate.mjs';
import { rehearsalProblems, rehearsalReport, SELF } from './report.mjs';

const OUT = path.join(ROOT, 'verify', 'out', 'rehearsal');

const tail = (r) => `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-6).join('\n');

function checkout(dir, head) {
  const steps = [
    ['git', ['clone', '--quiet', '--no-local', '--no-checkout', ROOT, dir], ROOT],
    ['git', ['-C', dir, 'checkout', '--quiet', '--detach', head], ROOT],
    ['npm', ['ci', '--no-audit', '--no-fund'], dir],
  ];

  for (const [command, args, cwd] of steps) {
    const r = sh(command, args, { cwd });

    if (!r.ok) return `${command} ${args[0]} failed: ${tail(r)}`;
  }

  return null;
}

async function rerun(dir, log) {
  const run = await import(pathToFileURL(path.join(dir, 'verify', 'lib', 'run.mjs')).href);
  const gates = await run.loadGates();
  const results = {};

  for (const g of gates.filter((x) => x.state === 'required' && !SELF.test(x.id))) {
    log(`  rehearsal: ${g.id}`);
    results[g.id] = await run.runGate(g, log);
  }

  return { gates, results, drift: run.manifestDrift() };
}

export const cleanRerun = {
  name: 'every required gate passes again from a clean checkout of this commit, parked gates listed with reasons',
  run: async () => {
    const head = sh('git', ['rev-parse', 'HEAD']).stdout.trim();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-rehearsal-'));

    try {
      const broken = checkout(dir, head);

      if (broken) return fail(broken);

      const { gates, results, drift } = await rerun(dir, console.log);
      const problems = [...rehearsalProblems(gates, results), ...drift.map((f) => `${f}: changed without approval`)];

      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(
        path.join(OUT, 'report.md'),
        rehearsalReport({ commit: head.slice(0, 7), gates, results, problems }),
      );
      fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify({ head, results, problems }, null, 2)}\n`);

      return problems.length
        ? fail(problems.join('\n'))
        : pass(`${Object.keys(results).length} required gates at ${head.slice(0, 7)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};
