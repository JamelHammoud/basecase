import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import type { FrameAxes } from '../../dataLayers/draw';
import { FramePicker } from './framePicker';
import { projectPoints } from './measurements';
import type { Stage } from './stage';
import type { ViewportContext } from './viewportContext';

function fixture() {
  const camera = new THREE.PerspectiveCamera(50, 1.5, 1, 1000);
  const stage = {
    camera,
    container: { clientWidth: 600, clientHeight: 400 },
    renderer: { domElement: { clientWidth: 900, clientHeight: 600 } },
  } as unknown as Stage;

  camera.position.z = 100;
  camera.updateMatrixWorld();

  return { stage, picker: new FramePicker() };
}

function previous(frames: FrameAxes[], stage: Stage, pointer: { x: number; y: number }) {
  const origins = frames.map(
    ({ matrix }) => [matrix.elements[12], matrix.elements[13], matrix.elements[14]] as [number, number, number],
  );
  const screen = projectPoints({ stage } as ViewportContext, origins);
  let best = -1;
  let distance = 12;

  screen.forEach((point, index) => {
    const gap = Math.hypot(point.x - pointer.x, point.y - pointer.y);

    if (point.visible && gap <= distance) {
      best = index;
      distance = gap;
    }
  });

  return { best, point: screen[best] };
}

const frame = (x: number, y: number, z: number): FrameAxes => ({
  name: 'frame',
  matrix: new THREE.Matrix4().makeTranslation(x, y, z),
});

it('matches projected-list selection across camera, canvas and frame changes', () => {
  const { stage, picker } = fixture();
  const frames = Array.from({ length: 64 }, (_, i) => frame((i % 8) * 4 - 16, Math.floor(i / 8) * 4 - 16, i - 32));
  const matrices = frames.map(({ matrix }) => matrix.elements.slice());
  let hits = 0;

  for (let move = 0; move < 120; move++) {
    stage.camera.position.set(Math.sin(move) * 10, Math.cos(move) * 10, 100 + move);
    stage.camera.lookAt(0, 0, 0);
    stage.camera.updateMatrixWorld();
    Object.assign(stage.container, { clientWidth: 600 + move, clientHeight: 400 + move });
    Object.assign(stage.renderer.domElement, { clientWidth: 900 + move, clientHeight: 600 + move });

    const origin = frames[move % frames.length].matrix.elements;
    const [at] = projectPoints({ stage } as ViewportContext, [[origin[12], origin[13], origin[14]]]);
    const pointer = { x: at.x + (move % 15), y: at.y - (move % 4) };
    const expected = previous(frames, stage, pointer);
    const hit = picker.pick(frames, stage, pointer);

    expect(hit).toBe(expected.best);

    if (hit < 0) continue;

    hits++;
    expect([picker.x, picker.y]).toEqual([expected.point.x, expected.point.y]);
  }

  expect(hits).toBeGreaterThan(0);
  expect(frames.map(({ matrix }) => matrix.elements)).toEqual(matrices);
});

it('preserves inclusive reach, later ties, depth clipping and recovery from empty picks', () => {
  const { stage, picker } = fixture();
  const frames = [frame(0, 0, 0), frame(0, 0, 0), frame(0, 0, 101), frame(0, 0, -1000)];
  const pointer = { x: 312, y: 200 };

  expect(picker.pick(frames, stage, pointer)).toBe(1);
  expect([picker.x, picker.y]).toEqual([300, 200]);
  expect(picker.pick(frames, stage, { x: 312.001, y: 200 })).toBe(-1);
  expect(picker.pick([], stage, pointer)).toBe(-1);
  expect(picker.pick(frames.slice(2), stage, { x: 300, y: 200 })).toBe(-1);
  expect(picker.pick(frames.slice(0, 1), stage, pointer)).toBe(0);
});

it('retains one projection vector per picker across repeated queries', () => {
  const first = fixture();
  const second = fixture();
  const frames = [frame(0, 0, 0), frame(10, 20, 0), frame(0, 0, 110)];
  const projections = vi.spyOn(THREE.Vector3.prototype, 'project');

  try {
    for (let move = 0; move < 300; move++) {
      first.picker.pick(frames, first.stage, { x: 300, y: 200 });
      second.picker.pick(frames, second.stage, { x: 310, y: 200 });
    }

    expect(projections).toHaveBeenCalledTimes(1800);
    expect(new Set(projections.mock.contexts).size).toBe(2);
  } finally {
    projections.mockRestore();
  }
});
