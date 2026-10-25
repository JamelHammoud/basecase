import * as THREE from 'three';
import { displayRgb, type Model, type ModelJoint, type ModelLink } from './model';
import type { Resolver } from './sources';

export interface ConvertedLink {
  name: string;
  world: number[];
  mesh: string | null;
  color: string | null;
  mass?: number;
  com?: [number, number, number];
  triangles?: number;
}

export interface ConvertedJoint {
  name: string;
  type: 'revolute' | 'prismatic' | 'fixed';
  parent: string;
  child: string;
  world: number[];
  axis: [number, number, number];
  limit: [number, number] | null;
  effort: number | null;
  velocity: number | null;
}

export interface ConvertedModel {
  format: 'basecase-simready';
  version: number;
  name: string;
  root: string | null;
  links: ConvertedLink[];
  joints: ConvertedJoint[];
  friction: number | null;
  visual?: string;
  notes: string[];
}

const IDENTITY = new THREE.Matrix4();

function hexColor(hex: string | null): THREE.Color | undefined {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return undefined;

  const n = parseInt(hex.slice(1), 16);

  return displayRgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function link(l: ConvertedLink): ModelLink {
  return {
    world: new THREE.Matrix4().fromArray(l.world),
    visuals: l.mesh
      ? [
          {
            geometry: { type: 'mesh', file: l.mesh, scale: new THREE.Vector3(1, 1, 1) },
            origin: IDENTITY.clone(),
            color: hexColor(l.color),
          },
        ]
      : [],
    mass: l.mass,
    com: l.com ? new THREE.Vector3(...l.com) : undefined,
  };
}

function joint(j: ConvertedJoint): ModelJoint {
  return {
    name: j.name,
    type: j.type,
    parent: j.parent,
    child: j.child,
    world: new THREE.Matrix4().fromArray(j.world),
    axis: new THREE.Vector3(...j.axis).normalize(),
    limit: j.limit ?? undefined,
    effort: j.effort ?? undefined,
    velocity: j.velocity ?? undefined,
  };
}

export function parseConverted(m: ConvertedModel): Model {
  if (m.format !== 'basecase-simready') throw new Error('That isn’t a converted SimReady asset.');

  return {
    name: m.name,
    links: new Map(m.links.map((l) => [l.name, link(l)])),
    joints: m.joints.map(joint),
    root: m.root ?? m.links[0]?.name ?? '',
  };
}

function bytesOf(base64: string): ArrayBuffer {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);

  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);

  return out.buffer;
}

export type ConvertedFiles = Record<string, string | Uint8Array>;

function bufferOf(file: string | Uint8Array): ArrayBuffer {
  if (typeof file === 'string') return bytesOf(file);

  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
}

export function convertedResolver(files: ConvertedFiles): Resolver {
  return {
    entry: { name: 'model.json', text: '' },
    read: async (ref) => (Object.hasOwn(files, ref) ? { data: bufferOf(files[ref]), path: ref } : null),
  };
}
