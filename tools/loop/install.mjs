import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOME_CHECKOUT, HOME_REF, LOGS } from './lib/paths.mjs';
import { run } from './lib/sh.mjs';

const MINUTE = 60;
const HOUR = 60 * MINUTE;

const slots = (lane, count, every = MINUTE) =>
  Array.from({ length: count }, (_, i) => ({ lane, slot: String(i + 1), every }));

const JOBS = [
  ...slots('review', 2),
  ...slots('merge', 1),
  ...slots('rebase', 1),
  ...slots('repair', 1),
  ...slots('revise', 2),
  ...slots('build', 5),
  ...slots('refine', 2),
  ...slots('lead', 1),
  { lane: 'update', slot: '1', every: 24 * HOUR },
];

const AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const DOMAIN = `gui/${os.userInfo().uid}`;
const label = ({ lane, slot }) => `so.basecase.loop.${lane}-${slot}`;
const KEEP_AWAKE = 'so.basecase.loop.awake';

const where = (tool) => path.dirname(run('which', [tool]).out);

const searchPath = () =>
  [
    ...new Set([
      path.dirname(process.execPath),
      where('claude'),
      where('gh'),
      where('git'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ]),
  ].join(':');

const xml = (value, indent = '  ') => {
  if (Array.isArray(value))
    return `<array>${value.map((v) => `\n${indent}  ${xml(v, `${indent}  `)}`).join('')}\n${indent}</array>`;

  if (typeof value === 'object') {
    const entries = Object.entries(value).map(
      ([k, v]) => `\n${indent}  <key>${k}</key>\n${indent}  ${xml(v, `${indent}  `)}`,
    );

    return `<dict>${entries.join('')}\n${indent}</dict>`;
  }

  if (typeof value === 'boolean') return value ? '<true/>' : '<false/>';

  if (typeof value === 'number') return `<integer>${value}</integer>`;

  return `<string>${String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</string>`;
};

const plist = (dict) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${xml(dict, '')}\n</plist>\n`;

const laneDict = (job, env) => ({
  Label: label(job),
  ProgramArguments: [process.execPath, path.join(HOME_CHECKOUT, 'tools', 'loop', 'run.mjs'), job.lane, job.slot],
  WorkingDirectory: HOME_CHECKOUT,
  StartInterval: job.every,
  RunAtLoad: true,
  EnvironmentVariables: env,
  StandardOutPath: path.join(LOGS, `launchd-${label(job)}.log`),
  StandardErrorPath: path.join(LOGS, `launchd-${label(job)}.log`),
});

const awakeDict = () => ({
  Label: KEEP_AWAKE,
  ProgramArguments: ['/usr/bin/caffeinate', '-i', '-s'],
  KeepAlive: true,
  RunAtLoad: true,
});

const load = (name, dict) => {
  const file = path.join(AGENTS_DIR, `${name}.plist`);

  fs.writeFileSync(file, plist(dict));
  run('launchctl', ['bootout', `${DOMAIN}/${name}`], { allowFail: true });

  for (let attempt = 1; attempt <= 5; attempt++) {
    if (run('launchctl', ['bootstrap', DOMAIN, file], { allowFail: true }).ok) return;

    run('sleep', [String(attempt)]);
  }

  throw new Error(`launchctl couldn't load ${name}`);
};

const LABELS = {
  'loop:feature': '0d99ff',
  'loop:integration': '0d99ff',
  'loop:refine': '2da44e',
  'loop:fix': 'd1242f',
  'loop:repair': 'd1242f',
  'loop:lesson': '8250df',
  'loop:loop': '6e7781',
  'loop:update': '6e7781',
  'loop:priority': 'd1242f',
  'loop:request': '000000',
  'loop:stuck': '6e7781',
  'loop:arc': 'bf8700',
  'loop:next': 'bf8700',
  'loop:building': 'bf8700',
  'loop:direction': '000000',
};

function ensureLabels() {
  for (const [name, color] of Object.entries(LABELS)) {
    run('gh', ['label', 'create', name, '--color', color, '--force'], { allowFail: true });
  }
}

function ensureHome() {
  if (fs.existsSync(HOME_CHECKOUT)) return;

  run('git', ['fetch', '-q', 'origin', 'main', HOME_REF]);
  run('git', ['worktree', 'add', '-q', '--detach', HOME_CHECKOUT, `origin/${HOME_REF}`]);
  run('npm', ['ci', '--no-audit', '--no-fund'], {
    cwd: HOME_CHECKOUT,
    timeout: 30 * 60 * 1000,
    env: { ELECTRON_SKIP_BINARY_DOWNLOAD: '1' },
  });
}

function install() {
  ensureHome();
  ensureLabels();
  fs.mkdirSync(AGENTS_DIR, { recursive: true });
  removeAll();
  fs.mkdirSync(LOGS, { recursive: true });

  const env = {
    PATH: searchPath(),
    HOME: os.homedir(),
    CLAUDE_BIN: run('which', ['claude']).out,
    BASECASE_LOOP_REF: HOME_REF,
  };

  for (const job of JOBS) load(label(job), laneDict(job, env));

  load(KEEP_AWAKE, awakeDict());
  console.log(`Loaded ${JOBS.length} lanes and the keep-awake job. Logs: ${LOGS}`);
}

const installedNames = () =>
  fs.existsSync(AGENTS_DIR)
    ? fs
        .readdirSync(AGENTS_DIR)
        .filter((file) => file.startsWith('so.basecase.loop.') && file.endsWith('.plist'))
        .map((file) => file.slice(0, -'.plist'.length))
    : [];

function removeAll() {
  for (const name of installedNames()) {
    run('launchctl', ['bootout', `${DOMAIN}/${name}`], { allowFail: true });
    fs.rmSync(path.join(AGENTS_DIR, `${name}.plist`), { force: true });
  }
}

function uninstall() {
  removeAll();

  console.log('Removed every loop job.');
}

const command = process.argv[2];

if (command === 'install') install();
else if (command === 'uninstall') uninstall();
else console.log('Usage: node tools/loop/install.mjs <install|uninstall>');
