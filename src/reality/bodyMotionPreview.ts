import type { MainModule } from '@mujoco/mujoco';
import * as THREE from 'three';
import { SimEngine } from '../sim/engine';
import { fromMj } from '../sim/mjcfFrames';
import type { SimModel } from '../sim/mjcfTypes';
import type { ScenePart } from '../types/robotics';
import { applyBodyFit } from './bodyModel';
import { emptyBodyFit } from './bodyParameters';
import { replayBody } from './bodyReplay';
import type { BodyMotionRequest, BodyMotionPlan } from './bodyMotionTypes';
import type { BodyReplayBudget } from './bodyReplay';

import { BODY_PREVIEW_VERTICES } from './bodyMotionTypes';

export class BodyPreviewStopped extends Error {
  readonly reason: 'budget' | 'unsupported' | 'numerical';

  constructor(reason: 'budget' | 'unsupported' | 'numerical') {
    super(reason);
    this.reason = reason;
  }
}

function meshGeometry(engine: SimEngine, geom: number): THREE.BufferGeometry {
  const model = engine.model;
  const id = Number(model.geom_dataid[geom]);
  const start = Number(model.mesh_vertadr[id]);
  const count = Number(model.mesh_vertnum[id]);
  const face = Number(model.mesh_faceadr[id]);
  const faces = Number(model.mesh_facenum[id]);

  if (count > BODY_PREVIEW_VERTICES || faces > BODY_PREVIEW_VERTICES) throw new BodyPreviewStopped('budget');

  return new THREE.BufferGeometry()
    .setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        Array.from(model.mesh_vert.slice(start * 3, (start + count) * 3) as Float32Array),
        3,
      ),
    )
    .setIndex(Array.from(model.mesh_face.slice(face * 3, (face + faces) * 3) as Int32Array));
}

function geometry(engine: SimEngine, geom: number): THREE.BufferGeometry {
  const type = Number(engine.model.geom_type[geom]);
  const [x, y, z] = Array.from(engine.model.geom_size.slice(geom * 3, geom * 3 + 3) as Float64Array);

  if (type === 7) return meshGeometry(engine, geom);

  if (type === 2) return new THREE.SphereGeometry(x, 8, 6);

  if (type === 6) return new THREE.BoxGeometry(x * 2, y * 2, z * 2);

  if (type === 5) return new THREE.CylinderGeometry(x, x, y * 2, 12).rotateX(Math.PI / 2);

  if (type === 3) return new THREE.CapsuleGeometry(x, y * 2, 4, 8).rotateX(Math.PI / 2);

  if (type === 4) return new THREE.SphereGeometry(1, 8, 6).scale(x, y, z);

  throw new BodyPreviewStopped('unsupported');
}

function geomPart(engine: SimEngine, geom: number, body: SimModel['bodies'][number]): ScenePart {
  const shape = geometry(engine, geom);
  const vertices = shape.getAttribute('position');
  const offset = engine.model.geom_pos.slice(geom * 3, geom * 3 + 3) as Float64Array;
  const rotation = engine.model.geom_quat.slice(geom * 4, geom * 4 + 4) as Float64Array;
  const quaternion = new THREE.Quaternion(rotation[1], rotation[2], rotation[3], rotation[0]);
  const point = new THREE.Vector3();
  const positions: number[] = [];

  for (let index = 0; index < vertices.count; index++) {
    point.fromBufferAttribute(vertices, index).applyQuaternion(quaternion);
    positions.push(...fromMj(point.x + offset[0], point.y + offset[1], point.z + offset[2]));
  }

  const indices = shape.index
    ? Array.from(shape.index.array)
    : Array.from({ length: vertices.count }, (_, index) => index);

  const size: [number, number, number] = [0.001, 0.001, 0.001];

  positions.forEach((value, index) => {
    size[index % 3] = Math.max(size[index % 3], Math.abs(value) * 2);
  });
  shape.dispose();

  return {
    id: `preview:${geom}`,
    name: body.name,
    kind: 'mesh',
    category: 'structure',
    role: 'solid',
    position: [...body.origin],
    rotation: [0, 0, 0],
    dimensions: { width: size[0], height: size[1], depth: size[2] },
    color: '#888888',
    note: '',
    visible: true,
    locked: true,
    mesh: { positions, indices, baseSize: size },
  };
}

function previewScene(engine: SimEngine, mj: MainModule) {
  const bodies = structuredClone(engine.sim.bodies);
  const parts: ScenePart[] = [];

  for (const body of bodies) {
    const id = mj.mj_name2id(engine.model, mj.mjtObj.mjOBJ_BODY.value, body.name);

    body.parts = [];

    for (let geom = 0; geom < engine.model.ngeom; geom++) {
      if (Number(engine.model.geom_bodyid[geom]) !== id) continue;

      const part = geomPart(engine, geom, body);

      parts.push(part);
      body.parts.push(part.id);

      if (parts.reduce((sum, entry) => sum + entry.mesh!.positions.length / 3, 0) > BODY_PREVIEW_VERTICES)
        throw new BodyPreviewStopped('budget');
    }
  }

  return { parts, bodies };
}

export function bodyMotionPreview(input: {
  input: BodyMotionRequest;
  plan: BodyMotionPlan;
  mj: MainModule;
  budget: BodyReplayBudget;
}) {
  const { request } = input.input;
  const poses: number[][] = [];
  const model = applyBodyFit({ ...request.model, scans: undefined }, request.robot, request.nominal ?? emptyBodyFit());
  const engine = new SimEngine(input.mj, model);

  try {
    const scene = previewScene(engine, input.mj);
    const positions = replayBody(
      {
        ...request,
        run: input.plan.run,
        mj: input.mj,
        budget: input.budget,
        engine,
        onFrame: () => poses.push(Array.from(engine.poses())),
      },
      request.nominal ?? emptyBodyFit(),
    );

    if (!positions.every((row) => row.every(Number.isFinite)) || !poses.every((pose) => pose.every(Number.isFinite)))
      throw new BodyPreviewStopped('numerical');

    return {
      ...scene,
      positions,
      poses,
      units: [...request.units],
      times: input.plan.run.statuses.map((status) => status.at / 1000),
    };
  } finally {
    engine.dispose();
  }
}
