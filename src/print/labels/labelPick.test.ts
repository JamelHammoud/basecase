import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { manifoldCsg } from '../../booleans/manifoldCsg';
import { place, type Placed } from '../../three/analysis/collide';
import { solidFromPositions } from '../../three/analysis/shapeSolid';
import type { ScenePart } from '../../types/robotics';
import { weld, type MeshData } from '../threeMf';
import { fixtureMesh, labelFixture } from './label.fixtures';
import { flatFaces, type V3 } from './labelFaces';
import { fitLabel, insideFace, LABEL_MM } from './labelFit';
import { labelPoint, labelSolids } from './labelGlyph';
import { CONTACT_MM, pickLabel } from './labelPick';
import { labelPart } from './partLabels';

const DOWN: V3 = [0, -1, 0];

const meshOf = (part: ScenePart): MeshData => weld(Float32Array.from(part.cad!.positions));

const placedOf = (parts: ScenePart[]): Placed[] =>
  parts.map((p) => place(p.id, solidFromPositions(Float32Array.from(p.cad!.positions)), fixtureMesh(p).matrixWorld));

function volume({ vertices: v, indices: t }: MeshData): number {
  let sum = 0;

  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i], t[i + 1], t[i + 2]].map((k) => new THREE.Vector3(v[k * 3], v[k * 3 + 1], v[k * 3 + 2]));

    sum += a.dot(b.cross(c)) / 6;
  }

  return sum;
}

const parts = labelFixture();
const byId = (id: string) => parts.find((p) => p.id === id)!;
const scene = placedOf(parts);
const tray = byId('tray');

describe('the face a printed part’s letter goes on', () => {
  it('debosses the letter 0.4 mm, so the mesh loses the glyph’s volume within 2%', async () => {
    for (const text of ['A', 'G', 'MW']) {
      const target = { id: 'tray', text, down: DOWN };
      const pick = pickLabel(scene, target, meshOf(tray))!;
      const glyph = await manifoldCsg('union', labelSolids(pick.face, pick.spot, text));
      const glyphVolume =
        (volume({ vertices: glyph!.positions, indices: glyph!.indices }) * LABEL_MM.depth) /
        (LABEL_MM.depth + LABEL_MM.lift);
      const cut = (await labelPart(scene, target, meshOf(tray))) as MeshData;
      const drop = volume(meshOf(tray)) - volume(cut);

      expect(glyphVolume).toBeGreaterThan(5);
      expect(Math.abs(drop - glyphVolume) / glyphVolume).toBeLessThan(0.02);
      expect(cut.indices.length).toBeGreaterThan(meshOf(tray).indices.length);
    }
  });

  it('picks the hidden floor inside the tray over its larger outside walls', () => {
    const pick = pickLabel(scene, { id: 'tray', text: 'A', down: DOWN }, meshOf(tray))!;

    expect(pick.face.normal.map((x) => Math.round(x))).toEqual([0, 1, 0]);
    expect(pick.face.offset).toBeCloseTo(4, 3);
    expect(flatFaces(meshOf(tray), 0)[0].area).toBeGreaterThan(pick.face.area);
  });

  it('chooses a face with no contact with another part', () => {
    const pick = pickLabel(scene, { id: 'tray', text: 'A', down: DOWN }, meshOf(tray))!;
    const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
    const corners: Array<[number, number]> = [];

    for (let i = 0; i < pick.face.tris.length; i += 2) corners.push([pick.face.tris[i], pick.face.tris[i + 1]]);

    for (const other of scene.filter((o) => o.id !== 'tray'))
      for (const corner of corners) {
        const p = new THREE.Vector3(...labelPoint(pick.face, corner, 0)).applyMatrix4(other.inverse);

        expect(other.solid.bvh.closestPointToPoint(p, target as never)!.distance).toBeGreaterThan(CONTACT_MM);
      }
  });

  it('never chooses the face the part prints on', () => {
    const upright = pickLabel(scene, { id: 'tray', text: 'A', down: DOWN }, meshOf(tray))!;

    expect(new THREE.Vector3(...upright.face.normal).dot(new THREE.Vector3(...DOWN))).toBeLessThan(0);
    expect(pickLabel(scene, { id: 'tray', text: 'A', down: [0, 1, 0] }, meshOf(tray))).toBeNull();
  });

  it('leaves a face that shows once the lid is off unlabeled', () => {
    const open = placedOf(parts.filter((p) => p.id !== 'lid'));

    expect(pickLabel(open, { id: 'tray', text: 'A', down: DOWN }, meshOf(tray))).toBeNull();
  });

  it('gives a part exposed on every face no label', async () => {
    expect(await labelPart(scene, { id: 'tag', text: 'E', down: DOWN }, meshOf(byId('tag')))).toBe('face');
    expect(await labelPart(scene, { id: 'lid', text: 'B', down: DOWN }, meshOf(byId('lid')))).toBe('face');
  });
});

describe('fitting the letters', () => {
  const small = weld(Float32Array.from(new THREE.BoxGeometry(7.5, 7.5, 7.5).toNonIndexed().attributes.position.array));
  const top = flatFaces(small, 0).find((f) => f.normal[1] > 0.9)!;

  it('fits one letter on a small face and skips AA rather than clipping it', () => {
    expect(fitLabel(top, 'A')).not.toBeNull();
    expect(fitLabel(top, 'AA')).toBeNull();
  });

  it('keeps every stroke of AA inside the face it’s cut into', () => {
    const pick = pickLabel(scene, { id: 'tray', text: 'AA', down: DOWN }, meshOf(tray))!;

    for (const prism of labelSolids(pick.face, pick.spot, 'AA'))
      for (let i = 0; i < 12; i += 3) {
        const p = new THREE.Vector3(prism.positions[i], prism.positions[i + 1], prism.positions[i + 2]);
        const at: [number, number] = [
          p.dot(new THREE.Vector3(...pick.face.u)),
          p.dot(new THREE.Vector3(...pick.face.v)),
        ];

        expect(insideFace(pick.face, at)).toBe(true);
      }
  });
});
