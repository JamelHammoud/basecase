import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectAndOpen, launchWithRelay } from '../hw/relayApp';
import { nonce, textVisible } from '../hw/robotChecks';
import { waitFor } from '../hw/relayHarness';
import { repoPath } from '../lib/need';
import { loadPersonaLab, screenOf } from './screen';

const HOURS = Number(process.env.SOAK_HOURS ?? 72);
const CYCLE_MINUTES = 10;
const SHOWN_MS = 3000;
const OUT = repoPath('verify', 'out', 'rehearsal', 'soak');

const FAULT_MATRIX = Object.freeze([
  'unplug_mid_packet',
  'brownout_resets_servo',
  'stuck_motor_overload',
  'corrupt_packets',
  'wrong_id_answer',
  'overheat',
  'latency_spike',
  'wrong_direction',
  'duplicate_id',
  'policy_nan',
  'policy_hang',
]);

interface Checkpoint {
  hours: number;
  cycles: number;
  injected: Record<string, number>;
  shown: Record<string, number>;
  errors: string[];
}

const GOALS = [
  'You are new to Basecase and have an emulated robot arm. Connect it in Operate, set it up, test it and keep it running.',
  'If something goes wrong, read what the app says and get the robot running again.',
];

function save(cp: Checkpoint) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'checkpoint.json'), `${JSON.stringify(cp, null, 2)}\n`);
}

describe(`${HOURS}-hour rehearsal: unsigned packaged app, persona to emulated robot, full fault matrix`, () => {
  it(
    'stays up, shows every fault in plain words, and logs no page errors',
    async () => {
      const lab = await loadPersonaLab();
      const app = await launchWithRelay();
      const started = Date.now();
      const cp: Checkpoint = { hours: 0, cycles: 0, injected: {}, shown: {}, errors: [] };

      try {
        await connectAndOpen(app);

        const page = app.run.page;
        const screen = screenOf(page);

        while ((Date.now() - started) / 3_600_000 < HOURS) {
          await lab.runPersona({ screen, goals: GOALS, minutes: CYCLE_MINUTES });

          const code = FAULT_MATRIX[cp.cycles % FAULT_MATRIX.length];
          const message = nonce(`Rehearsal fault ${code}`);

          app.relay.inject({ event: 'fault', at_us: 1, code, message });
          cp.injected[code] = (cp.injected[code] ?? 0) + 1;

          const shown = await waitFor('the fault', () => textVisible(page, message), SHOWN_MS).catch(() => false);

          cp.shown[code] = (cp.shown[code] ?? 0) + (shown ? 1 : 0);
          cp.cycles += 1;
          cp.hours = (Date.now() - started) / 3_600_000;
          cp.errors = [...app.run.errors];
          save(cp);
        }
      } finally {
        await app.close();
      }

      expect(cp.hours).toBeGreaterThanOrEqual(HOURS);
      expect(FAULT_MATRIX.filter((c) => !cp.injected[c] || cp.shown[c] !== cp.injected[c])).toEqual([]);
      expect(cp.errors).toEqual([]);
    },
    (HOURS + 2) * 3_600_000,
  );
});
