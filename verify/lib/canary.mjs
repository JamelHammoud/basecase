import fs from 'node:fs';
import path from 'node:path';
import { fail, pass, ROOT, sh } from './gate.mjs';

const OUT = path.join(ROOT, 'verify', 'out', 'canary-reports');

const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const slug = (text) => text.replace(/[^a-z0-9]+/gi, '-').slice(0, 64);

export function canaryVerdict(report, title) {
  const results = (report?.testResults ?? []).flatMap((file) => file.assertionResults ?? []);
  const matching = results.filter((r) => r.title === title);

  if (matching.length !== 1) return { fired: false, why: `Found ${matching.length} tests named “${title}”` };

  const [only] = matching;

  if (only.status !== 'failed') return { fired: false, why: `The planted fault ${only.status}` };

  const crashed = (only.failureMessages ?? []).find((m) => !/^AssertionError/.test(m));

  return crashed ? { fired: false, why: `It crashed instead: ${crashed.split('\n')[0]}` } : { fired: true, why: '' };
}

export function cargoVerdict(r, caught) {
  if (r.ok) return { fired: false, why: 'The planted fault passed' };

  const output = `${r.stdout}\n${r.stderr}`;

  return caught.every((pattern) => pattern.test(output))
    ? { fired: true, why: '' }
    : { fired: false, why: `It failed for another reason: ${output.trim().split('\n').slice(-4).join(' / ')}` };
}

export function cargoCanary(name, args, caught) {
  return {
    name,
    run: () => {
      const verdict = cargoVerdict(sh('cargo', args), caught);

      return verdict.fired ? fail('The check caught the planted fault') : pass(verdict.why);
    },
  };
}

export function vitestCanary(name, file, title) {
  return {
    name,
    run: () => {
      const out = path.join(OUT, `${slug(title)}.json`);

      fs.mkdirSync(OUT, { recursive: true });
      fs.rmSync(out, { force: true });
      sh('npx', [
        'vitest',
        'run',
        '--config',
        'verify/vitest.config.ts',
        file,
        '-t',
        escaped(title),
        '--reporter=json',
        `--outputFile=${out}`,
      ]);

      const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
      const verdict = canaryVerdict(report, title);

      return verdict.fired ? fail('The check caught the planted fault') : pass(verdict.why);
    },
  };
}
