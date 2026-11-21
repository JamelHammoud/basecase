import { Group, PerspectiveCamera, Scene } from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { expect, it, vi } from 'vitest';
import { watchGizmoAttachment } from './gizmoAttachment';

it('detaches a replaced selection before drawing and releases the previous selection listener', () => {
  const scene = new Scene();
  const first = new Group();
  const second = new Group();
  const controls = new TransformControls(new PerspectiveCamera());
  const stop = watchGizmoAttachment(controls);
  const error = vi.spyOn(console, 'error');

  scene.add(first, second, controls.getHelper());
  controls.attach(first);
  controls.attach(second);
  scene.remove(first);
  expect(controls.object).toBe(second);
  scene.remove(second);
  scene.updateMatrixWorld(true);
  expect(controls.object).toBeUndefined();
  expect(error).not.toHaveBeenCalled();
  scene.add(first);
  controls.attach(first);
  stop();
  scene.remove(first);
  expect(controls.object).toBe(first);
  controls.detach();
  error.mockRestore();
});
