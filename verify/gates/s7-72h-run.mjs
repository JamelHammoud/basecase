import fs from 'node:fs';
import path from 'node:path';
import { vitestCanary } from '../lib/canary.mjs';
import { fail, pass, ROOT, shCheck, vitestCheck } from '../lib/gate.mjs';

const CANARIES = 'verify/rehearsal/canaries.test.ts';
const UNSIGNED = { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } };
const WINDOWS_SEGMENTS = path.join(ROOT, 'verify', 'out', 'rehearsal', 'soak-windows');
const HOURS = 72;

const windowsSegments = {
  name: 'Windows x64 CPU path: checkpointed segments add up to 72 hours with no page errors',
  run: () => {
    const files = fs.existsSync(WINDOWS_SEGMENTS)
      ? fs.readdirSync(WINDOWS_SEGMENTS).filter((f) => f.endsWith('.json'))
      : [];
    const segments = files.map((f) => JSON.parse(fs.readFileSync(path.join(WINDOWS_SEGMENTS, f), 'utf8')));
    const hours = segments.filter((s) => s.platform === 'win32').reduce((sum, s) => sum + (s.hours ?? 0), 0);
    const errors = segments.flatMap((s) => s.errors ?? []);

    if (hours < HOURS) return fail(`Windows segments cover ${hours.toFixed(1)} of ${HOURS} hours`);

    return errors.length
      ? fail(`${errors.length} page errors in the Windows segments`)
      : pass(`${segments.length} segments`);
  },
};

export default {
  id: 's7-72h-run',
  stage: 7,
  title: 'Stage 7: the 72-hour run, persona to emulated robot with the full fault matrix',
  state: 'parked',
  parked:
    'Needs this Mac for three days. Unpark for the rehearsal window; the Windows half needs the new Windows driver for test:app writing segments to verify/out/rehearsal/soak-windows.',
  checks: [
    shCheck('the app bundles', 'npx', ['vite', 'build']),
    shCheck('the robot daemon is staged for the app', 'npm', ['run', 'build:daemon']),
    shCheck(
      'an unsigned app packages',
      'npx',
      ['electron-builder', '--dir', '--publish', 'never', '-c.mac.forceCodeSigning=false'],
      UNSIGNED,
    ),
    vitestCheck(
      '72 hours on the Mac: the app stays up, every fault in the matrix is shown, no page errors',
      'verify/rehearsal/soak.test.ts',
    ),
    windowsSegments,
  ],
  canaries: [
    vitestCanary(
      'a silent persona misses the recall bar',
      CANARIES,
      'canary silent persona: a persona that reports nothing meets the recall bar',
    ),
    vitestCanary(
      'a voided gate is not green',
      CANARIES,
      'canary void counted green: a voided required gate passes the rehearsal',
    ),
  ],
};
