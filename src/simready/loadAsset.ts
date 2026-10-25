import * as THREE from 'three';
import type { ScenePart } from '../types/robotics';
import { platformBridge } from '../utils/platformBridge';
import { importRobot, type ImportedRobot } from '../utils/robotImport';
import { S } from '../utils/robotImport/published';
import type { ConvertedModel } from '../utils/robotImport/simready';
import type { SimReadyAsset } from './search';

export interface SimReadyImport {
  robot: ImportedRobot;
  isObject: boolean;
}

const requestId = () => `simready-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function isLooseObject(model: ConvertedModel): boolean {
  return !model.joints.some((j) => j.type !== 'fixed');
}

export function objectPhysics(model: ConvertedModel): ScenePart['physics'] {
  const weighed = model.links.some((l) => (l.mass ?? 0) > 0);

  return { dynamic: weighed, ...(model.friction ? { friction: model.friction } : {}) };
}

export function simreadyRef(asset: Pick<SimReadyAsset, 'url' | 'name' | 'maker' | 'license'>): ScenePart['simready'] {
  return { url: asset.url, name: asset.name, maker: asset.maker, license: asset.license };
}

export function visualRef(model: ConvertedModel, key: string, link: string): NonNullable<ScenePart['mesh']>['visual'] {
  const world = model.links.find((l) => l.name === link)?.world;

  if (!model.visual || !world) return undefined;

  const matrix = new THREE.Matrix4()
    .makeScale(1000, 1000, 1000)
    .multiply(S)
    .multiply(new THREE.Matrix4().fromArray(world));

  return { key, node: link, matrix: matrix.toArray().map((v) => Math.round(v * 1e6) / 1e6) };
}

function withVisual(p: ScenePart, model: ConvertedModel, key: string): ScenePart {
  const visual = p.mesh && p.robotLink ? visualRef(model, key, p.robotLink.link) : undefined;

  return visual && p.mesh ? { ...p, mesh: { ...p.mesh, visual } } : p;
}

export async function loadSimReady(
  asset: Pick<SimReadyAsset, 'url' | 'name' | 'maker' | 'license'>,
  say: (message: string) => void,
): Promise<SimReadyImport> {
  const id = requestId();
  const stop = platformBridge.subscribeEvents((ev) => {
    if (ev.type === 'simready-progress' && ev.requestId === id) say(`${asset.name}: ${String(ev.message)}`);
  });

  try {
    const fetched = await platformBridge.simreadyFetch({ url: asset.url, requestId: id });
    const robot = await importRobot(
      { kind: 'converted', url: asset.url, model: fetched.model, files: fetched.files },
      { name: asset.name, onProgress: (m) => say(`${asset.name}: ${m}`) },
    );
    const isObject = isLooseObject(fetched.model);
    const physics = isObject ? objectPhysics(fetched.model) : undefined;
    const ref = simreadyRef(asset);
    const single = robot.parts.length === 1;
    const parts = robot.parts.map((p) =>
      withVisual(
        { ...p, ...(single ? { name: asset.name } : {}), simready: ref, ...(physics ? { physics } : {}) },
        fetched.model,
        fetched.key,
      ),
    );

    return { robot: { ...robot, parts }, isObject };
  } finally {
    stop();
  }
}
