import fs from 'node:fs';
import path from 'node:path';
import { openPulls } from '../lib/github.mjs';
import { publish } from '../lib/pull.mjs';
import { run } from '../lib/sh.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 24 * 60 * 60,
  does: 'Moves the agent adapters to their latest releases',
};

const CLAUDE_ADAPTER = '@agentclientprotocol/claude-agent-acp';
const CLAUDE_SDK = '@anthropic-ai/claude-agent-sdk';
const ADAPTERS = [CLAUDE_ADAPTER, '@agentclientprotocol/codex-acp', '@google/gemini-cli'];

const versions = (dir) => {
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));

  return ADAPTERS.map((name) => `${name} ${dependencies[name]}`);
};

const pinnedSdk = (dir) => {
  const lock = JSON.parse(fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'));

  return lock.packages[`node_modules/${CLAUDE_ADAPTER}`].dependencies[CLAUDE_SDK];
};

const lockInstall = (dir, args) =>
  run('npm', ['install', '--package-lock-only', '--min-release-age=0', ...args], {
    cwd: dir,
    timeout: 20 * 60 * 1000,
  });

export default function update({ log }) {
  const open = openPulls().find((pull) => pull.headRefName.startsWith('loop/update/'));

  if (open) {
    log(`#${open.number} is already open`);

    return;
  }

  const worktree = openBranch('update', 'agent-adapters');

  try {
    const before = versions(worktree.dir);

    lockInstall(
      worktree.dir,
      ADAPTERS.map((name) => `${name}@latest`),
    );
    lockInstall(worktree.dir, ['--save-dev', '--save-exact', `${CLAUDE_SDK}@${pinnedSdk(worktree.dir)}`]);

    const after = versions(worktree.dir);
    const moved = after.filter((line, i) => line !== before[i]);

    if (moved.length === 0) {
      log('the agent adapters are current');

      return;
    }

    const url = publish(
      {
        changed: true,
        kind: 'update',
        title: 'Move the agent adapters to their latest releases',
        summary: moved.map((line) => `- \`${line}\``).join('\n'),
        why: 'A new model reaches the Model menu only through a newer adapter, since the list comes from the CLI the adapter pins (§9).',
        cause: '',
        checked: 'CI runs Check, e2e and the packaged app on this pull request.',
        screenshots: [],
        commitMessage: `Move the agent adapters to their latest releases\n\n${moved.join('\n')}`,
      },
      worktree,
    );

    log(`opened ${url}`);
  } finally {
    close(worktree);
  }
}
