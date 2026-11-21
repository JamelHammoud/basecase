import type { ScenePart } from '../types/robotics';
import { geometryWorker } from '../three/geometryWorker';
import { prepareSupportJob } from '../utils/sketch/supportJob';
import { applySketchSupportResults } from './sketchSupportResults';
import { docFromParts } from './docHistory';

export async function sketchSupportMeasurements(parts: ScenePart[]) {
  const started = performance.now();
  const job = prepareSupportJob(parts);
  const preparationMs = performance.now() - started;

  if (!job?.bounded) return null;

  const workerStart = performance.now();
  const result = await geometryWorker.call('sketchSupports', { parts: job.parts, force: job.force });
  const roundTripMs = performance.now() - workerStart;
  const commitStart = performance.now();
  const next = applySketchSupportResults(docFromParts(parts), parts, result.updated);
  const commitMs = performance.now() - commitStart;

  return {
    preparationMs,
    workerMs: result.workerMs,
    roundTripMs,
    commitMs,
    prepared: result.prepared,
    geometryBytes: result.geometryBytes,
    inputBytes: new TextEncoder().encode(JSON.stringify(job.parts)).byteLength,
    retainedResultBytes: new TextEncoder().encode(JSON.stringify(result.updated)).byteLength,
    updated: result.updated.length,
    failures: result.failures,
    partCount: next.parts.length,
  };
}
