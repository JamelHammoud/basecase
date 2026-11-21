import * as THREE from 'three';
import { fastenerInput } from '../assembly/fastenerSpec';
import { traceFasteners } from '../assembly/fastenerChain';
import type { GuidePlan } from '../guide/guideTypes';
import type { PrinterSetup } from '../data/printers';
import type { GeometryPayload, ShapeSpec, Instance } from '../three/analysis/analysisOps';
import { mergeMeshes, ShapeSolid } from '../three/analysis/shapeSolid';
import { place } from '../three/analysis/collide';
import { checkPrintability, PRINT_RULES } from '../three/printability';
import { measureTriangles } from '../three/meshMeasure';
import type { ProjectSettings, ScenePart } from '../types/robotics';
import { reportFromShapes } from '../utils/printReport';
import { loadManifold } from '../wrap/manifold';
import { makeCradle } from './cradle';
import { checkCradleAccess, transformCradleSoup } from './cradleAccess';
import { CradleError, type CradleInput, type CradleIdentity } from './cradleTypes';
import { rigidCradleSelection } from './cradleSelection';
import { unresolvedCradleSources } from './cradleSourceState';

export interface CradleJob {
  sessionId: number;
  geometries: GeometryPayload[];
  shapes: ShapeSpec[];
  instances: Instance[];
  ids: string[];
  options: Omit<CradleInput, 'sources'>;
  parts: ScenePart[];
  project: ProjectSettings;
  printer: PrinterSetup;
  plan: GuidePlan;
  step: number;
  sceneId: string;
  fingerprint: string;
}

function driverRequests(job: CradleJob, placed: ReturnType<typeof place>[]) {
  const step = job.plan.steps[job.step];
  const tools = step.tools.map((id) => job.plan.tools.find((tool) => tool.id === id));

  if (tools.some((tool) => !tool || !['hex-key', 'torx', 'screwdriver', 'flat-screwdriver'].includes(tool.icon)))
    throw new CradleError('tool');

  const input = fastenerInput(job.parts);
  const chains = traceFasteners(placed, input).screws.filter((chain) => step.partIds.includes(chain.id));
  const screws = input.specs.filter((spec) => spec.kind === 'screw' && step.partIds.includes(spec.id));

  if (screws.length !== chains.length || (tools.length > 0 && !chains.length)) throw new CradleError('tool');

  return chains.map((chain) => {
    const item = job.plan.items.find((item) => item.partIds.includes(chain.id));
    const tool = tools.find((tool) => item && tool?.itemKeys.includes(item.key));

    if (!tool) throw new CradleError('tool');

    const size = Number.parseFloat(tool.size ?? '');

    if (tool.icon === 'hex-key' && (!Number.isFinite(size) || size <= 0)) throw new CradleError('tool');

    return {
      chain,
      tool: tool.icon === 'hex-key' ? ('L-key' as const) : ('straight' as const),
      radiusMm: tool.icon === 'hex-key' ? size / Math.sqrt(3) : Math.max(5.5, chain.headR),
    };
  });
}

function preparedSources(job: CradleJob) {
  const geometries = new Map(job.geometries.map((geometry) => [geometry.id, geometry]));
  const shapes = new Map(job.shapes.map((shape) => [shape.key, shape]));
  let triangles = 0;

  return job.instances.map((instance) => {
    const shape = shapes.get(instance.key);

    if (!shape) throw new CradleError('source');

    const meshes = shape.meshes.map((mesh) => {
      const geometry = geometries.get(mesh.geometry);

      if (!geometry) throw new CradleError('source');

      triangles += (geometry.index?.length ?? geometry.positions.length / 3) / 3;

      if (triangles > 100_000) throw new CradleError('limit');

      return { ...geometry, matrix: mesh.matrix };
    });
    const positions = mergeMeshes(meshes);
    const matrix = new THREE.Matrix4().fromArray(instance.matrix);
    const solid = new ShapeSolid(positions);

    return {
      source: { id: instance.id, positions: transformCradleSoup(positions, matrix) },
      placed: place(instance.id, solid, matrix),
    };
  });
}

