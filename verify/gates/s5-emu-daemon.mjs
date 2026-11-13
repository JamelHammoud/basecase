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
  'numbering_interrupted',
  'daemon_host_death',
  'policy_nan',
  'policy_hang',
  'g1_lowstate_lost',
  'g1_app_lost',
  'ros2_joint_states_lost',
  'ros2_app_lost',
];

const LOOPBACK_ONLY = path.join('hw', 'crates', 'servo-emu', 'src', 'loopback.rs');

function networkProblems() {
  const grep = sh('grep', [
    '-rlE',
    '--include=*.rs',
    'rustdds::|::bind\\(|0\\.0\\.0\\.0|UNSPECIFIED',
    path.join(ROOT, 'hw', 'crates'),
  ]);
  const outside = grep.stdout
    .split('\n')
    .filter((f) => f && !f.includes('transport-real') && !f.endsWith(LOOPBACK_ONLY));
  const loopback = fs.readFileSync(path.join(ROOT, LOOPBACK_ONLY), 'utf8');
  const binds = [...loopback.matchAll(/::bind\(([^)]*)\)/g)].map((m) => m[1]);

  if (outside.length) return `Network use outside the loopback emulator: ${outside.join(', ')}`;

  if (!binds.length || binds.some((b) => !b.includes('LOOPBACK'))) return `The emulator binds ${binds.join(', ')}`;

  return null;
}

const CONFORMANCE = path.join(ROOT, 'verify', 'hw', process.platform === 'darwin' ? 'pty_baud.py' : 'conformance.py');

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
    CONFORMANCE,
    EMU,
    family,
    ...extra,
  ]);

  return r.ok ? pass() : fail((r.stderr || r.stdout).split('\n').slice(-4).join(' '));
};

const caughtFor = (expected, family, extra) => () => {
  const r = conform(family, extra);

  if (r.ok) return r;

  return expected.test(r.detail) ? fail(r.detail) : pass(`Failed for another reason: ${r.detail}`);
};

const passedCount = (stdout) =>
  [...stdout.matchAll(/test result: ok\. (\d+) passed/g)].reduce((n, m) => n + Number(m[1]), 0);

const faultTest = (name) => ({
  name: `fault handled: ${name}`,
  run: () => {
    const r = sh('cargo', ['test', '--release', '--manifest-path', MANIFEST, '--', `fault_${name}`, '--exact']);
    const ran = passedCount(r.stdout);

    if (!r.ok) return fail((r.stderr || r.stdout).split('\n').slice(-6).join('\n'));

    return ran === 1 ? pass() : fail(`Expected exactly one test named fault_${name} to run, ran ${ran}`);
  },
});

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
      name: 'default builds contain no real serial or network transport',
      run: () => {
        const r = sh('cargo', ['tree', '--manifest-path', MANIFEST, '-e', 'normal']);
        const grep = sh('grep', ['-rln', '--include=*.rs', 'serialport::', path.join(ROOT, 'hw')]);
        const outside = grep.stdout.split('\n').filter((f) => f && !f.includes('transport-real'));
        const network = networkProblems();

        if (/\bserialport\b/.test(r.stdout)) return fail('serialport is in the default dependency tree');

        if (/\brustdds\b/.test(r.stdout)) return fail('rustdds is in the default dependency tree');

        if (network) return fail(network);

        return outside.length ? fail(`Serial use outside transport-real: ${outside.join(', ')}`) : pass();
      },
    },
    ...FAULTS.map(faultTest),
  ],
  canaries: [
    {
      name: 'the client catches an emulator with broken checksums',
      run: caughtFor(/'ping', 1/, 'feetech', ['--fault', 'bad-checksum']),
    },
    {
      name: 'the client catches a wrong model number',
      run: caughtFor(/'model', 1201/, 'dynamixel', ['--fault', 'wrong-model']),
    },
    {
      name: 'a fault test that does not exist is caught',
      run: () => faultTest('no_such_fault_planted').run(),
    },
  ],
};
