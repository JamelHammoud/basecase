import { describe, expect, it } from 'vitest';
import { box, fixtureMeasures, fixtureTriangles } from '../sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../types/robotics';
import { StudyWireReader, StudyWireWriter } from './wire';
import type { StudyScene } from './types';

const part = {
  ...box('cad', [0, 10, 0], [20, 20, 20], 100),
  kind: 'cad_part' as const,
  cad: {
    language: 'openscad' as const,
    code: 'cube(20);',
    positions: [0, 0, 0, 20, 0, 0, 0, 20, 0],
    indices: [0, 1, 2],
    originOffset: [0, 0, 0] as [number, number, number],
    baseSize: [20, 20, 20] as [number, number, number],
  },
};
const scene: StudyScene = {
  parts: [part],
  project: DEFAULT_PROJECT,
  measures: fixtureMeasures([part]),
  triangles: { cad: fixtureTriangles([part])('cad')! },
};

describe('Study geometry handles', () => {
  it('registers triangle and packed CAD buffers once for repeated candidate jobs', () => {
    const writer = new StudyWireWriter();
    const reader = new StudyWireReader();
    const first = writer.write(scene);
    const read = reader.read(structuredClone(first));
    const second = writer.write({ ...scene, project: { ...scene.project, tether: { volts: 12, amps: 3 } } });
    const next = reader.read(structuredClone(second));

    expect(first.assets.filter((asset) => asset.node.kind === 'binary')).toHaveLength(3);
    expect(second.assets.filter((asset) => asset.node.kind === 'binary')).toEqual([]);
    expect(read.parts[0].cad?.positions).toBeInstanceOf(Float32Array);
    expect(next.triangles.cad).toBe(read.triangles.cad);
    expect(next.parts[0].cad).toBe(read.parts[0].cad);
    expect(next.project.tether?.volts).toBe(12);
    expect(scene.parts[0].cad?.positions).toEqual(part.cad.positions);
  });

  it('keeps changed buffers separate while older in-flight jobs retain their own geometry', () => {
    const writer = new StudyWireWriter();
    const reader = new StudyWireReader();
    const first = reader.read(writer.write(scene));
    const triangle = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0]);
    const changed = { ...scene, triangles: { cad: triangle } };
    const payload = writer.write(changed);
    const second = reader.read(payload);
    const previous = reader.read(writer.write(scene));

    expect(payload.assets.filter((asset) => asset.node.kind === 'binary')).toHaveLength(1);
    expect(second.triangles.cad).toBe(triangle);
    expect(previous.triangles.cad).toBe(first.triangles.cad);
    expect(first.triangles.cad).not.toBe(second.triangles.cad);
  });

  it('returns only rebuilt buffers from refresh and reuses their worker handles on the next grade', () => {
    const writer = new StudyWireWriter();
    const reader = new StudyWireReader();
    const loaded = reader.read(writer.write(scene));
    const triangle = new Float32Array([0, 0, 0, 3, 0, 0, 0, 3, 0]);
    const refreshed = { ...loaded, triangles: { cad: triangle } };
    const delta = reader.refreshed(refreshed, ['cad']);
    const received = writer.refreshed(scene, structuredClone(delta));
    const packet = writer.write(received);

    expect(delta.assets.filter((asset) => asset.node.kind === 'binary')).toHaveLength(1);
    expect(packet.assets.filter((asset) => asset.node.kind === 'binary')).toEqual([]);
    expect(reader.read(packet).triangles.cad).toBe(triangle);
    expect(received.triangles.cad).toEqual(triangle);
  });

  it('retains sourced mesh file bytes as binary handles across candidate jobs', () => {
    const writer = new StudyWireWriter();
    const reader = new StudyWireReader();
    const bytes = new Uint8Array([4, 3, 2, 1]).buffer;
    const source = { ...scene, meshFiles: { 'sourced.glb': bytes } };
    const first = reader.read(structuredClone(writer.write(source)));
    const packet = writer.write(source);
    const second = reader.read(structuredClone(packet));

    expect(second.meshFiles?.['sourced.glb']).toBe(first.meshFiles?.['sourced.glb']);
    expect(new Uint8Array(second.meshFiles!['sourced.glb'])).toEqual(new Uint8Array(bytes));
    expect(packet.assets.filter((asset) => asset.node.kind === 'binary')).toEqual([]);
  });

  it('refuses unknown geometry handles in another worker session', () => {
    const writer = new StudyWireWriter();

    writer.write(scene);

    expect(() => new StudyWireReader().read(writer.write(scene))).toThrow('geometry handle');
  });
});
