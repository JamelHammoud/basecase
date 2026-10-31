import * as THREE from 'three';
import { noteLateChildren } from '../lateChildren';
import { requestRedraw } from '../redraw';
import type { BuildContext } from './context';
import { disposeCachedGeometry, hasShared, offerShared } from './sharedGeometry';

const LATE_EDGE_TRIANGLES = 500;

export interface EdgeRequest {
  key: string;
  owner: THREE.Object3D;
  build: () => THREE.BufferGeometry;
  compute: () => Promise<THREE.BufferGeometry>;
  attach: (edges: THREE.BufferGeometry) => void;
}

const triangles = (owner: THREE.Object3D) => {
  const geometry = (owner as THREE.Mesh).geometry;
  const count = geometry?.index?.count ?? geometry?.getAttribute('position')?.count ?? 0;

  return count / 3;
};

export const linesGeometry = (lines: Float32Array) =>
  new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lines, 3));

const isLive = (ctx: BuildContext, owner: THREE.Object3D) => owner.parent === ctx.group && ctx.group.parent !== null;

function adopt(ctx: BuildContext, request: EdgeRequest, edges: THREE.BufferGeometry) {
  if (!isLive(ctx, request.owner)) {
    offerShared(request.key, edges, disposeCachedGeometry);

    return;
  }

  let fresh = false;
  const shared = ctx.derive(
    request.key,
    () => {
      fresh = true;

      return edges;
    },
    disposeCachedGeometry,
  );

  if (!fresh) edges.dispose();

  request.attach(shared);
  noteLateChildren(ctx.group);
  requestRedraw();
}

export function addEdges(ctx: BuildContext, request: EdgeRequest): void {
  const late = ctx.lateEdges && !hasShared(request.key) && triangles(request.owner) >= LATE_EDGE_TRIANGLES;

  if (!late) {
    request.attach(ctx.derive(request.key, request.build, disposeCachedGeometry));

    return;
  }

  void request
    .compute()
    .then((edges) => adopt(ctx, request, edges))
    .catch(() => {});
}
