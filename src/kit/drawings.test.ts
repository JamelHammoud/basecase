import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { buildDrawings } from '../sheet/drawings';
import { jsonHash } from '../utils/geometryHash';
import { kitFixture } from './kit.fixtures';
import { buildKit } from './buildKit';

async function prepared() {
  const job = kitFixture();
  const fingerprint = jsonHash({ parts: job.parts, project: job.project });
  const standalone = await buildDrawings({
    parts: job.parts,
    source: { name: job.name, id: 'kit-fixture', fingerprint },
    options: { frame: 'part', plane: 'xy', scale: 0.2 },
  });

  job.designFingerprint = fingerprint;
  job.drawings = { manifest: standalone.manifest, files: unzipSync(standalone.bytes) };

  return { job, standalone };
}

describe('kit mechanical drawings', () => {
  it('includes the standalone sheets, geometry identities and reconciled quantities unchanged', async () => {
    const { job, standalone } = await prepared();
    const files = unzipSync(await buildKit(job));
    const separate = unzipSync(standalone.bytes);
    const manifest = JSON.parse(strFromU8(files['kit.json']));

    expect(manifest.drawings).toEqual(standalone.manifest);

    for (const [name, bytes] of Object.entries(separate)) expect(files[`drawings/${name}`]).toEqual(bytes);
  });

  it('refuses JSON manufacturing evidence when the frozen design has no declarations', async () => {
    const { job } = await prepared();
    const drawing = job.drawings!;
    const saved = JSON.parse(strFromU8(drawing.files['drawings.json']));

    saved.tolerances = { parameters: [], requirements: [], results: [] };
    drawing.files['drawings.json'] = strToU8(JSON.stringify(saved));
    await expect(buildKit(job)).rejects.toThrow(/tolerances/);
  });

  it.each(['quantity', 'identity', 'coverage', 'file', 'source geometry', 'geometry fingerprint', 'geometry bytes'])(
    'refuses mismatched drawing %s instead of shipping an incomplete kit',
    async (fault) => {
      const { job } = await prepared();
      const drawing = job.drawings!;

      if (fault === 'quantity') drawing.manifest.sheets[0].quantity++;

      if (fault === 'identity') drawing.manifest.source.fingerprint = 'stale';

      if (fault === 'coverage') drawing.manifest.sheets.pop();

      if (fault === 'source geometry') job.parts[0].dimensions.width += 2;

      if (fault === 'geometry fingerprint') drawing.manifest.sheets[0].geometryFingerprint = '0'.repeat(64);

      if (fault === 'geometry bytes') drawing.files[drawing.manifest.sheets[0].geometryFile][100] ^= 1;

      if (fault === 'file') delete drawing.files[drawing.manifest.sheets[0].svg];

      await expect(buildKit(job)).rejects.toThrow();
    },
  );
});
