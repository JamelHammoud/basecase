import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, ROOT, sh, shCheck } from '../lib/gate.mjs';

const MANIFEST = path.join(ROOT, 'hw', 'Cargo.toml');
const EMU = path.join(ROOT, 'hw', 'target', 'release', 'servo-emu');
const FAULTS = [
  'unplug_mid_packet',
  'brownout_resets_servo',
  'stuck_motor_overload',
  'corrupt_packets',
  'wrong_id_answer',
  'overheat',
  'latency_spike',
  'wrong_direction',
  'duplicate_id',
  'daemon_host_death',
  'policy_nan',
  'policy_hang',
];

const conform = (family, extra = []) => {
  const r = sh('uv', [
    'run',
    '--no-project',
    '--with',
    'feetech-servo-sdk',
    '--with',
    'dynamixel-sdk',
    '--with',
    'pyserial',
    'python',
    path.join(ROOT, 'verify/hw/conformance.py'),
    EMU,
    family,
    ...extra,
  ]);

  return r.ok ? pass() : fail((r.stderr || r.stdout).split('\n').slice(-4).join(' '));
};

const faultTest = (name) =>
  shCheck(`fault handled: ${name}`, 'cargo', [
    'test',
    '--release',
    '--manifest-path',
    MANIFEST,
    '--',
    `fault_${name}`,
    '--exact',
    '--nocapture',
  ]);

export default {
  id: 's5-emu-daemon',
  stage: 5,
  title: 'Servo emulators pass real client libraries; daemon handles the fault matrix',
  state: 'required',
  checks: [
    shCheck('cargo test passes', 'cargo', ['test', '--release', '--manifest-path', MANIFEST]),
    shCheck('tools build', 'cargo', ['build', '--release', '--manifest-path', MANIFEST]),
    { name: 'Feetech SDK, unmodified, works against the emulator', run: () => conform('feetech') },
    { name: 'Dynamixel SDK, unmodified, works against the emulator', run: () => conform('dynamixel') },
    {
      name: 'every emulated behaviour has a source in the ledger',
      run: () => {
        const file = path.join(ROOT, 'hw', 'emu', 'ledger.yaml');

        if (!fs.existsSync(file)) return fail('No ledger');

        const text = fs.readFileSync(file, 'utf8');
        const sources = [...text.matchAll(/source:\s*(\S+)/g)].map((m) => m[1]);
        const bad = sources.filter((s) => !['datasheet', 'client-derived', 'community', 'assumed'].includes(s));

        return sources.length >= 20 && !bad.length
          ? pass(`${sources.length} entries`)
          : fail(`${sources.length} entries, bad: ${bad}`);
      },
    },
    {
      name: 'default builds contain no real serial transport',
      run: () => {
        const r = sh('cargo', ['tree', '--manifest-path', MANIFEST, '-e', 'normal']);
        const grep = sh('grep', ['-rln', '--include=*.rs', 'serialport::', path.join(ROOT, 'hw')]);
        const outside = grep.stdout.split('\n').filter((f) => f && !f.includes('transport-real'));

        if (/\bserialport\b/.test(r.stdout)) return fail('serialport is in the default dependency tree');

        return outside.length ? fail(`Serial use outside transport-real: ${outside.join(', ')}`) : pass();
      },
    },
    ...FAULTS.map(faultTest),
  ],
  canaries: [
    {
      name: 'the client catches an emulator with broken checksums',
      run: () => conform('feetech', ['--fault', 'bad-checksum']),
    },
    { name: 'the client catches a wrong model number', run: () => conform('dynamixel', ['--fault', 'wrong-model']) },
  ],
};
