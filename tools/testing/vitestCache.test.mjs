import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cacheFiles, fixture, workspacePair, write } from './vitestCache.fixtures.mjs';

const args = ['run', 'tools/cacheFixture.test.mjs', '--maxWorkers=1'];

function passed(result) {
  expect(result, result.output).toMatchObject({ code: 0 });
  expect(result.output).not.toMatch(/ENOTEMPTY|ENOENT|failed to cache/);
}

describe('linked-worktree invalidation', () => {
  let pair;
  let left;
  let right;
  let config;

  beforeAll(async () => {
    pair = workspacePair();
    [left, right] = pair.dirs;
    await fixture(left, 'left');
    await fixture(right, 'right');
    config = fs.readFileSync(path.join(left, 'vitest.config.ts'), 'utf8');
  });
  afterAll(async () => {
    await pair?.close();
  });

  it('runs concurrent cold starts against distinct source and reuses warm transforms', async () => {
    const cold = await Promise.all(pair.dirs.map((dir) => pair.start(dir, args).done));

    cold.forEach(passed);

    const warm = await Promise.all(pair.dirs.map((dir) => pair.start(dir, args).done));

    warm.forEach(passed);
    expect(warm.every((result) => result.output.includes('[read]'))).toBe(true);
    expect(cacheFiles(left).length).toBeGreaterThan(0);
  });

  it('rejects stale source and literal import.meta.glob expansions after additions and removals', async () => {
    await fixture(left, 'edited', { areas: ['./areas/one.ts', './areas/two.ts'] });
    write(left, 'tools/areas/two.ts', 'export default 2;\n');
    passed(await pair.start(left, args).done);
    await fixture(left, 'edited', { areas: ['./areas/two.ts'] });
    fs.unlinkSync(path.join(left, 'tools/areas/one.ts'));
    passed(await pair.start(left, args).done);
    expect(cacheFiles(left).length).toBeGreaterThan(0);
  });

  it('invalidates configuration transforms and releases ownership after a failed assertion', async () => {
    write(left, 'tools/value.mjs', 'export default CONFIG_VALUE;\n');
    write(
      left,
      'vitest.config.ts',
      config.replace('test: {', "define: { CONFIG_VALUE: JSON.stringify('edited') }, test: {"),
    );
    passed(await pair.start(left, args).done);
    write(
      left,
      'vitest.config.ts',
      config.replace('test: {', "define: { CONFIG_VALUE: JSON.stringify('stale') }, test: {"),
    );
    expect((await pair.start(left, args).done).code).toBe(1);
    expect(cacheFiles(left).some((file) => file.endsWith('.lease'))).toBe(false);
  });

  it('preserves installed-dependency invalidation and recovers after failure', async () => {
    await fixture(left, 'recovered');
    write(left, 'vitest.config.ts', config);
    fs.rmSync(path.join(left, 'tools/areas/two.ts'), { force: true });

    const primed = await Promise.all(pair.dirs.map((dir) => pair.start(dir, args).done));

    primed.forEach(passed);
    write(left, 'node_modules/.package-lock.json', '{"lockfileVersion":3,"name":"changed"}');

    const results = await Promise.all(pair.dirs.map((dir) => pair.start(dir, args).done));

    results.forEach(passed);
    expect(results.every((result) => result.output.includes('cleared because lockfile has changed'))).toBe(true);
    expect(cacheFiles(left).some((file) => file.endsWith('.lease'))).toBe(false);
  });
});

it('runs concurrent check:changed entry points against distinct workspace sources', async () => {
  const pair = workspacePair();
  const check = ['run', 'check:changed', '--', 'tools/cacheFixture.test.mjs', 'tools/value.mjs'];

  try {
    await Promise.all(pair.dirs.map((dir, index) => fixture(dir, `workspace-${index}`)));

    const checks = await Promise.all(pair.dirs.map((dir) => pair.start(dir, check, { npm: true }).done));

    checks.forEach(passed);
    expect(checks.every((result) => result.output.includes('1 passed'))).toBe(true);
  } finally {
    await pair.close();
  }
});

