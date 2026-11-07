import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { afterEach, describe, expect, it } from 'vitest';
import { convertFile } from './convertClient.mjs';
import { sourceBytes } from './convertCore.mjs';
import { createNodeConverter } from './nodeHost/client.mjs';
import { decodeReply } from './reply.mjs';

const FIXTURES = path.resolve('verify', 'fixtures', 'cadimport');
const expected = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'expected.json'), 'utf8'));
const converter = createNodeConverter();
const dirs = [];

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function workDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadimport-test-'));

  dirs.push(dir);

  return dir;
}

async function convertFixture(name, ext) {
  const dir = workDir();
  const file = path.join(dir, 'source.cad');
  const out = path.join(dir, 'mesh.glb');

  fs.copyFileSync(path.join(FIXTURES, name), file);

  const result = await convertFile(converter, {
    id: 'fixture-plate',
    url: 'https://example.com/plate',
    file,
    out,
    ext,
  });

  return { result, glb: fs.readFileSync(out), files: fs.readdirSync(dir).sort() };
}

function claimSize(zip, entryName, bytes) {
  const patched = Uint8Array.from(zip);
  const view = new DataView(patched.buffer);
  const name = new TextEncoder().encode(entryName);

  for (let at = 0; at + 46 < patched.length; at++) {
    const matches = view.getUint32(at, true) === 0x02014b50 && name.every((b, i) => patched[at + 46 + i] === b);

    if (matches) view.setUint32(at + 24, bytes, true);
  }

  return patched;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('CAD import converter', () => {
  it('converts a STEP and a zip of it to the same GLB bytes as before the sandbox', async () => {
    for (const [name, ext] of [
      ['plate.step', '.step'],
      ['plate.zip', '.zip'],
    ]) {
      const { result, glb, files } = await convertFixture(name, ext);

      expect(sha(glb), name).toBe(expected[name].sha256);
      expect(result.size).toEqual(expected[name].result.size);
      expect(result.holes).toEqual(expected[name].result.holes);
      expect(result.members).toEqual(expected[name].result.members);
      expect(files).toEqual(['mesh.glb', 'source.cad']);
    }
  });

  it('refuses an STL as it did before', async () => {
    await expect(convertFixture('tetra.stl', '.stl')).rejects.toThrow(expected['tetra.stl'].error);
  });

  it('stops a parse that never returns', async () => {
    const started = Date.now();
    const { header } = decodeReply(await converter.probeConverter({ kind: 'hang' }, 1000));

    expect(header.error).toMatch(/took too long/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('refuses a zip that claims to unpack past 600 MB before unpacking it', () => {
    const zip = zipSync({ 'cad/part.step': strToU8('ISO-10303-21;') });

    expect(() => sourceBytes({ bytes: claimSize(zip, 'cad/part.step', 700_000_000) })).toThrow(/more than 600 MB/);
  });

  it('treats zip entry names as data, never as paths', () => {
    const zip = zipSync({ '../../../escape.step': strToU8('ISO-10303-21;'), 'notes.txt': strToU8('x') });
    const { names, ext } = sourceBytes({ bytes: zip });

    expect(names).toEqual(['../../../escape.step']);
    expect(ext).toBe('.step');
  });
});
