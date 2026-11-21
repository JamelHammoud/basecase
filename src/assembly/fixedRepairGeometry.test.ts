import { expect, it } from 'vitest';
import { fastenerPlanningFixture } from './fastenerPlanning.fixtures';
import { planRemoval } from './removalOrder';
import { minimumTeardown } from './minimumTeardown';

it('keeps unmeasured fixed context as a blocker in removal and minimum teardown', () => {
  const fixture = fastenerPlanningFixture(1);
  const id = fixture.parts[0];
  const geometry = fixture.geometry;

  geometry.fixed = ['fixed-context'];
  geometry.moves[id].local = geometry.moves[id].local.map(() => []);
  geometry.moves[id].exit = geometry.moves[id].local.map(() => ['fixed-context']);

  const plan = planRemoval(geometry, {});

  expect(minimumTeardown(geometry, plan, id)).toBeNull();
  geometry.moves[id].exit[0] = [];
  expect(minimumTeardown(geometry, planRemoval(geometry, {}), id)).not.toBeNull();
});

it('retains an unclassified hardware enclosure as an exit blocker in measured geometry', async () => {
  const THREE = await import('three');
  const { ShapeSolid } = await import('../three/analysis/shapeSolid');
  const { place } = await import('../three/analysis/collide');
  const { assemblyGeometry } = await import('./assemblyGeometry');
  const movingMesh = new THREE.BoxGeometry(10, 10, 10).toNonIndexed();
  const outer = new THREE.BoxGeometry(50, 50, 50).toNonIndexed();
  const inner = new THREE.BoxGeometry(46, 46, 46).toNonIndexed();
  const moving = new ShapeSolid(new Float32Array(movingMesh.attributes.position.array));
  const enclosure = new ShapeSolid(
    new Float32Array([...outer.attributes.position.array, ...inner.attributes.position.array]),
  );

  try {
    const placed = [place('moving', moving, new THREE.Matrix4()), place('enclosure', enclosure, new THREE.Matrix4())];
    const geometry = assemblyGeometry(placed, {
      roles: { moving: 'printed', enclosure: 'hardware' },
      specs: [],
      serviceable: ['moving'],
      movable: ['moving'],
      budgetMs: 20000,
    });

    expect(geometry.fixed).toContain('enclosure');
    expect(geometry.moves.moving.exit!.every((path) => path.includes('enclosure'))).toBe(true);
    expect(minimumTeardown(geometry, planRemoval(geometry, {}), 'moving')).toBeNull();
  } finally {
    moving.dispose();
    enclosure.dispose();
    movingMesh.dispose();
    outer.dispose();
    inner.dispose();
  }
});
