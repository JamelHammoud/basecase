import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('prepares a new League with its creation commit and hands that immutable checkout to replay', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'league-prepare-'));
  const output = path.join(folder, 'snapshot');
  const receipt = path.join(folder, 'outputs');
  const revision = 'a'.repeat(40);
  const fixture = JSON.parse(
    await fs.readFile(new URL('../../public/leagues/rover-sprint/board.json', import.meta.url), 'utf-8'),
  );
  const manifest = { ...fixture.manifest, deadline: '2099-01-01T00:00:00.000Z' };

  try {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./prepare.mjs', import.meta.url)), output], {
      env: {
        ...process.env,
        OPERATION: 'create',
        GITHUB_SHA: revision,
        GITHUB_OUTPUT: receipt,
        LEAGUE_MANIFEST: JSON.stringify(manifest),
      },
      encoding: 'utf-8',
    });

    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(await fs.readFile(path.join(output, 'board.json'), 'utf-8'))).toEqual({
      manifest: { ...manifest, engine: { ...manifest.engine, commit: revision } },
      entries: [],
    });
    expect(await fs.readFile(receipt, 'utf-8')).toBe(`runner=${revision}\n`);
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
});
