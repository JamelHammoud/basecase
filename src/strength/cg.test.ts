import { describe, expect, it, vi } from 'vitest';
import { conjugateGradient, multiplyBlocks, type ElasticSystem } from './cg';
import { assembleElastic, elasticPattern } from './elasticPattern';
import { hexElement } from './hexElement';
import { LAYERED, stiffnessFor, type LayeredMaterial } from './material';
import { hexMesh } from './mesh';

function fixture(material: LayeredMaterial, sparse: boolean, side: number) {
  const mesh = hexMesh({
    n: [3, 2, 2],
    h: [1, 1.5, 2],
    origin: [0, 0, 0],
    solid: Uint8Array.from({ length: 12 }, (_, i) => Number(!sparse || i % 5 !== 2)),
  });
  const system: ElasticSystem = {
    pattern: elasticPattern(mesh.nodes, mesh.positions.length / 3),
    fixed: Uint8Array.from(mesh.positions, (_, i) => Number(mesh.positions[Math.floor(i / 3) * 3] === side)),
    stiffness: hexElement(mesh.grid.h, stiffnessFor(material, [1, 2, 3])).stiffness,
    scale: Float64Array.from(mesh.cells, (_, e) => 0.2 + (e % 5) / 5),
  };
  const desired = Float64Array.from(system.fixed, (fixed, i) => (fixed ? 0 : Math.sin(i * 1.3) * 0.01));
  const force = new Float64Array(desired.length);

  multiplyBlocks(assembleElastic(system.pattern, system.scale, system.stiffness), desired, force);

  return { system, desired, force };
}

function residualOf(system: ElasticSystem, force: Float64Array, u: Float64Array): number {
  const product = new Float64Array(u.length);

  multiplyBlocks(assembleElastic(system.pattern, system.scale, system.stiffness), u, product);

  let residual = 0;
  let initial = 0;

  for (let i = 0; i < force.length; i++) {
    if (system.fixed[i]) continue;

    residual += (force[i] - product[i]) ** 2;
    initial += force[i] ** 2;
  }

  return Math.sqrt(residual) / (Math.sqrt(initial) || 1);
}

describe('elastic conjugate gradients', () => {
  it.each(Object.entries(LAYERED))('recovers displacements and reports residuals for %s', (_, material) => {
    for (const sparse of [false, true])
      for (const side of [0, 3]) {
        const { system, desired, force } = fixture(material, sparse, side);
        const saved = structuredClone({ system, force });
        const first = conjugateGradient(system, force, { tolerance: 1e-10, maxIterations: 600 });
        const previous = first.u.slice();

        expect(first.residual).toBeLessThan(1e-10);
        expect(first.iterations).toBeGreaterThan(1);
        first.u.forEach((value, i) => expect(value).toBeCloseTo(desired[i], 8));
        expect(residualOf(system, force, first.u)).toBeCloseTo(first.residual, 12);
        expect({ system, force }).toEqual(saved);
        expect(conjugateGradient(system, force, { tolerance: 1e-10, maxIterations: 600 })).toEqual(first);

        force.forEach((_, i) => (force[i] *= -2));

        const changed = conjugateGradient(system, force, { tolerance: 1e-10, maxIterations: 600 });

        changed.u.forEach((value, i) => expect(value).toBeCloseTo(-2 * desired[i], 8));
        expect(first.u).toEqual(previous);
      }
  });

  it('solves independently pinned axes without temporary block views or inverse arrays', () => {
    const { system, force } = fixture(LAYERED.PETG!, true, 0);
    const desired = Float64Array.from(system.fixed, (_, i) => Math.sin(i * 0.7) * 0.01);

    system.fixed.forEach((_, i) => {
      system.fixed[i] = Number(i % 7 === 0 || i < 9);
      desired[i] = system.fixed[i] ? 0 : desired[i];
    });
    multiplyBlocks(assembleElastic(system.pattern, system.scale, system.stiffness), desired, force);

    const views = vi.spyOn(Float64Array.prototype, 'subarray');
    const copies = vi.spyOn(Float64Array.prototype, 'set');
    let result;

    try {
      result = conjugateGradient(system, force, { tolerance: 1e-10, maxIterations: 600 });
      expect(views).not.toHaveBeenCalled();
      expect(copies).not.toHaveBeenCalled();
    } finally {
      views.mockRestore();
      copies.mockRestore();
    }

    expect(result.residual).toBeLessThan(1e-10);
    result.u.forEach((value, i) => expect(value).toBeCloseTo(desired[i], 8));
    expect(residualOf(system, force, result.u)).toBeCloseTo(result.residual, 12);
  });

  it('reports truncated solves and preserves the stopping threshold', () => {
    const { system, force } = fixture(LAYERED.PLA!, false, 0);

    for (const maxIterations of [0, 1, 7]) {
      const result = conjugateGradient(system, force, { tolerance: 0, maxIterations });

      expect(result.iterations).toBe(maxIterations);
      expect(residualOf(system, force, result.u)).toBeCloseTo(result.residual, 12);
      expect(result.residual).toBeGreaterThan(0);
    }

    expect(conjugateGradient(system, force, { tolerance: 1, maxIterations: 10 })).toEqual({
      u: new Float64Array(force.length),
      iterations: 0,
      residual: 1,
    });

    const first = conjugateGradient(system, force, { tolerance: 0, maxIterations: 1 });

    expect(conjugateGradient(system, force, { tolerance: first.residual, maxIterations: 600 })).toEqual(first);

    const converged = conjugateGradient(system, force, { tolerance: 1e-10, maxIterations: 600 });

    expect(conjugateGradient(system, force, { tolerance: 0, maxIterations: converged.iterations })).toEqual(converged);
  });

  it('solves empty, unloaded and fully fixed systems without non-finite results', () => {
    const { system, force } = fixture(LAYERED.PLA!, false, 0);
    const empty: ElasticSystem = {
      pattern: elasticPattern(new Int32Array(), 0),
      fixed: new Uint8Array(),
      scale: new Float64Array(),
      stiffness: system.stiffness,
    };

    for (const input of [
      { system: empty, force: new Float64Array() },
      { system, force: new Float64Array(force.length) },
      { system: { ...system, fixed: new Uint8Array(force.length).fill(1) }, force },
    ]) {
      expect(conjugateGradient(input.system, input.force, { tolerance: 1e-6, maxIterations: 10 })).toEqual({
        u: new Float64Array(input.force.length),
        iterations: 1,
        residual: 0,
      });
    }
  });
});
