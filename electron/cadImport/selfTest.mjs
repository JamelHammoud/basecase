import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertFile } from './convertClient.mjs';
import { openCadFile } from './openCadFile.mjs';
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

async function openFixture(converter, fixture) {
  try {
    const bytes = new Uint8Array(fs.readFileSync(fixture.file));
    const { bodies } = await openCadFile(converter, { name: fixture.name, bytes });

    return { bodies };
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

export async function runCadImportSelfTest(converter, spec, onStage = () => {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'basecase-cadimport-'));
  const report = { imports: {}, opens: {}, reach: null, hang: null, memory: null };
  const stage = (running, run) => {
    onStage({ ...report, running });

    return run();
  };

  try {
    for (const fixture of spec.imports) {
      report.imports[fixture.name] = await stage(fixture.name, () => importFixture(converter, { spec, fixture, work }));
    }

    for (const fixture of spec.opens ?? []) {
      report.opens[fixture.name] = await stage(fixture.name, () => openFixture(converter, fixture));
    }

    report.reach = await stage('reach', () =>
      probe(converter, { kind: 'reach', targets: spec.targets, timeoutMs: REACH_MS }),
    );
    report.hang = await stage('hang', () => recovery(converter, { spec, kind: 'hang', timeoutMs: spec.hangMs, work }));
    report.memory = await stage('memory', () =>
      recovery(converter, { spec, kind: 'eatMemory', timeoutMs: spec.memoryMs, work }),
    );

    return report;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

const writeReport = (file, report) => fs.writeFileSync(file, JSON.stringify(report, null, 2));

export async function cadImportSelfTest(kernel, specFile) {
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));

  try {
    const report = await runCadImportSelfTest(kernel, spec, (partial) => writeReport(spec.out, partial));

    writeReport(spec.out, report);
  } finally {
    kernel.stop();
  }
}
