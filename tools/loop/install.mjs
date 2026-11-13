import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOME_CHECKOUT, HOME_REF, LOGS } from './lib/paths.mjs';
import { run } from './lib/sh.mjs';

const MINUTE = 60;
const HOUR = 60 * MINUTE;

const JOBS = [
  { lane: 'review', every: 2 * MINUTE },
  { lane: 'merge', every: 5 * MINUTE },
  { lane: 'rebase', every: 10 * MINUTE },
  { lane: 'repair', every: 15 * MINUTE },
  { lane: 'build', slot: '1', every: 5 * MINUTE },
  { lane: 'build', slot: '2', every: 5 * MINUTE },
  { lane: 'build', slot: '3', every: 5 * MINUTE },
  { lane: 'refine', every: 6 * HOUR },
  { lane: 'lead', every: 4 * HOUR },
  { lane: 'update', every: 24 * HOUR },
  { lane: 'learn', every: 24 * HOUR },
  { lane: 'digest', every: 24 * HOUR },
  { lane: 'tidy', every: HOUR },
];

const AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const DOMAIN = `gui/${os.userInfo().uid}`;
const label = ({ lane, slot }) => `so.basecase.loop.${lane}${slot ? `-${slot}` : ''}`;
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
  ProgramArguments: [process.execPath, path.join(HOME_CHECKOUT, 'tools', 'loop', 'run.mjs'), job.lane, job.slot ?? '1'],
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
  run('launchctl', ['bootstrap', DOMAIN, file]);
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
  'loop:digest': '6e7781',
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

function uninstall() {
  for (const name of [...JOBS.map(label), KEEP_AWAKE]) {
    run('launchctl', ['bootout', `${DOMAIN}/${name}`], { allowFail: true });
    fs.rmSync(path.join(AGENTS_DIR, `${name}.plist`), { force: true });
  }

  console.log('Removed every loop job.');
}

const command = process.argv[2];

if (command === 'install') install();
else if (command === 'uninstall') uninstall();
else console.log('Usage: node tools/loop/install.mjs <install|uninstall>');
