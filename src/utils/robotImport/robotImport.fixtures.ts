import * as THREE from 'three';
import { strToU8, zipSync, type Zippable } from 'three/examples/jsm/libs/fflate.module.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { BAM_STS3215_7V4 } from '../../data/servoFits';
import type { ServoCalibration } from '../../reality/types';
import { PACKAGE_FORMAT, type JointMap } from './robotPackage';
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

export const localFile = (path: string, content: string | Uint8Array): LocalFile => ({
  path,
  blob: new Blob([typeof content === 'string' ? content : (content as Uint8Array<ArrayBuffer>)]),
});

export interface PackagePart {
  link: string;
  body: string;
  massKg: number;
  at: [number, number, number];
  size: number;
}

export interface PackageJoint {
  id: string;
  name: string;
  parent: string;
  child: string;
  origin: [number, number, number];
  limits: [number, number];
  servoLink?: string;
}

export const DESK_ARM = {
  name: 'Desk Arm',
  bodies: ['body_base', 'body_shoulder', 'body_elbow'],
  parts: [
    { link: 'base_plate', body: 'body_base', massKg: 0.2, at: [0, 0, 0.01], size: 0.08 },
    { link: 'servo_1', body: 'body_base', massKg: 0.055, at: [0, 0, 0.035], size: 0.03 },
    { link: 'upper_arm', body: 'body_shoulder', massKg: 0.08, at: [0, 0, 0.1], size: 0.04 },
    { link: 'servo_2', body: 'body_shoulder', massKg: 0.055, at: [0, 0, 0.14], size: 0.03 },
    { link: 'forearm', body: 'body_elbow', massKg: 0.06, at: [0, 0, 0.22], size: 0.035 },
  ] satisfies PackagePart[],
  joints: [
    {
      id: 'shoulder',
      name: 'Shoulder',
      parent: 'body_base',
      child: 'body_shoulder',
      origin: [0, 0, 0.05],
      limits: [-1.5, 1.5],
      servoLink: 'servo_1',
    },
    {
      id: 'elbow',
      name: 'Elbow',
      parent: 'body_shoulder',
      child: 'body_elbow',
      origin: [0, 0, 0.11],
      limits: [-0.5, 2],
      servoLink: 'servo_2',
    },
  ] satisfies PackageJoint[],
};

export const SHOULDER_CALIBRATION: ServoCalibration = {
  verdict: 'measured',
  family: 'sts3215',
  version: 3,
  rung: 'response',
  fit: { ...BAM_STS3215_7V4, kt: 1.1 },
  volts: 7.4,
  scales: { kt: 0.86 },
  conditions: { volts: 7.4, temperatureC: 31 },
  evidence: { logs: 4, presetErrorRad: 0.08, fittedErrorRad: 0.02, gain: 0.75, explained: 0.9, reason: 'fits' },
};

const v = (p: number[]) => p.join(' ');

function partLink(p: PackagePart): string {
  return `  <link name="${p.link}">
    <inertial><origin xyz="${v(p.at)}"/><mass value="${p.massKg}"/></inertial>
    <visual><origin xyz="${v(p.at)}"/><geometry><mesh filename="meshes/${p.link}.stl"/></geometry></visual>
  </link>
  <joint name="${p.link}_fixed" type="fixed"><parent link="${p.body}"/><child link="${p.link}"/></joint>`;
}

function jointXml(j: PackageJoint): string {
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

export function deskArmJointMap(): JointMap {
  return {
    format: PACKAGE_FORMAT,
    version: 1,
    robot: DESK_ARM.name,
    urdf: 'robot.urdf',
    mjcf: 'robot.xml',
    joints: DESK_ARM.joints.map((j, i) => ({
      id: j.id,
      name: j.name,
      mjcf: `j${i}_${j.id}`,
      type: 'revolute',
      limits: j.limits,
      servo: { componentId: 'feetech-sts3215', variant: 'c001', family: 'sts3215', id: i + 1, link: j.servoLink },
      zeroOffset: 0,
      direction: 1,
      calibration: j.id === 'shoulder' ? SHOULDER_CALIBRATION : null,
    })),
  };
}

function cubeStl(size: number): Uint8Array {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size));
  const view = new STLExporter().parse(mesh, { binary: true }) as DataView;

  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

const MJCF_DECOY =
  '<mujoco model="desk_arm"><worldbody><body name="b"><geom type="box" size="1 1 1"/></body></worldbody></mujoco>';

export function deskArmPackageFiles(top = 'desk_arm'): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {
    [`${top}/robot.urdf`]: strToU8(deskArmUrdf()),
    [`${top}/robot.xml`]: strToU8(MJCF_DECOY),
    [`${top}/joint_map.json`]: strToU8(JSON.stringify(deskArmJointMap(), null, 2)),
    [`${top}/policies/reach/policy.json`]: strToU8('{}'),
  };

  for (const p of DESK_ARM.parts) files[`${top}/meshes/${p.link}.stl`] = cubeStl(p.size);

  return files;
}

export function zipOf(files: Record<string, Uint8Array>): Uint8Array {
  const entries: Zippable = {};

  for (const [path, bytes] of Object.entries(files)) entries[path] = bytes;

  return zipSync(entries);
}

export const deskArmPackageZip = () => zipOf(deskArmPackageFiles());
