import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertFile } from './convertClient.mjs';
import { decodeReply } from './reply.mjs';

const REACH_MS = 300_000;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function importFixture(converter, { spec, fixture, work }) {
  const dir = fs.mkdtempSync(path.join(work, 'import-'));
  const file = path.join(dir, 'source.cad');
  const out = path.join(dir, 'mesh.glb');

  fs.copyFileSync(fixture.file, file);

  try {
    const result = await convertFile(converter, { id: spec.partId, url: spec.url, file, out, ext: fixture.ext });

    return { sha256: sha256(fs.readFileSync(out)), result };
  } catch (err) {
    return { error: String(err?.message ?? err) };
  }
}

async function probe(converter, { kind, targets, timeoutMs }) {
  const started = Date.now();
  const { header } = decodeReply(await converter.probeConverter({ kind, targets }, timeoutMs));

  return { ...header, ms: Date.now() - started };
}

async function recovery(converter, { spec, kind, timeoutMs, work }) {
  if (!timeoutMs) return null;

  const stopped = await probe(converter, { kind, timeoutMs });
  const next = await importFixture(converter, { spec, fixture: spec.imports[0], work });

  return { stopped, next };
}

export async function runCadImportSelfTest(converter, spec) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-cadimport-'));
  const imports = {};

  try {
    for (const fixture of spec.imports) imports[fixture.name] = await importFixture(converter, { spec, fixture, work });

    const reach = await probe(converter, { kind: 'reach', targets: spec.targets, timeoutMs: REACH_MS });
    const hang = await recovery(converter, { spec, kind: 'hang', timeoutMs: spec.hangMs, work });
    const memory = await recovery(converter, { spec, kind: 'eatMemory', timeoutMs: spec.memoryMs, work });

    return { imports, reach, hang, memory };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export async function cadImportSelfTest(kernel, specFile) {
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

  try {
    fs.writeFileSync(spec.out, JSON.stringify(await runCadImportSelfTest(kernel, spec), null, 2));
  } finally {
    kernel.stop();
  }
}
