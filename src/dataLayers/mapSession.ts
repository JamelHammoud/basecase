import * as THREE from 'three';
import { knowsFrame, resolveFrame, type FrameTransform, type TfTree } from '../three/viewport/dataFrames';
import { mapCloud, ScanMap, type MapOptions } from './map';
import type { LaserScan, MapCloud, Odometry, PointCloud2, TFMessage } from './messages';
import { cloudSweep, scanSweep } from './mapSweeps';
import { frameTransforms } from './tf';

export interface PlacedSweep {
  at: number;
  frame: string;
  pose: THREE.Matrix4;
}

export interface SensorSweep {
  at: number;
  frame: string;
  points: Float32Array;
  optical?: boolean;
  planar?: boolean;
  rays?: boolean;
}

type Edge = TfTree['edges'] extends ReadonlyMap<string, infer E> ? E : never;

const ANCHORS = { links: new Map<string, THREE.Matrix4>(), base: new THREE.Matrix4() };

export const MAP_FRAME_SAMPLES = 256;
export const MAP_PLACED_SWEEPS = 4096;

export const bareFrame = (frame: unknown) => String(frame ?? '').replace(/^\//, '');

export function odometryTransform(odom: Odometry, at: number): FrameTransform {
  const { position: p, orientation: q } = odom.pose.pose;

  return {
    parent: bareFrame(odom.header.frame_id),
    child: bareFrame(odom.child_frame_id),
    stamp: at,
    pose: { p: [p.x, p.y, p.z], q: [q.x, q.y, q.z, q.w] },
  };
}

function insertSample(samples: FrameTransform[], t: FrameTransform) {
  let at = samples.length;

  while (at > 0 && samples[at - 1].stamp > t.stamp) at--;

  samples.splice(at, 0, t);
}

export class MapSession {
  readonly map: ScanMap;

  readonly placed: PlacedSweep[] = [];

  private readonly edges = new Map<string, Edge>();

  private readonly tree: TfTree = { edges: this.edges };

  private readonly framed = new Set<string>();

  private readonly odometered = new Set<string>();

  private base: string | null = null;

  private fixed: string | null = null;

  private readonly retainHistory: boolean;

  private readonly observe?: (sweep: SensorSweep & { pose: THREE.Matrix4 }) => void;

  constructor(
    options: MapOptions = {},
    retainHistory = false,
    observe?: (sweep: SensorSweep & { pose: THREE.Matrix4 }) => void,
  ) {
    this.observe = observe;
    this.map = new ScanMap(options);
    this.retainHistory = retainHistory;
  }

  get frame(): string | null {
    return this.fixed;
  }

  get transformSamples(): number {
    return [...this.edges.values()].reduce((count, edge) => count + edge.samples.length, 0);
  }

  transform(t: FrameTransform): void {
    const fromOdometry = this.odometered.delete(t.child);

    this.framed.add(t.child);
    this.addEdge(t, fromOdometry);
  }

  odometry(odom: Odometry, at: number): void {
    const step = odometryTransform(odom, at);

    this.base ??= step.child;

    if (this.framed.has(step.child)) return;

    this.odometered.add(step.child);
    this.addEdge(step, false);
  }

  message(schema: string, message: unknown, { at, fixed = false }: { at: number; fixed?: boolean }): void {
    if (schema === 'tf2_msgs/TFMessage')
      frameTransforms(message as TFMessage, at, fixed).forEach((t) => this.transform(t));
    else if (schema === 'nav_msgs/Odometry') this.odometry(message as Odometry, at);
    else if (schema === 'sensor_msgs/LaserScan') this.sweepOf(message as LaserScan, scanSweep, at);
    else if (schema === 'sensor_msgs/PointCloud2') this.sweepOf(message as PointCloud2, cloudSweep, at);
  }

  sweep(sweep: SensorSweep): boolean {
    const { at, frame, points, optical = false } = sweep;

    if (!points.length) return false;

    const place = this.placement(frame, at, optical);

    if (!place) return false;

    this.fixed ??= place.root;

    if (place.root !== this.fixed) return false;

    const pose = this.map.add({ points, pose: place.pose });

    this.placed.push({ at, frame, pose });
    this.observe?.({ ...sweep, pose });

    if (!this.retainHistory && this.placed.length > MAP_PLACED_SWEEPS) this.placed.shift();

    return true;
  }

  cloud(): MapCloud {
    return mapCloud(this.map.points(), this.fixed);
  }

  private sweepOf<M extends { header: { frame_id: string } }>(message: M, read: (m: M) => Float32Array, at: number) {
    this.sweep({ at, frame: bareFrame(message.header.frame_id), points: read(message) });
  }

  private addEdge(t: FrameTransform, replace: boolean) {
    const edge = this.edges.get(t.child);

    if (replace || !edge || edge.parent !== t.parent || t.fixed) {
      this.edges.set(t.child, { parent: t.parent, samples: [t] });

      return;
    }

    insertSample(edge.samples, t);

    if (!this.retainHistory && edge.samples.length > MAP_FRAME_SAMPLES)
      edge.samples.splice(0, edge.samples.length - MAP_FRAME_SAMPLES);
  }

  private rootOf(frame: string): string | null {
    let current = frame;

    for (let hops = 0; hops <= this.edges.size && this.edges.has(current); hops++)
      current = this.edges.get(current)!.parent;

    return this.edges.has(current) ? null : current;
  }

  private placement(frame: string, at: number, optical: boolean): { root: string; pose: THREE.Matrix4 } | null {
    if (!frame) return null;

    const root = this.rootOf(frame);

    if (root === null || (this.base && root !== this.rootOf(this.base))) return null;

    if (knowsFrame(this.tree, frame, ANCHORS)) return { root, pose: resolveFrame(this.tree, frame, at, ANCHORS)! };

    if (this.base || optical) return null;

    return { root: frame, pose: new THREE.Matrix4() };
  }
}
