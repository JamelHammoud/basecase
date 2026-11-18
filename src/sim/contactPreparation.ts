import loadMujoco from '@mujoco/mujoco';
import { decomposeWorld } from '../cases/worldDecomposition';
import type { ScenePart } from '../types/robotics';
import { SimEngine } from './engine';
import { buildMjcf } from './mjcf';
import { adoptEmbeddedParts, isSolidPart } from './mjcfEmbedded';
import { partEdges } from '../utils/partEdges';
import type { MjcfInput, SimModel } from './mjcfTypes';

export interface ContactHullEntry {
  hash: string;
  hulls: Float32Array[];
}

export interface ContactPreparationJob {
  input: Omit<MjcfInput, 'partTriangles' | 'worldTriangles'>;
  triangles: Record<string, Float32Array>;
  cache: ContactHullEntry[];
}

export interface ContactPreparationResult {
  model: SimModel;
  cache: ContactHullEntry[];
  metrics: { prepared: number; reused: number; hullBytes: number; sourceBytes: number; preparationMs: number };
}

const PRIMITIVES = new Set(['box', 'cube', 'sphere', 'cylinder', 'cone', 'capsule', 'ellipsoid']);
let mujoco: ReturnType<typeof loadMujoco> | undefined;

export function needsContactGeometry(part: ScenePart): boolean {
  return !!(
    part.mesh ||
    part.cad ||
    part.sculptMesh ||
    part.sheetTransform ||
    part.deformers ||
    partEdges(part) ||
    part.customNodes ||
    !PRIMITIVES.has(part.kind)
  );
}

async function geometryHash(triangles: Float32Array): Promise<string> {
  const bytes = new Uint8Array(triangles.byteLength + 1);

  bytes[0] = 1;
  bytes.set(new Uint8Array(triangles.buffer, triangles.byteOffset, triangles.byteLength), 1);

  const hash = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

function enabledParts(input: ContactPreparationJob['input']): Set<string> {
  return new Set(
    input.rig.robots
      .filter((robot) => input.project.selfContact?.[robot.key]?.enabled)
      .flatMap((robot) => [...robot.parts]),
  );
}

export async function prepareContactJob(job: ContactPreparationJob): Promise<ContactPreparationResult> {
  const started = performance.now();
  const input = {
    ...job.input,
    rig: adoptEmbeddedParts(job.input.rig, job.input.parts, (id) => job.triangles[id] ?? null),
  };
  const enabled = enabledParts(input);
  const cache = new Map(job.cache.map((entry) => [entry.hash, entry]));
  const robotHulls: Record<string, Float32Array[]> = {};
  const used = new Map<string, ContactHullEntry>();
  let prepared = 0;
  let reused = 0;
  let sourceBytes = 0;

  for (const part of job.input.parts) {
    if (!enabled.has(part.id) || !isSolidPart(part) || !needsContactGeometry(part)) continue;

    const triangles = job.triangles[part.id];

    if (!triangles?.length || triangles.length % 9 || triangles.length > 1_800_000)
      throw new Error(`Repair collision geometry for ${part.name} before enabling self-contact.`);

    sourceBytes += triangles.byteLength;

    if (sourceBytes > 36_000_000) throw new Error('Self-contact collision geometry exceeds 1,000,000 triangles.');

    const hash = await geometryHash(triangles);
    const hit = cache.get(hash);
    const hulls =
      hit?.hulls ??
      (
        await decomposeWorld({
          positions: triangles,
          indices: Uint32Array.from({ length: triangles.length / 3 }, (_, i) => i),
        })
      ).map((hull) => hull.positions);

    if (hit) reused++;
    else prepared++;

    const entry = { hash, hulls };

    used.set(hash, entry);
    cache.set(hash, entry);
    robotHulls[part.id] = hulls;
  }

  assertCollisionPieces(input, robotHulls);

  const model = buildMjcf({ ...input, robotHulls, partTriangles: (id) => job.triangles[id] ?? null });

  await assertContactStart(
    model,
    job.input.project.selfContact,
    new Map(input.parts.map((part) => [part.id, part.name])),
  );

  return {
    model,
    cache: [...used.values()],
    metrics: {
      prepared,
      reused,
      sourceBytes,
      hullBytes: [...used.values()].reduce(
        (sum, entry) => sum + entry.hulls.reduce((bytes, hull) => bytes + hull.byteLength, 0),
        0,
      ),
      preparationMs: performance.now() - started,
    },
  };
}

function assertCollisionPieces(input: ContactPreparationJob['input'], hulls: Record<string, Float32Array[]>) {
  const byId = new Map(input.parts.map((part) => [part.id, part]));

  for (const robot of input.rig.robots) {
    if (!input.project.selfContact?.[robot.key]?.enabled) continue;

    const count = [...robot.parts].reduce((sum, id) => {
      const part = byId.get(id);

      return sum + (part && isSolidPart(part) ? (hulls[id]?.length ?? 1) : 0);
    }, 0);

    if (count > 1024) throw new Error('Self-contact supports up to 1,024 collision pieces per robot.');
  }
}

async function assertContactStart(
  model: SimModel,
  settings: MjcfInput['project']['selfContact'],
  names: Map<string, string>,
) {
  mujoco ??= loadMujoco();

  const mj = await mujoco;
  const engine = new SimEngine(mj, model);
  const bodies = new Map(
    model.bodies.map((body) => [mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name), body]),
  );
  const contacts = engine.data.contact;

  try {
    for (let i = 0; i < engine.data.ncon; i++) {
      const contact = contacts.get(i)!;
      const a = bodies.get(engine.model.geom_bodyid[contact.geom1]);
      const b = bodies.get(engine.model.geom_bodyid[contact.geom2]);
      const penetration = contact.dist;

      contact.delete();

      if (penetration >= -0.0005 || !a?.robot || a.robot !== b?.robot || !settings?.[a.robot]?.enabled) continue;

      const first = names.get(a.parts[0]) ?? a.name;
      const second = names.get(b.parts[0]) ?? b.name;

      throw new Error(`Separate ${first} and ${second} before simulating self-contact.`);
    }
  } finally {
    contacts.delete();
    engine.dispose();
  }
}
