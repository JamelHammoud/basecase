import fs from 'node:fs';
import path from 'node:path';
import { publish } from '../lib/pull.mjs';
import { run } from '../lib/sh.mjs';
import { close, openBranch } from '../lib/worktree.mjs';

const ADAPTERS = ['@agentclientprotocol/claude-agent-acp', '@agentclientprotocol/codex-acp', '@google/gemini-cli'];

const versions = (dir) => {
  const { dependencies = {} } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));

  return ADAPTERS.map((name) => `${name} ${dependencies[name]}`);
};

export default function update({ log }) {
  const worktree = openBranch('update', 'agent-adapters');

  try {
    const before = versions(worktree.dir);

    run('npm', ['install', '--package-lock-only', '--min-release-age=0', ...ADAPTERS.map((name) => `${name}@latest`)], {
      cwd: worktree.dir,
      timeout: 20 * 60 * 1000,
    });

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
        changelog: '',
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
