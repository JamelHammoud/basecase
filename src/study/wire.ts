import { packParts } from '../three/packedMesh';
import type { ScenePart } from '../types/robotics';
import type { StudyScene } from './types';

type WireValue = string | number | boolean | null | undefined | { ref: string };

type WireNode =
  | { kind: 'object'; entries: Array<[string, WireValue]> }
  | { kind: 'array'; values: WireValue[] }
  | { kind: 'binary'; value: ArrayBufferView | ArrayBuffer }
  | { kind: 'numbers'; value: Float64Array };

export interface StudyPacket {
  root: WireValue;
  assets: Array<{ key: string; node: WireNode }>;
}

class StudyWireCodec {
  private handles = new WeakMap<object, string>();
  private values = new Map<string, object>();
  private nodes = new Map<string, WireNode>();
  private next = 0;

  private readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  write(value: object): StudyPacket {
    const assets: StudyPacket['assets'] = [];
    const root = this.reference(value, assets);

    return { root, assets };
  }

  read<T>(packet: StudyPacket): T {
    packet.assets.forEach(({ key, node }) => this.nodes.set(key, node));

    return this.materialize(packet.root) as T;
  }

  private reference(value: unknown, assets: StudyPacket['assets']): WireValue {
    if (value === null || typeof value !== 'object') return value as Exclude<WireValue, { ref: string }>;

    const known = this.handles.get(value);

    if (known) return { ref: known };

    const key = `${this.prefix}:${++this.next}`;

    this.handles.set(value, key);
    this.values.set(key, value);
    assets.push({ key, node: this.node(value, assets) });

    return { ref: key };
  }

  private node(value: object, assets: StudyPacket['assets']): WireNode {
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return { kind: 'binary', value };

    if (Array.isArray(value) && value.length > 32 && value.every((item) => typeof item === 'number'))
      return { kind: 'numbers', value: Float64Array.from(value) };

    if (Array.isArray(value)) return { kind: 'array', values: value.map((item) => this.reference(item, assets)) };

    return { kind: 'object', entries: Object.entries(value).map(([key, item]) => [key, this.reference(item, assets)]) };
  }

  private materialize(value: WireValue): unknown {
    if (value === null || typeof value !== 'object') return value;

    const known = this.values.get(value.ref);

    if (known) return known;

    const node = this.nodes.get(value.ref);

    if (!node) throw new Error('Study geometry handle was not registered in this worker.');

    const made = this.fromNode(node);

    this.values.set(value.ref, made);
    this.handles.set(made, value.ref);

    return made;
  }

  private fromNode(node: WireNode): object {
    if (node.kind === 'binary') return node.value;

    if (node.kind === 'numbers') return Array.from(node.value);

    if (node.kind === 'array') return node.values.map((value) => this.materialize(value));

    return Object.fromEntries(node.entries.map(([key, value]) => [key, this.materialize(value)]));
  }
}

interface StudyDelta {
  triangles: StudyScene['triangles'];
  measures: StudyScene['measures'];
  servoOutputs: StudyScene['servoOutputs'];
}

export class StudyWireWriter {
  private codec = new StudyWireCodec('client');
  private parts = new WeakMap<ScenePart, ScenePart>();
  private cad = new WeakMap<NonNullable<ScenePart['cad']>, NonNullable<ScenePart['cad']>>();
  private meshes = new WeakMap<NonNullable<ScenePart['mesh']>, NonNullable<ScenePart['mesh']>>();

  private packedPart(part: ScenePart): ScenePart {
    const known = this.parts.get(part);

    if (known) return known;

    const packed = packParts([part])[0];
    const cad = part.cad && (this.cad.get(part.cad) ?? packed.cad);
    const mesh = part.mesh && (this.meshes.get(part.mesh) ?? packed.mesh);
    const made = { ...packed, cad, mesh };

    if (part.cad && cad) this.cad.set(part.cad, cad);

    if (part.mesh && mesh) this.meshes.set(part.mesh, mesh);

    this.parts.set(part, made);

    return made;
  }

  write(scene: StudyScene): StudyPacket {
    return this.codec.write({ ...scene, parts: scene.parts.map((part) => this.packedPart(part)) });
  }

  refreshed(scene: StudyScene, packet: StudyPacket): StudyScene {
    const delta = this.codec.read<StudyDelta>(packet);

    return { ...scene, ...delta, triangles: { ...scene.triangles, ...delta.triangles } };
  }
}

export class StudyWireReader {
  private codec = new StudyWireCodec('worker');

  read(packet: StudyPacket): StudyScene {
    return this.codec.read<StudyScene>(packet);
  }

  refreshed(scene: StudyScene, changed: string[]): StudyPacket {
    const delta: StudyDelta = {
      triangles: Object.fromEntries(
        changed.filter((id) => !!scene.triangles[id]).map((id) => [id, scene.triangles[id]]),
      ),
      measures: scene.measures,
      servoOutputs: scene.servoOutputs,
    };

    return this.codec.write(delta);
  }
}
