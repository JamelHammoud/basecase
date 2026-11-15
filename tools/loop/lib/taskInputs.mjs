import { availableCapabilities } from './capabilities.mjs';
import { fingerprint } from './sessionJournal.mjs';
import { namedAreas } from './stepAreas.mjs';
import { HOME_CHECKOUT } from './paths.mjs';
import { run } from './sh.mjs';

export function taskInputSignature(step, execute = run) {
  const files = namedAreas(step.body).files;

  if (files.length === 0) return null;

  const paths = [...files, 'AGENTS.md', 'package-lock.json', '.nvmrc'];
  const result = execute('git', ['ls-tree', '-r', 'origin/main', '--', ...paths], {
    cwd: HOME_CHECKOUT,
    allowFail: true,
  });

  if (!result.ok) return null;

  const objects = result.out.split('\n').map((line) => line.split('\t')[1]);
  const identified = files.every((file) => {
    const source = file.replace(/\/$/, '');

    return objects.some((object) => object === source || object?.startsWith(`${source}/`));
  });

  if (!identified) return null;

  return fingerprint({
    body: step.body,
    title: step.title,
    capabilities: availableCapabilities(),
    objects: result.out,
  });
}
