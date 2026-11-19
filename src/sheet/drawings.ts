import { drawingToleranceEvidence, authoredDrawingDimensions, toleranceDocuments } from './drawingTolerances';
import { strToU8, zipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { drawingStl, bytesFingerprint } from './drawingStl';
import { drawingQuantity } from './drawingQuantity';
import { registerSourced } from '../data/sourcedItems';
import { detectSheet } from './detectSheet';
import { matchingDrawingSketch } from './drawingAuthored';
import { jsonHash } from '../utils/geometryHash';
import { checkedPrice } from '../utils/onHand';
import { boughtKey, isStandIn, isPrinted, printMaterialOf } from '../utils/bom';
import { lineIdentity } from '../utils/purchaseIdentity';
import { drawingPart } from './drawingGeometry';
import { drawingFeatures } from './drawingFeatures';
import { drawingViews } from './drawingProjection';
import { drawingReferences } from './drawingReferences';
import { drawingDocument, holeDocuments } from './drawingDocument';
import { drawingPdf, drawingSvg } from './drawingWriters';
import { DRAWING_LIMITS, type DrawingJob, type DrawingManifest, type DrawingSheet } from './drawingTypes';

export async function geometryFingerprint(triangles: Float32Array): Promise<string> {
  const bytes = new Uint8Array(triangles.byteLength);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < triangles.length; i++) view.setFloat32(i * 4, triangles[i] === 0 ? 0 : triangles[i], true);

  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

  return Array.from(hash, (n) => n.toString(16).padStart(2, '0')).join('');
}

function checkedJob(job: DrawingJob) {
  if ([job.source.name, job.source.id, ...job.parts.map((part) => part.name)].some((name) => name.length > 256))
    throw new Error('Use at most 256 characters in drawing names.');

  if (!job.parts.length || job.parts.length > DRAWING_LIMITS.parts)
    throw new Error('Choose up to 256 parts for drawings.');

  if (
    !['part', 'scene'].includes(job.options.frame) ||
    !['xy', 'xz', 'yz'].includes(job.options.plane) ||
    ![0.1, 0.2, 0.5, 1, 2].includes(job.options.scale)
  )
    throw new Error('Choose a projection frame and drawing scale.');
}

function eligible(part: DrawingJob['parts'][number]) {
  return part.role === 'solid' && part.visible && part.kind !== 'image_plane';
}

function checkFabricated(part: DrawingJob['parts'][number]) {
  if (isStandIn(part) || part.mechanicalTag === 'Off-the-shelf COTS')
    throw new Error(`${part.name}: choose a fabricated solid or an exact catalog part for drawings.`);
}

function projectionIdentity(part: DrawingJob['parts'][number], job: DrawingJob) {
  return job.options.frame === 'scene' ? part.rotation.join(',') : '';
}

function materialOf(part: DrawingJob['parts'][number], triangles: Float32Array, job: DrawingJob) {
  const sheet = part.sheet;

  if (
    sheet &&
    (!Number.isFinite(sheet.thicknessMm) ||
      sheet.thicknessMm <= 0 ||
      Math.abs((detectSheet(triangles)?.thicknessMm ?? Infinity) - sheet.thicknessMm) > DRAWING_LIMITS.toleranceMm)
  )
    throw new Error(`${part.name}: measure the current sheet thickness before exporting drawings.`);

  return part.sheet?.material ?? part.printMaterial ?? declaredMaterial(part, job);
}

function declaredMaterial(part: DrawingJob['parts'][number], job: DrawingJob) {
  if (part.mechanicalTag === 'CNC Aluminum') return 'Aluminum';

  if (part.mechanicalTag === 'TPU Flexible') return 'TPU';

  const project = job.sourceSnapshot?.project;

  return project && isPrinted(part) ? printMaterialOf(part, project) : null;
}

function checkPrepared(manifest: DrawingManifest) {
  if (!manifest.sheets.length && !manifest.references.length)
    throw new Error('Select a visible solid before exporting drawings.');
}