it('clears an owned cache while another runner retains its lease and transforms', async () => {
  const pair = workspacePair();
  const [dir] = pair.dirs;

  try {
    await fixture(dir, 'active');

    const active = pair.start(dir, args, { env: { CACHE_RELEASE: 'release' } });

    await active.ready;
    expect(fs.existsSync(path.join(dir, 'ready'))).toBe(true);
    passed(await pair.start(dir, ['--clearCache']).done);
    write(dir, 'release', 'go');
    passed(await active.done);
    expect(cacheFiles(dir).some((file) => file.endsWith('.lease'))).toBe(false);
  } finally {
    await pair.close();
  }
});

it('owns separate reusable slots for simultaneous cold starts in one worktree', async () => {
  const pair = workspacePair();
  const [dir] = pair.dirs;

  try {
    await fixture(dir, 'same-workspace');

    const results = await Promise.all([pair.start(dir, args).done, pair.start(dir, args).done]);

    results.forEach(passed);
    expect(cacheFiles(dir).some((file) => file.includes(`${path.sep}1${path.sep}modules${path.sep}`))).toBe(true);
    passed(await pair.start(dir, args).done);
    expect(cacheFiles(dir).some((file) => file.endsWith('.lease'))).toBe(false);
  } finally {
    await pair.close();
  }
});

const configurations = [
  ['vitest.config.ts', 'tools/probe.test.mjs'],
  ['vitest.e2e.config.ts', 'e2e/probe.e2e.test.ts'],
  ['vitest.app.config.ts', 'e2e/app/probe.app.test.ts'],
  ['vitest.perf.config.ts', 'src/probe.perf.test.ts'],
  ['vitest.scratch.config.ts', 'scratch/probe.test.mjs'],
  ['verify/vitest.config.ts', 'verify/probe.test.mjs'],
  ['verify/vitest.app.config.ts', 'verify/probe.test.mjs'],
];

it.each(configurations)('uses the cache contract through %s', async (config, target) => {
  const pair = workspacePair();
  const [dir] = pair.dirs;

  try {
    await fixture(dir, config);
    write(dir, 'e2e/serve.ts', 'export default function setup() {}\n');

    const source = fs.readFileSync(path.join(dir, 'tools/cacheFixture.test.mjs'), 'utf8');
    const relative = path.relative(path.dirname(target), 'tools').split(path.sep).join('/') || '.';

    write(
      dir,
      target,
      source
        .replace("'./value.mjs'", `'${relative}/value.mjs'`)
        .replace("'./discovery.ts'", `'${relative}/discovery.ts'`)
        .replace("'./late.mjs'", `'${relative}/late.mjs'`),
    );
    passed(await pair.start(dir, ['run', '--config', config, target, '--maxWorkers=1']).done);

    const cacheConfig = config === 'verify/vitest.app.config.ts' ? 'verify/vitest.config.ts' : config;

    expect(cacheFiles(dir).some((file) => file.includes(`${path.sep}${path.normalize(cacheConfig)}${path.sep}`))).toBe(
      true,
    );
  } finally {
    await pair.close();
  }
});

it('keeps execution and warm reuse intact when another linked worktree is disposed', async () => {
  const pair = workspacePair();
  const [left, right] = pair.dirs;

  try {
    await fixture(left, 'left');
    await fixture(right, 'right');
    passed(await pair.start(left, args).done);

    const active = pair.start(right, args, { env: { CACHE_RELEASE: 'release' } });

    await active.ready;
    expect(fs.existsSync(path.join(right, 'ready'))).toBe(true);
    pair.dispose(left);
    write(right, 'release', 'go');
    passed(await active.done);
    passed(await pair.start(right, args).done);
  } finally {
    await pair.close();
  }
});