export async function prepareCradleJob(job: CradleJob) {
  const started = performance.now();
  const step = job.plan.steps[job.step];

  if (unresolvedCradleSources(job.parts)) throw new CradleError('source');

  if (!step || step.unproven || step.repairPhase || !rigidCradleSelection(job.ids, job.project.joints ?? []))
    throw new CradleError('source');

  const permitted = new Set([...step.partIds, ...step.contextIds]);

  if (job.ids.some((id) => !permitted.has(id)) || job.instances.length > 256) throw new CradleError('source');

  const prepared = preparedSources(job);

  try {
    const sources = job.ids.map((id) => prepared.find((entry) => entry.source.id === id)?.source);

    if (sources.some((source) => !source)) throw new CradleError('source');

    const api = await loadManifold();
    const geometry = makeCradle(api, { ...job.options, sources: sources.map((source) => source!) });

    checkCradleAccess(api, geometry, {
      obstacleHulls: job.parts
        .filter(
          (part) =>
            !job.ids.includes(part.id) && (part.kind === 'hardware' || part.kind === 'component' || !!part.supplyId),
        )
        .map((part) => part.id),
      sources: prepared.map((entry) => entry.source),
      moves: step.moves,
      drivers: driverRequests(
        job,
        prepared.map((entry) => entry.placed),
      ),
    });

    const check = cradlePrintShape(geometry.positions);
    const measure = measureTriangles(geometry.positions);

    if (!check || check.minWallMm < PRINT_RULES.minWallMm - 0.01) throw new CradleError('wall');

    const part: ScenePart = {
      id: 'assembly-cradle',
      name: 'Assembly cradle',
      kind: 'sculpt_mesh',
      category: 'custom_models',
      role: 'solid',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      dimensions: { width: 1, height: 1, depth: 1 },
      color: '#eeeeee',
      note: '',
      visible: true,
      locked: false,
      mechanicalTag: '3D Printed PLA/PETG',
      sculptMesh: { positions: Array.from(geometry.positions) },
      print: { down: [0, -1, 0] },
    };
    const report = reportFromShapes([{ part, shape: { check, measure } }], {
      project: job.project,
      printer: job.printer,
    });

    if (report.plan.plates.length !== 1 || report.parts[0]?.plate !== 1) throw new CradleError('plate');

    const identity: CradleIdentity = {
      restingDown: job.options.down,
      toWorld: geometry.toWorld,
      sceneId: job.sceneId,
      fingerprint: job.fingerprint,
      step: job.step,
      sourceIds: geometry.sourceIds,
      dimensionsMm: measure.max.map((value, axis) => value - measure.min[axis]) as [number, number, number],
      clearanceMm: geometry.clearanceMm,
      baseMm: geometry.baseMm,
      wallMm: geometry.wallMm,
      depthMm: geometry.depthMm,
    };

    return {
      geometry,
      part,
      report,
      identity,
      metrics: {
        prepareMs: performance.now() - started,
        triangles: measure.triangles,
        inputBytes: job.geometries.reduce(
          (sum, geometry) => sum + geometry.positions.byteLength + (geometry.index?.byteLength ?? 0),
          0,
        ),
        outputBytes: geometry.positions.byteLength + geometry.normals.byteLength,
      },
    };
  } finally {
    prepared.forEach((entry) => entry.placed.solid.dispose());
  }
}

export type PreparedCradle = Awaited<ReturnType<typeof prepareCradleJob>>;

function cradlePrintShape(positions: Float32Array) {
  const solid = new ShapeSolid(positions);

  try {
    return checkPrintability(positions, solid.bvh);
  } finally {
    solid.dispose();
  }
}