async function prepareDrawingGeometry(job: DrawingJob) {
  checkedJob(job);
  registerSourced(job.sourceSnapshot?.project.sourced ?? []);

  const manifest: DrawingManifest = {
    format: 'basecase-mechanical-drawings',
    schema: 1,
    source: { ...job.source, fingerprint: job.sourceSnapshot ? jsonHash(job.sourceSnapshot) : job.source.fingerprint },
    numericalToleranceMm: DRAWING_LIMITS.toleranceMm,
    circleChordToleranceMm: DRAWING_LIMITS.chordMm,
    sheets: [],
    references: [],
    ...(job.sourceSnapshot ? { tolerances: drawingToleranceEvidence(job.sourceSnapshot) } : {}),
  };
  const geometryFiles: Record<string, Uint8Array> = {};
  const metrics = { projectionMs: 0, prepareMs: 0, layoutMs: 0 };
  const started = performance.now();
  const shared = new Map<string, DrawingSheet>();
  let totalTriangles = 0;
  let totalLines = 0;

  for (const part of job.parts) {
    if (!eligible(part)) continue;

    const bought = boughtKey(part);

    if (bought) {
      manifest.references.push({
        partId: part.id,
        key: bought,
        identity: lineIdentity(bought, checkedPrice(job.purchases?.[bought])),
      });

      continue;
    }

    checkFabricated(part);

    const prepared = drawingPart(part, job.options);

    totalTriangles += prepared.triangles.length / 9;

    if (totalTriangles > DRAWING_LIMITS.totalTriangles)
      throw new Error('Reduce drawings to at most 250,000 triangles.');

    const fingerprint = await geometryFingerprint(prepared.sourceTriangles);
    const material = materialOf(part, prepared.sourceTriangles, job);
    const projectionKey = projectionIdentity(part, job);
    const authoredDimensions = authoredDrawingDimensions(part, job.sourceSnapshot?.project);
    const key = `${fingerprint}|${material ?? ''}|${projectionKey}|${JSON.stringify(authoredDimensions)}`;
    const quantity = drawingQuantity(part);
    const existing = shared.get(key);

    if (existing) {
      existing.partIds.push(part.id);
      existing.quantity += quantity;

      continue;
    }

    const id = `drawing-${manifest.sheets.length + 1}`;
    const projectionStart = performance.now();
    const views = drawingViews(prepared.triangles);

    metrics.projectionMs += performance.now() - projectionStart;

    const stl = drawingStl(prepared.sourceTriangles, fingerprint);

    geometryFiles[`${id}.stl`] = stl;

    const sheet: DrawingSheet = {
      id,
      svg: `${id}.svg`,
      partIds: [part.id],
      name: part.name,
      quantity,
      material,
      geometryFingerprint: fingerprint,
      geometryFile: `${id}.stl`,
      geometryFileFingerprint: await bytesFingerprint(stl),
      geometryFrame: 'Z-up',
      projectionMatrix: prepared.projectionMatrix,
      units: 'mm',
      scale: job.options.scale,
      frame: job.options,
      datum: prepared.datum,
      extents: prepared.extents,
      ...drawingFeatures(prepared.triangles),
      ...(authoredDimensions.length ? { authoredDimensions } : {}),
      authoredSketch: matchingDrawingSketch(part, prepared.sourceTriangles),
      views,
    };

    totalLines += sheet.views.reduce((count, view) => count + view.lines.length, 0);

    if (totalLines > DRAWING_LIMITS.lines * 3) throw new Error('Reduce drawings to at most 36,000 projected edges.');

    shared.set(key, sheet);
    manifest.sheets.push(sheet);
  }

  checkPrepared(manifest);

  metrics.prepareMs = performance.now() - started;

  return { manifest, geometryFiles, metrics };
}

export function drawingFiles(manifest: DrawingManifest, geometryFiles: Record<string, Uint8Array>) {
  const files: Record<string, Uint8Array> = { ...geometryFiles };
  const documents = manifest.sheets.map((sheet) => [
    drawingDocument(sheet, manifest),
    ...holeDocuments(sheet, manifest),
    ...toleranceDocuments(sheet, manifest),
  ]);

  manifest.sheets.forEach((sheet, index) => {
    files[sheet.svg] = strToU8(drawingSvg(documents[index]));
  });

  const references = drawingReferences(manifest);

  if (references.length) files['references.svg'] = strToU8(drawingSvg(references));

  files['drawings.pdf'] = drawingPdf([...documents.flat(), ...references]);
  files['drawings.json'] = strToU8(JSON.stringify(manifest));

  if (Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0) > DRAWING_LIMITS.bytes)
    throw new Error('Reduce drawings to at most 64 MB.');

  return files;
}

export async function prepareDrawings(job: DrawingJob): Promise<DrawingManifest> {
  return (await prepareDrawingGeometry(job)).manifest;
}

export async function prepareDrawingFiles(job: DrawingJob) {
  const { manifest, geometryFiles, metrics } = await prepareDrawingGeometry(job);
  const start = performance.now();
  const files = drawingFiles(manifest, geometryFiles);

  metrics.layoutMs = performance.now() - start;

  return { manifest, files, metrics };
}

export async function buildDrawings(job: DrawingJob) {
  const { manifest, files, metrics } = await prepareDrawingFiles(job);
  const start = performance.now();
  const bytes = zipSync(files, { level: 6 });

  return { manifest, bytes, metrics: { ...metrics, compressionMs: performance.now() - start } };
}
