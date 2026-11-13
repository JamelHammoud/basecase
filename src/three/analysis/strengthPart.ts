import * as THREE from 'three';
import { poseScore } from '../../print/plan';
import { LAYERED, printFill, type V3 } from '../../strength/material';
import { solveStrength } from '../../strength/solve';
import type { ScrewLine, StrengthJob, StrengthReading } from '../../strength/types';
import { sameDirection } from '../printability';
import { printReportOf } from './shapeReports';
import type { ShapeSolid } from './shapeSolid';

const MAX_CACHED = 200;
const cache = new Map<string, StrengthReading | null>();

const toLocal = (inverse: THREE.Matrix4, p: V3) => new THREE.Vector3(...p).applyMatrix4(inverse).toArray() as V3;

const lineToLocal = (inverse: THREE.Matrix4) => (line: ScrewLine) => ({
  from: toLocal(inverse, line.from),
  to: toLocal(inverse, line.to),
  radius: line.radius,
});

function directionToLocal(inverse: THREE.Matrix4, v: V3): V3 {
  const d = new THREE.Vector3(...v).transformDirection(inverse);

  return d.toArray() as V3;
}

function candidateDowns(solid: ShapeSolid, down?: V3): { chosen: V3; downs: V3[] } {
  const poses = printReportOf(solid, down ? [down] : []).check?.poses ?? [];
  const usual = poses.filter((p) => !p.requested);
  const picked = down
    ? poses.find((p) => sameDirection(p.down, down))
    : usual.reduce<(typeof usual)[number] | undefined>(
        (best, p) => (!best || poseScore(p, true) < poseScore(best, true) ? p : best),
        undefined,
      );
  const chosen = picked?.down ?? down ?? [0, -1, 0];

  return { chosen, downs: usual.map((p) => p.down) };
}

const negate = (v: V3): V3 => [-v[0], -v[1], -v[2]];

function solveJob(solid: ShapeSolid, world: THREE.Matrix4, job: StrengthJob): StrengthReading | null {
  const material = LAYERED[job.material];

  if (!material) return null;

  const inverse = world.clone().invert();
  const local = lineToLocal(inverse);
  const { chosen, downs } = candidateDowns(solid, job.down);
  const started = performance.now();
  const result = solveStrength({
    tris: solid.positions,
    material,
    fill: printFill(job.infillPct),
    normal: negate(chosen),
    normals: downs.map(negate),
    load: {
      origin: toLocal(inverse, job.load.origin),
      axis: directionToLocal(inverse, job.load.axis),
      torqueNmm: job.load.torqueNmm,
      screws: job.load.screws.map(local),
    },
    holds: job.holds.map(local),
  });

  if (!result) return null;

  const bestAt = result.factors.reduce((best, f, i) => (f > result.factors[best] ? i : best), 0);
  const best = downs.length
    ? { down: downs[bestAt], factor: result.factors[bestAt] }
    : { down: chosen, factor: result.factor };

  return {
    key: job.key,
    part: job.part,
    factor: result.factor,
    down: chosen,
    best,
    worst: new THREE.Vector3(...result.worst).applyMatrix4(world).toArray() as V3,
    cells: result.cells,
    ms: performance.now() - started,
    field: result.field,
  };
}

const copyOf = (r: StrengthReading, key: string, ms: number): StrengthReading => ({
  ...r,
  key,
  ms,
  field: { ...r.field, cells: r.field.cells.slice(), ratio: r.field.ratio.slice() },
});

export function strengthOf(solid: ShapeSolid, shapeKey: string, matrix: number[], job: StrengthJob) {
  const key = `${shapeKey}|${matrix.map((v) => v.toFixed(4)).join(',')}|${JSON.stringify({ ...job, key: '' })}`;
  const known = cache.get(key);

  if (known !== undefined) return known && copyOf(known, job.key, 0);

  if (cache.size > MAX_CACHED) cache.clear();

  const reading = solveJob(solid, new THREE.Matrix4().fromArray(matrix), job);

  cache.set(key, reading);

  return reading && copyOf(reading, job.key, reading.ms);
}
