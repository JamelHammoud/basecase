import { Matrix3, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { LAYERED, layerFrame, stiffnessFor, type LayeredMaterial, type V3 } from './material';

function tensor(values: number[], shear = 1): Matrix3 {
  const [xx, yy, zz, yz, xz, xy] = values;

  return new Matrix3().set(xx, xy * shear, xz * shear, xy * shear, yy, yz * shear, xz * shear, yz * shear, zz);
}

function localStress(material: LayeredMaterial, strain: Matrix3): Matrix3 {
  const { inPlaneE: ep, acrossE: en, shearG: g, poisson: nu } = material;
  const compliance = new Matrix3().set(
    1 / ep,
    -nu / ep,
    -nu / ep,
    -nu / ep,
    1 / ep,
    -nu / ep,
    -nu / ep,
    -nu / ep,
    1 / en,
  );
  const e = strain.elements;
  const normal = new Vector3(e[0], e[4], e[8]).applyMatrix3(compliance.invert());

  return tensor([normal.x, normal.y, normal.z, 2 * g * e[7], 2 * g * e[6], (ep / (1 + nu)) * e[3]]);
}

function tensorStiffness(material: LayeredMaterial, normal: V3): Float64Array {
  const q = new Matrix3().fromArray(layerFrame(normal).flat()).transpose();
  const qt = q.clone().transpose();
  const out = new Float64Array(36);

  for (let c = 0; c < 6; c++) {
    const strain = tensor(
      Array.from({ length: 6 }, (_, i) => Number(i === c)),
      0.5,
    );
    const local = q.clone().multiply(strain).multiply(qt);
    const world = qt.clone().multiply(localStress(material, local)).multiply(q).elements;
    const stress = [world[0], world[4], world[8], world[7], world[6], world[3]];

    stress.forEach((value, r) => (out[r * 6 + c] = value));
  }

  return out;
}

function normals(): V3[] {
  const axes: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [-1, 0, 0],
    [0, -1, 0],
    [0, 0, -1],
    [0.9, Math.sqrt(1 - 0.9 ** 2), 0],
  ];

  return [
    ...axes,
    ...Array.from({ length: 60 }, (_, i): V3 => [Math.sin(i * 1.7) * 3, Math.cos(i * 2.3) * 2, Math.sin(i + 0.5)]),
  ];
}

const expectMatrix = (actual: Float64Array, expected: Float64Array) =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 9));

describe('layered material stiffness', () => {
  it.each(Object.entries(LAYERED))('matches independent stress and strain tensor rotation for %s', (_, material) => {
    for (const normal of normals()) {
      const result = stiffnessFor(material, normal);

      expectMatrix(result, tensorStiffness(material, normal));
      result.forEach((value, i) => expect(value).toBeCloseTo(result[(i % 6) * 6 + Math.floor(i / 6)], 9));
    }
  });

  it('preserves isotropic stiffness under rotation and scaling the layer normal', () => {
    const material: LayeredMaterial = {
      ...LAYERED.PLA!,
      inPlaneE: 2000,
      acrossE: 2000,
      shearG: 2000 / (2 * 1.3),
      poisson: 0.3,
    };
    const expected = stiffnessFor(material, [0, 0, 1]);

    expect(expected[0]).toBeCloseTo((2000 * 0.7) / (1.3 * 0.4), 10);
    expect(expected[21]).toBeCloseTo(material.shearG, 12);

    for (const normal of normals()) {
      expectMatrix(stiffnessFor(material, normal), expected);
      expectMatrix(stiffnessFor(material, normal.map((v) => v * 10) as V3), expected);
    }
  });

  it('keeps inputs and earlier results independent after material and normal edits', () => {
    const material = { ...LAYERED.PETG! };
    const normal: V3 = [1, -2, 3];
    const savedMaterial = { ...material };
    const savedNormal = [...normal];
    const first = stiffnessFor(material, normal);
    const saved = first.slice();

    expect(material).toEqual(savedMaterial);
    expect(normal).toEqual(savedNormal);

    material.inPlaneE *= 1.2;
    material.shearG *= 0.8;
    normal[0] = -4;

    const changed = stiffnessFor(material, normal);

    expectMatrix(changed, tensorStiffness(material, normal));
    expect(changed).not.toEqual(first);
    changed.fill(0);
    expect(first).toEqual(saved);
    expect(stiffnessFor(savedMaterial, savedNormal as V3)).toEqual(saved);
  });
});
