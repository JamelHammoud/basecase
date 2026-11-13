import { isPaused } from '../lib/github.mjs';
import { nightlyDue } from '../lib/nightly.mjs';
import { json, run } from '../lib/sh.mjs';

export const schedule = {
  slots: 1,
  everySeconds: 900,
  does: "Starts the nightly release when GitHub's schedule skipped it",
};

const lastNightly = () =>
  json('gh', ['run', 'list', '--workflow', 'nightly.yml', '--limit', '1', '--json', 'createdAt'])?.[0]?.createdAt ??
  null;

export default function nightly({ log }) {
  if (isPaused()) return log('paused (LOOP_PAUSED)');

  if (!nightlyDue(new Date(), lastNightly())) return log('the nightly already ran today');

  run('gh', ['workflow', 'run', 'nightly.yml', '--ref', 'main']);
  log("GitHub's schedule skipped the nightly today; started it");
}
