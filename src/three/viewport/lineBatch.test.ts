import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineBatch } from './lineBatch';

afterEach(() => vi.restoreAllMocks());

const geometry = () =>
  new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 2, 3], 3));

describe('LineBatch transforms', () => {
  it('keeps independent snapshots through hidden movement, removal and instance reuse', () => {
    const writes = vi.spyOn(THREE.Matrix4.prototype, 'toArray');
    const batch = new LineBatch(new THREE.LineBasicMaterial());
    const source = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const line = geometry();
    const first = batch.add(line, source);
    const second = batch.add(line, source.makeTranslation(4, 5, 6));
    const buffer = writes.mock.calls[0][0] as Float32Array;
    const matrixAt = (instance: number) => Array.from(buffer.subarray(instance * 16, (instance + 1) * 16));
    const expected = new THREE.Matrix4().makeTranslation(1, 2, 3).elements;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0).elements;

    expect(matrixAt(first)).toEqual(expected);
    batch.setVisible(first, false);
    batch.setMatrix(first, source.makeRotationX(Math.PI / 2).setPosition(7, 8, 9));

    const hiddenPose = source.elements.map(Math.fround);

    source.identity();
    expect(matrixAt(first)).toEqual(zero);
    expect(matrixAt(second)).toEqual(new THREE.Matrix4().makeTranslation(4, 5, 6).elements);
    batch.setVisible(first, true);
    expect(matrixAt(first)).toEqual(hiddenPose);
    batch.remove(first);
    expect(matrixAt(first)).toEqual(zero);

    const reused = batch.add(line, source.makeTranslation(-10, -20, -30));

    expect(reused).toBe(first);
    source.identity();
    batch.setVisible(reused, false);
    batch.setVisible(reused, true);
    expect(matrixAt(reused)).toEqual(new THREE.Matrix4().makeTranslation(-10, -20, -30).elements);
    batch.dispose();
    line.dispose();
  });

  it.each([300, 600])('retains transform storage across eight poses for %i line instances', (count) => {
    const clones = vi.spyOn(THREE.Matrix4.prototype, 'clone');
    const batch = new LineBatch(new THREE.LineBasicMaterial());
    const line = geometry();
    const source = new THREE.Matrix4();
    const instances = Array.from({ length: count }, () => batch.add(line, source));

    expect(clones).toHaveBeenCalledTimes(count);
    clones.mockClear();

    for (let pose = 0; pose < 8; pose++) {
      for (const instance of instances) {
        batch.setVisible(instance, pose % 2 === 0);
        batch.setMatrix(instance, source.makeTranslation(instance, pose, -instance));
      }
    }

    expect(clones).not.toHaveBeenCalled();
    expect(batch.size).toBe(count);
    batch.dispose();
    line.dispose();
  });
});
