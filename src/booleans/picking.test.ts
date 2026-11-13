import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildPartGroup } from '../three/buildPartMesh';
import type { ScenePart } from '../types/robotics';
import { evaluateBoolean } from './evaluate';
import { booleanHash } from './hash';
import { booleanPart, withResult, type BooleanPart } from './parts';
import { drilledOperands, drillTarget } from './picking';

const part = (id: string, kind: ScenePart['kind'], dimensions: ScenePart['dimensions']): ScenePart => ({
  id,
  name: id,
  kind,
  category: 'primitives',
  role: 'solid',
  position: [0, 10, 0],
  rotation: [0, 0, 0],
  dimensions,
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

async function plate(): Promise<BooleanPart> {
  const draft = booleanPart({
    id: 'result',
    base: part('box', 'box', { width: 40, height: 20, depth: 30 }),
    tools: [part('pin', 'cylinder', { width: 10, height: 30, depth: 10 })],
    op: 'subtract',
  });

  return withResult(draft, booleanHash(draft), await evaluateBoolean(draft));
}

function shot(result: BooleanPart, from: THREE.Vector3, toward: THREE.Vector3) {
  const raycaster = new THREE.Raycaster(from, toward.clone().sub(from).normalize());
  const group = buildPartGroup(result, false);

  group.updateMatrixWorld(true);

  return { raycaster, distance: raycaster.intersectObject(group, true)[0].distance };
}

describe('drilling into a boolean', () => {
  it('picks the operand whose surface was hit', async () => {
    const result = await plate();
    const wall = shot(result, new THREE.Vector3(0, 60, 0), new THREE.Vector3(5, 12, 0));
    const top = shot(result, new THREE.Vector3(15, 60, 0), new THREE.Vector3(15, 0, 0));
    const pick = (hit: typeof wall, drill: boolean, selected: string[] = []) =>
      drillTarget({ part: result, ...hit, selected: new Set(selected), drill });

    expect(pick(wall, true)).toBe('pin');
    expect(pick(top, true)).toBe(result.boolean.operands[0].id);
    expect(pick(wall, false)).toBe('result');
    expect(pick(top, false, ['pin'])).toBe(result.boolean.operands[0].id);
  });

  it('shows a drilled solid operand as a ghost the gizmo can hold', async () => {
    const result = await plate();
    const base = result.boolean.operands[0].id;
    const [ghost] = drilledOperands([result], [base]);

    expect(ghost.id).toBe(base);
    expect(ghost.role).toBe('reference');
    expect(drilledOperands([result], ['result'])).toEqual([]);
  });
});
