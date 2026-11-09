import fs from 'node:fs';
import path from 'node:path';
import { VERIFY_DIR } from './lib/gate.mjs';
import { takeLease } from './lib/lease.mjs';
import {
  currentManifest,
  loadGates,
  manifestDrift,
  MANIFEST_FILE,
  ratchetProblems,
  readStatus,
  runGate,
  saveResult,
} from './lib/run.mjs';

const RATCHET_FILE = path.join(VERIFY_DIR, 'ratchet.json');

function printStatus(gates) {
  const { gates: saved } = readStatus();

  for (const g of gates) {
    const s = saved[g.id];
    let label = 'not run';

    if (g.state === 'parked') label = 'parked';
    else if (s) label = s.ok ? `pass at ${s.commit}` : `FAIL at ${s.commit}`;

    console.log(`S${g.stage}  ${g.id.padEnd(22)} ${label.padEnd(20)} ${g.title}`);
  }
}

function approve(gates) {
  fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(currentManifest(), null, 2)}\n`);
  fs.writeFileSync(
    RATCHET_FILE,
    `${JSON.stringify(Object.fromEntries(gates.map((g) => [g.id, g.checks.length])), null, 2)}\n`,
  );
  console.log('Recorded gate manifest and check counts.');
}

function guard(gates) {
  const drift = manifestDrift();
  const counts = Object.fromEntries(gates.map((g) => [g.id, g.checks.length]));
  const floor = fs.existsSync(RATCHET_FILE) ? JSON.parse(fs.readFileSync(RATCHET_FILE, 'utf8')) : {};
  const low = ratchetProblems(counts, floor);

  if (drift.length) console.error(`Gates changed without approval: ${drift.join(', ')}`);

  for (const p of low) console.error(`Ratchet: ${p}`);

  return !drift.length && !low.length;
}

async function runGates(gates, wanted) {
  const chosen = gates.filter((g) => wanted === 'all' || g.id === wanted);

  if (!chosen.length) {
    console.error(`No gate named ${wanted}.`);

    return false;
  }

  let ok = true;
  const release = await takeLease({ log: console.log });

  for (const g of chosen) {
    if (g.state === 'parked') {
      console.log(`${g.id}: parked (${g.parked ?? 'no reason given'})`);

      continue;
    }

    console.log(`${g.id}: ${g.title}`);

    const result = await runGate(g, console.log);

    saveResult(result);
    console.log(`${g.id}: ${result.ok ? 'PASS' : 'FAIL'}${result.voided ? ` (void: ${result.voided})` : ''}`);
    ok &&= result.ok && !result.voided;
  }

  release();

  return ok;
}

async function main() {
  const [cmd = 'status'] = process.argv.slice(2);
  const gates = await loadGates();

  if (cmd === 'status') {
    printStatus(gates);

    return 0;
  }

  if (cmd === 'approve') {
    approve(gates);

    return 0;
  }

  if (!guard(gates)) return 1;

  return (await runGates(gates, cmd)) ? 0 : 1;
}

process.exit(await main());
