import * as THREE from 'three';
import { strToU8, zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { LocalFile } from './sources';

class XmlElement {
  children: XmlElement[] = [];
  tagName: string;
  private attrs: Map<string, string>;

  constructor(tagName: string, attrs: Map<string, string>) {
    this.tagName = tagName;
    this.attrs = attrs;
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  get attributes() {
    return [...this.attrs].map(([name, value]) => ({ name, value }));
  }
}

export class TinyDomParser {
  parseFromString(text: string) {
    const root = new XmlElement('#document', new Map());
    const stack = [root];

    for (const [, close, tag, attrText, selfClose] of text.matchAll(
      /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g,
    )) {
      if (close) {
        stack.pop();

        continue;
      }

      const el = new XmlElement(
        tag,
        new Map([...attrText.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)].map((a) => [a[1], a[2]])),
      );

      stack[stack.length - 1].children.push(el);

      if (!selfClose) stack.push(el);
    }

    return { documentElement: root.children[0], querySelector: () => null };
  }
}

export const parseXml = (text: string) => new TinyDomParser().parseFromString(text) as unknown as Document;

export const localFile = (path: string, content: string | Uint8Array): LocalFile => ({
  path,
  blob: new Blob([typeof content === 'string' ? content : (content as Uint8Array<ArrayBuffer>)]),
});

export interface ArmPart {
  link: string;
  body: string;
  massKg: number;
  at: [number, number, number];
  size: number;
}

export interface ArmJoint {
  name: string;
  parent: string;
  child: string;
  origin: [number, number, number];
  limits: [number, number];
}

export const DESK_ARM = {
  bodies: ['body_base', 'body_shoulder', 'body_elbow'],
  parts: [
    { link: 'base_plate', body: 'body_base', massKg: 0.2, at: [0, 0, 0.01], size: 0.08 },
    { link: 'upper_arm', body: 'body_shoulder', massKg: 0.08, at: [0, 0, 0.1], size: 0.04 },
    { link: 'forearm', body: 'body_elbow', massKg: 0.06, at: [0, 0, 0.22], size: 0.035 },
  ] satisfies ArmPart[],
  joints: [
    { name: 'Shoulder', parent: 'body_base', child: 'body_shoulder', origin: [0, 0, 0.05], limits: [-1.5, 1.5] },
    { name: 'Elbow', parent: 'body_shoulder', child: 'body_elbow', origin: [0, 0, 0.11], limits: [-0.5, 2] },
  ] satisfies ArmJoint[],
};

const v = (p: number[]) => p.join(' ');

function partLink(p: ArmPart): string {
  return `  <link name="${p.link}">
    <inertial><origin xyz="${v(p.at)}"/><mass value="${p.massKg}"/></inertial>
    <visual><origin xyz="${v(p.at)}"/><geometry><mesh filename="meshes/${p.link}.stl"/></geometry></visual>
  </link>
  <joint name="${p.link}_fixed" type="fixed"><parent link="${p.body}"/><child link="${p.link}"/></joint>`;
}

function jointXml(j: ArmJoint): string {
  return `  <joint name="${j.name}" type="revolute">
    <parent link="${j.parent}"/><child link="${j.child}"/>
    <origin xyz="${v(j.origin)}"/><axis xyz="0 1 0"/>
    <limit lower="${j.limits[0]}" upper="${j.limits[1]}" effort="2.9" velocity="4.7"/>
  </joint>`;
}

export function deskArmUrdf(): string {
  const bodies = DESK_ARM.bodies.map((b) => `  <link name="${b}"/>`);

  return [
    '<robot name="desk_arm">',
    ...bodies,
    ...DESK_ARM.parts.map(partLink),
    ...DESK_ARM.joints.map(jointXml),
    '</robot>',
  ].join('\n');
}

function cubeStl(size: number): Uint8Array {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  const view = new STLExporter().parse(mesh, { binary: true }) as DataView;

  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function deskArmFiles(top = 'desk_arm'): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {
    [`${top}/package.xml`]: strToU8('<package><name>desk_arm</name></package>'),
    [`${top}/urdf/desk_arm.urdf`]: strToU8(deskArmUrdf()),
  };

  for (const p of DESK_ARM.parts) files[`${top}/urdf/meshes/${p.link}.stl`] = cubeStl(p.size);

  return files;
}

export function zipOf(files: Record<string, Uint8Array>): Uint8Array {
  const entries: Zippable = {};

  for (const [path, bytes] of Object.entries(files)) entries[path] = bytes;

  return zipSync(entries);
}

export const deskArmZip = () => zipOf(deskArmFiles());

export function hubListing(files: Record<string, Uint8Array>): string {
  const dirs = new Set(
    Object.keys(files).flatMap((path) =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, i, segments) => segments.slice(0, i + 1).join('/')),
    ),
  );
  const oid = (path: string) => path.length.toString(16).padStart(40, '0');
  const fileEntry = (path: string) => {
    const size = files[path].byteLength;
    const lfs = path.endsWith('.stl') ? { lfs: { oid: oid(path).repeat(2).slice(0, 64), size, pointerSize: 132 } } : {};

    return { type: 'file', oid: oid(path), size, path, ...lfs };
  };

  return JSON.stringify([
    ...[...dirs].map((path) => ({ type: 'directory', oid: oid(path), size: 0, path })),
    ...Object.keys(files).map(fileEntry),
  ]);
}
