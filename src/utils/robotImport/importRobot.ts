import * as THREE from 'three';
import type { RobotJoint, ScenePart } from '../../types/robotics';
import { prettyJointName } from '../kinematics';
import { applyPublishedMass, buildLinkParts, linkGeometries, type MeshFiles } from './linkParts';
import { geometryWorker } from '../../three/geometryWorker';
import { loadMesh } from './meshes';
import type { MeshGeometry, Model, ModelJoint } from './model';
import { catalogFrame, limbOf, publishedData, round, S, type PublishedData } from './published';
import { readModel } from './readModel';
import type { Resolver, Source } from './sources';

export interface ImportOptions {
  onProgress?: (message: string) => void;
  maxTriangles?: number;
  name?: string;
  rotate?: Array<[string, number]>;
  color?: string;
}

export interface ImportedRobot {
  name: string;
  parts: ScenePart[];
  joints: RobotJoint[];
  triangles: number;
  notes: string[];
}

type Say = (message: string) => void;

async function parseMeshFile(data: ArrayBuffer, path: string): Promise<THREE.BufferGeometry | null> {
  if (/\.dae$/i.test(path)) return loadMesh(data, path);

  const positions = await geometryWorker.call('parseMesh', { data, path }, [data]);

  return positions && new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
}

async function loadMeshFiles(model: Model, resolver: Resolver, say: Say, notes: string[]): Promise<MeshFiles> {
  const files: MeshFiles = new Map();
  const meshRefs = [...model.links.values()]
    .flatMap((l) => l.visuals.map((v) => v.geometry))
    .filter((g): g is MeshGeometry => g.type === 'mesh');
  const unique = [...new Set(meshRefs.map((g) => g.file))];
  let done = 0;

  const queue = [...unique];
  const worker = async () => {
    for (let f = queue.shift(); f !== undefined; f = queue.shift()) {
      const file = f;
      const got = await resolver.read(file).catch(() => null);
      const geo = got ? await parseMeshFile(got.data, got.path).catch(() => null) : null;

      if (!geo) notes.push(`Couldn't read ${file.split('/').pop()}`);

      files.set(file, geo);
      done++;
      say(`Loading meshes ${done}/${unique.length}`);
    }
  };

  await Promise.all(Array.from({ length: Math.min(6, unique.length) }, worker));

  return files;
}

function linkOwners(model: Model) {
  const byChild = new Map(model.joints.map((j) => [j.child, j]));
  const cache = new Map<string, ModelJoint | null>();
  const ownerOf = (link: string): ModelJoint | null => {
    if (cache.has(link)) return cache.get(link)!;

    cache.set(link, null);

    const j = byChild.get(link);
    let o: ModelJoint | null = null;

    if (j) o = j.type === 'fixed' ? ownerOf(j.parent) : j;

    cache.set(link, o);

    return o;
  };

  return ownerOf;
}

function jointIds(model: Model): Map<ModelJoint, string> {
  const idOf = new Map<ModelJoint, string>();
  const taken = new Set<string>();

  for (const j of model.joints) {
    if (j.type === 'fixed') continue;

    let id = j.name.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'joint';

    while (taken.has(id)) id += '_';

    taken.add(id);
    idOf.set(j, id);
  }

  return idOf;
}

function jointRange(j: ModelJoint): [number, number] | undefined {
  if (!j.limit) return undefined;

  if (j.type === 'prismatic') return [round(j.limit[0] * 1000), round(j.limit[1] * 1000)];

  return [round((j.limit[0] * 180) / Math.PI), round((j.limit[1] * 180) / Math.PI)];
}

interface JointBuild {
  name: string;
  frame: THREE.Matrix4;
  shift: THREE.Vector3;
  data: PublishedData;
  idOf: Map<ModelJoint, string>;
  jointAbove: (j: ModelJoint) => ModelJoint | null;
  partsOwnedBy: (joint: ModelJoint | null) => string[];
}

function sceneJoint(b: JointBuild, j: ModelJoint): RobotJoint {
  const parentJoint = b.jointAbove(j);
  const origin = new THREE.Vector3()
    .setFromMatrixPosition(j.world)
    .applyMatrix4(b.frame)
    .multiplyScalar(1000)
    .add(b.shift);
  const axis = j.axis
    .clone()
    .transformDirection(j.world)
    .applyMatrix4(new THREE.Matrix4().extractRotation(b.frame))
    .normalize();
  let parentParts = b.partsOwnedBy(parentJoint);

  for (let at = parentJoint, n = 0; !parentParts.length && at && n < 50; n++) {
    at = b.jointAbove(at);
    parentParts = b.partsOwnedBy(at);
  }

  const velocity = b.data.joints.get(j.name)?.velocity;

  return {
    id: b.idOf.get(j)!,
    name: j.name,
    type: j.type,
    parent: parentParts,
    child: b.partsOwnedBy(j),
    parentJoint: parentJoint ? b.idOf.get(parentJoint) : undefined,
    origin: [round(origin.x), round(origin.y), round(origin.z)],
    axis: [axis.x, axis.y, axis.z].map((v) => Math.round(v * 1e6) / 1e6) as [number, number, number],
    range: jointRange(j),
    limb: limbOf(j.name),
    effortNm: j.effort,
    velocity: velocity === undefined ? undefined : round(velocity),
    published: b.name,
  };
}

function sceneJoints(
  model: Model,
  partOfLink: Map<string, string>,
  base: Omit<JointBuild, 'idOf' | 'jointAbove' | 'partsOwnedBy'>,
) {
  const ownerOf = linkOwners(model);
  const build: JointBuild = {
    ...base,
    idOf: jointIds(model),
    jointAbove: (j) => j.after ?? ownerOf(j.parent),
    partsOwnedBy: (joint) => [...partOfLink].filter(([link]) => ownerOf(link) === joint).map(([, id]) => id),
  };

  return model.joints.filter((j) => j.type !== 'fixed').map((j) => sceneJoint(build, j));
}

export async function importRobot(source: Source, opts: ImportOptions = {}): Promise<ImportedRobot> {
  const say = opts.onProgress ?? (() => {});
  const notes: string[] = [];

  say('Reading the description');

  const { model, resolver } = await readModel(source);
  const name = opts.name ?? prettyJointName(model.name);
  const files = await loadMeshFiles(model, resolver, say, notes);

  say('Building parts');

  const frame = opts.rotate ? catalogFrame(opts.rotate) : S;
  const linkGeo = await linkGeometries(model, files, frame, opts.color);

  if (!linkGeo.size)
    throw new Error(
      notes.length
        ? `Couldn’t load any of its ${notes.length} meshes. Choose the folder that has them.`
        : 'Nothing to show: the description has no meshes or shapes.',
    );

  const groupId = `robot-${Date.now().toString(36)}`;
  const built = await buildLinkParts(linkGeo, {
    name,
    groupId,
    source,
    rotate: opts.rotate,
    maxTriangles: opts.maxTriangles,
  });
  const data = publishedData(model, frame, new Set(built.partOfLink.keys()));

  applyPublishedMass(built, data);

  const joints = sceneJoints(model, built.partOfLink, { name, frame, shift: built.shift, data });

  return { name, parts: built.parts, joints, triangles: built.triangles, notes };
}
