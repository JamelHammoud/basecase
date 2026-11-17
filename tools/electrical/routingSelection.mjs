import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function needsRouting(files, event) {
  if (event !== 'pull_request') return true;

  const affected =
    /^(src\/wiring\/(board|electrical(Package|Fixtures|Source|Robots))|electron\/electrical\/|tools\/electrical\/(route|routing|installRouter|boardFixtures|expected|copperCheck)|src\/workspace\/useBoardRouting|e2e\/boardRouting|\.github\/workflows\/(electrical|check)\.yml$|package(-lock)?\.json$)/u;

  return files.some((file) => affected.test(file));
}

if (process.argv[1] === import.meta.filename) {
  const files =
    process.env.GITHUB_EVENT_NAME === 'pull_request'
      ? execFileSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], { encoding: 'utf8' }).trim().split('\n')
      : [];
  const needed = needsRouting(files, process.env.GITHUB_EVENT_NAME);

  fs.appendFileSync(process.env.GITHUB_OUTPUT, `needed=${needed}\n`);
}
