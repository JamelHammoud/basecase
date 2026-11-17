import { boardDigest } from '../wiring/boardNativeContract.mjs';
import { finishBoardFiles, type PreparedBoardExport } from '../wiring/boardRoutingPackage';
import type { BoardNativeResult } from '../wiring/boardRoutingTypes';
import { checkElectricalSize } from '../wiring/electricalSource';
import { jsonHash } from '../utils/geometryHash';
import { KIT_MAX_BYTES } from './limits';
import type { KitJob } from './types';

export interface KitElectricalManifest {
  designFingerprint: string;
  sourceFingerprint: string;
  boardHash: string;
  geometryFingerprint: string;
  partId: string;
  fabrication: 'included' | 'missing';
  manifest: 'electrical/manifest.json';
  manifestHash: string;
}

export interface KitElectrical {
  files: Record<string, Uint8Array<ArrayBuffer>>;
  manifest: KitElectricalManifest;
}

export async function electricalKitFiles(input: {
  prepared: PreparedBoardExport;
  result: BoardNativeResult | null;
  designFingerprint: string;
}): Promise<KitElectrical> {
  checkElectricalSize(input.prepared.files, KIT_MAX_BYTES);
  checkElectricalSize({ ...input.prepared.files, ...input.result?.files }, KIT_MAX_BYTES);

  const files = await finishBoardFiles(input.prepared, input.result);
  const report = JSON.parse(files['requirements.json']);
  const evidence = JSON.parse(files['manifest.json']);

  checkElectricalSize(files, KIT_MAX_BYTES);

  const encoded = Object.fromEntries(
    Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)]),
  );
  const size = Object.values(encoded).reduce((sum, bytes) => sum + bytes.byteLength, 0);

  if (size > KIT_MAX_BYTES) throw new Error('Kit export exceeds 256 MB.');

  return {
    files: encoded,
    manifest: {
      designFingerprint: input.designFingerprint,
      sourceFingerprint: input.prepared.sourceFingerprint,
      boardHash: evidence.boardHash,
      geometryFingerprint: evidence.geometryFingerprint,
      partId: report.board.board.partId,
      fabrication: Object.keys(files).some((path) => path.startsWith('fabrication/')) ? 'included' : 'missing',
      manifest: 'electrical/manifest.json',
      manifestHash: await boardDigest(encoded['manifest.json']),
    },
  };
}

export async function checkedKitElectrical(job: KitJob) {
  const electrical = job.electrical;
  const board = job.project.electronicsBoard;

  if (!board && !electrical) return {};

  if (
    !electrical ||
    !board ||
    electrical.manifest.partId !== board.partId ||
    electrical.manifest.designFingerprint !== jsonHash({ parts: job.parts, project: job.project }) ||
    (await boardDigest(electrical.files['manifest.json'])) !== electrical.manifest.manifestHash
  )
    throw new Error('Prepare electronics from the current kit design.');

  return checkedElectricalFiles(electrical);
}

async function checkedElectricalFiles(electrical: KitElectrical) {
  const evidence = JSON.parse(new TextDecoder().decode(electrical.files['manifest.json']));
  const entries = Object.entries(electrical.files);

  if (
    (await boardDigest(electrical.files['source.json'])) !== evidence.sourceFingerprint ||
    (await boardDigest(electrical.files['robot.kicad_pcb'])) !== evidence.boardHash ||
    evidence.sourceFingerprint !== electrical.manifest.sourceFingerprint ||
    evidence.boardHash !== electrical.manifest.boardHash ||
    evidence.geometryFingerprint !== electrical.manifest.geometryFingerprint ||
    entries.length !== Object.keys(evidence.hashes).length + 1
  )
    throw new Error('Prepare electronics from the current kit design.');

  for (const [path, bytes] of entries) {
    if (!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/u.test(path) || path.split('/').includes('..'))
      throw new Error('Prepare electronics from the current kit design.');

    if (path !== 'manifest.json' && (await boardDigest(bytes)) !== evidence.hashes[path])
      throw new Error('Prepare electronics from the current kit design.');
  }

  return Object.fromEntries(entries.map(([path, bytes]) => [`electrical/${path}`, bytes]));
}
