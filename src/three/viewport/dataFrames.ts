import * as THREE from 'three';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export interface FramePose {
  p: Vec3;
  q: Quat;
}

export interface FrameTransform {
  parent: string;
  child: string;
  stamp: number;
  pose: FramePose;
  fixed?: boolean;
}

interface Edge {
  parent: string;
  samples: FrameTransform[];
}

export interface TfTree {
  edges: ReadonlyMap<string, Edge>;
}

export interface FrameAnchors {
  links: ReadonlyMap<string, THREE.Matrix4>;
  base: THREE.Matrix4 | null;
}

export const ROS_TO_SCENE = new THREE.Matrix4().set(1000, 0, 0, 0, 0, 0, 1000, 0, 0, -1000, 0, 0, 0, 0, 0, 1);

export const EMPTY_TREE: TfTree = { edges: new Map() };

export function tfTree(transforms: Iterable<FrameTransform>): TfTree {
  const edges = new Map<string, Edge>();

  for (const t of transforms) {
    const edge = edges.get(t.child);

    if (!edge || edge.parent !== t.parent) edges.set(t.child, { parent: t.parent, samples: [t] });
    else edge.samples.push(t);
  }

  for (const edge of edges.values()) edge.samples.sort((a, b) => a.stamp - b.stamp);

  return { edges };
}

const lastAtOrBefore = (samples: FrameTransform[], at: number) => {
  let lo = 0;
  let hi = samples.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;

    if (samples[mid].stamp <= at) lo = mid;
    else hi = mid - 1;
  }

  return lo;
};

const position = new THREE.Vector3();
const nextPosition = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const nextRotation = new THREE.Quaternion();
const unit = new THREE.Vector3(1, 1, 1);

function edgeMatrix(edge: Edge, at: number, out: THREE.Matrix4): THREE.Matrix4 {
  const { samples } = edge;
  const i = samples[0].fixed ? samples.length - 1 : lastAtOrBefore(samples, at);
  const a = samples[i];
  const b = samples[Math.min(i + 1, samples.length - 1)];

  position.fromArray(a.pose.p);
  rotation.fromArray(a.pose.q);

  if (b !== a && at > a.stamp) {
    const w = Math.min(1, (at - a.stamp) / (b.stamp - a.stamp));

    position.lerp(nextPosition.fromArray(b.pose.p), w);
    rotation.slerp(nextRotation.fromArray(b.pose.q), w);
  }

  return out.compose(position, rotation, unit);
}

function framePath(tree: TfTree, frame: string, at: number, links?: FrameAnchors['links']) {
  const toFrame = new THREE.Matrix4();
  const step = new THREE.Matrix4();
  let current = frame;

  for (let hops = 0; hops <= tree.edges.size; hops++) {
    if (links?.has(current)) break;

    const edge = tree.edges.get(current);

    if (!edge) break;

    toFrame.premultiply(edgeMatrix(edge, at, step));
    current = edge.parent;
  }

  return { frame: current, toFrame };
}

const rootOf = (tree: TfTree, frame: string) => {
  let current = frame;

  for (let hops = 0; hops <= tree.edges.size; hops++) {
    const edge = tree.edges.get(current);

    if (!edge) return current;

    current = edge.parent;
  }

  return current;
};

function sameTreeLink(tree: TfTree, root: string, links: FrameAnchors['links']): string | null {
  const known = [...tree.edges.keys()];
  const rooted = known.filter((f) => links.has(f) && rootOf(tree, f) === root);
  const depth = (f: string) => chainLength(tree, f);

  return rooted.sort((a, b) => depth(a) - depth(b))[0] ?? null;
}

const chainLength = (tree: TfTree, frame: string) => {
  let n = 0;

  for (let current = frame; tree.edges.has(current) && n <= tree.edges.size; n++) {
    current = tree.edges.get(current)!.parent;
  }

  return n;
};

export function knowsFrame(tree: TfTree, frame: string, anchors: FrameAnchors): boolean {
  return anchors.links.has(frame) || tree.edges.has(frame) || [...tree.edges.values()].some((e) => e.parent === frame);
}

export function resolveFrame(tree: TfTree, frame: string, at: number, anchors: FrameAnchors): THREE.Matrix4 | null {
  const link = anchors.links.get(frame);

  if (link) return link.clone();

  if (!knowsFrame(tree, frame, anchors)) return null;

  const path = framePath(tree, frame, at, anchors.links);
  const anchor = anchors.links.get(path.frame);

  if (anchor) return anchor.clone().multiply(path.toFrame);

  const linked = sameTreeLink(tree, path.frame, anchors.links);

  if (linked) {
    const rootToLink = framePath(tree, linked, at).toFrame;

    return anchors.links.get(linked)!.clone().multiply(rootToLink.invert()).multiply(path.toFrame);
  }

  return anchors.base ? anchors.base.clone().multiply(path.toFrame) : null;
}

export function linkAnchor(p: ArrayLike<number>, wxyz: ArrayLike<number>): THREE.Matrix4 {
  const placed = new THREE.Matrix4().compose(
    new THREE.Vector3(p[0], p[1], p[2]),
    new THREE.Quaternion(wxyz[1], wxyz[2], wxyz[3], wxyz[0]),
    unit,
  );

  return placed.premultiply(ROS_TO_SCENE);
}
