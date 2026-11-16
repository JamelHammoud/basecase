import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { parseXml } from './robotImport.fixtures';
import { parseUrdf } from './urdf';

interface Edge {
  parent: string;
  child: string;
  x: number;
  turn: number;
}

function robotXml(edges: Edge[], links = ['root', ...edges.map((e) => e.child)]) {
  return `<robot name="tree">${links.map((name) => `<link name="${name}"/>`).join('')}${edges
    .map(
      (e, i) => `<joint name="joint_${i}" type="revolute">
        <parent link="${e.parent}"/><child link="${e.child}"/>
        <origin xyz="${e.x} 0 0" rpy="0 0 ${e.turn}"/><axis xyz="0 2 0"/>
        <limit lower="-1" upper="2" effort="3" velocity="4"/>
      </joint>`,
    )
    .join('')}</robot>`;
}

function referenceWalk(edges: Edge[]) {
  const names: string[] = [];
  const jointWorlds: THREE.Matrix4[] = [];
  const worlds = new Map<string, THREE.Matrix4>();
  const walk = (link: string, world: THREE.Matrix4, depth: number) => {
    worlds.set(link, world);

    if (depth > 200) return;

    for (const [i, edge] of edges.entries()) {
      if (edge.parent !== link) continue;

      const local = new THREE.Matrix4().makeRotationZ(edge.turn).setPosition(edge.x, 0, 0);
      const next = world.clone().multiply(local);

      names.push(`joint_${i}`);
      jointWorlds.push(next);
      walk(edge.child, next, depth + 1);
    }
  };

  walk('root', new THREE.Matrix4(), 0);

  return { names, worlds, jointWorlds };
}

function expectTree(edges: Edge[], links?: string[]) {
  const model = parseUrdf(parseXml(robotXml(edges, links)));
  const expected = referenceWalk(edges);

  expect(model.root).toBe('root');
  expect(model.joints.map((j) => j.name)).toEqual(expected.names);

  for (const [index, joint] of model.joints.entries()) {
    expect(joint).toMatchObject({ type: 'revolute', limit: [-1, 2], effort: 3, velocity: 4 });
    expect(joint.axis.toArray()).toEqual([0, 1, 0]);
    joint.world.elements.forEach((v, i) => expect(v).toBeCloseTo(expected.jointWorlds[index].elements[i], 12));
  }

  for (const [name, link] of model.links) {
    const world = expected.worlds.get(name) ?? new THREE.Matrix4();

    link.world.elements.forEach((v, i) => expect(v).toBeCloseTo(world.elements[i], 12));
  }

  return model;
}

describe('URDF link traversal', () => {
  it('keeps source sibling order, depth-first transforms and unreachable links across branching trees', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const edges = Array.from({ length: 35 }, (_, i) => ({
        parent: i === 0 ? 'root' : `link_${Math.floor((i * ((seed % 7) + 1)) / 8)}`,
        child: `link_${i}`,
        x: (i - seed) / 10,
        turn: (i + seed) / 20,
      }));
      const shuffled = [...edges.slice(seed), ...edges.slice(0, seed)].reverse();

      expectTree(shuffled, ['root', ...edges.map((e) => e.child), 'disconnected']);
    }
  });

  it('keeps the depth boundary and cycle traversal without retaining an index between reads', () => {
    const edges = Array.from({ length: 205 }, (_, i) => ({
      parent: i === 0 ? 'root' : `link_${i - 1}`,
      child: `link_${i}`,
      x: 1,
      turn: 0,
    }));

    expect(expectTree(edges).joints).toHaveLength(201);
    expectTree([
      { parent: 'root', child: 'loop', x: 1, turn: 0 },
      { parent: 'loop', child: 'loop', x: 2, turn: 0 },
    ]);
    expect(expectTree([{ parent: 'root', child: 'new', x: -3, turn: 0.5 }]).joints).toHaveLength(1);
    expect(expectTree([]).joints).toEqual([]);
  });
});
