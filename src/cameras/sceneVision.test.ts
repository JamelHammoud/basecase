import { describe, expect, it, vi } from 'vitest';
import { compileRoutine } from '../routines/compile';
import { FIXTURE_SKILLS } from '../routines/fixtureSkills';
import { greetingRoutine } from '../routines/greeting';
import { startScenario } from '../routines/scenario';
import { RoutineVisionFacts } from '../routines/visionFacts';
import type { VisionResult } from '../vision/types';
import { createSignalBus } from '../cases/console/signalBus';
import { withVisionSignals } from './visionBus';
import { createVisionScope, visionScopeForScene } from './visionScope';
import { liveSceneVision, sceneVisionSignals, subscribeLiveSceneVision } from './sceneVision';
import { publishCameraVision } from './visionSession';

vi.mock('../utils/platform/web/idb', () => ({ idbAll: async () => [] }));

vi.mock('../vision/runtime', () => ({
  visionRuntime: () => ({ load: async () => undefined, subscribe: vi.fn(), onError: vi.fn() }),
}));

const frame = (cup: boolean, timestamp = 100): VisionResult => ({
  camera: 'wrist',
  modelId: 'rfdetr-nano',
  timestamp,
  width: 320,
  height: 240,
  detections: cup ? [{ label: 'cup', score: 1, box: [0.1, 0.2, 0.3, 0.4] }] : [],
});

async function scene(name: string) {
  const scope = createVisionScope(name);
  const routine = greetingRoutine();

  routine.watchers[1] = { ...routine.watchers[1], model: 'object-detection', label: 'cup' };

  const plan = compileRoutine(routine, { skills: FIXTURE_SKILLS }).plan!;
  const rig = await startScenario(plan, {
    covers: 'scene-owned camera inference',
    world: [],
    mocks: { person: true },
    faults: [],
    seconds: 2,
    expect: [],
  });

  rig.host.vision = new RoutineVisionFacts(plan);
  scope.simulated.registerVisionCameras({}, ['wrist']);
  await scope.simulated.configureVisionCamera('wrist', { modelId: 'rfdetr-nano' });

  const stop = subscribeLiveSceneVision(scope, (result) => rig.host.vision!.accept(result, 100));
  const bus = withVisionSignals(createSignalBus(), ['wrist'], sceneVisionSignals(scope));

  return { scope, rig, stop, bus };
}

describe('scene-owned camera inference', () => {
  it('keeps the saved scene identity across reopen and replaces sources when the same tab loads a different scene', () => {
    const original = createVisionScope('saved-kitchen');
    const reopened = createVisionScope('saved-kitchen');

    expect(reopened.scene).toBe(original.scene);
    expect(reopened.simulated.source.id).not.toBe(original.simulated.source.id);
    expect(visionScopeForScene(original, 'saved-kitchen')).toBe(original);

    const replaced = visionScopeForScene(original, 'saved-bedroom');

    expect(replaced.scene).toBe('saved-bedroom');
    expect(replaced.simulated.source.scene).toBe('saved-bedroom');
    expect(replaced.simulated.source.id).not.toBe(original.simulated.source.id);
    expect(original.simulated.source.scene).toBe('saved-kitchen');
  });

  it('keeps opposing wrist detections in their own Routine, overlay and console', async () => {
    const a = await scene('kitchen');
    const b = await scene('workshop');

    publishCameraVision({ ...frame(true), source: a.scope.simulated.source });
    publishCameraVision({ ...frame(false), source: b.scope.simulated.source });
    a.rig.clock.runUntil(1000);
    b.rig.clock.runUntil(1000);
    expect(a.rig.host.trace.some((event) => event.kind === 'fired' && event.reaction === 'greet')).toBe(true);
    expect(b.rig.host.trace.some((event) => event.kind === 'fired' && event.reaction === 'greet')).toBe(false);
    expect(a.scope.simulated.cameraVision('wrist')?.detections).toHaveLength(1);
    expect(b.scope.simulated.cameraVision('wrist')?.detections).toHaveLength(0);
    expect(a.bus.read('vision.wrist.cup')).toBe(1);
    expect(b.bus.read('vision.wrist.cup')).toBe(0);
    expect(a.scope.simulated.cameraVision('wrist')).toBe(a.scope.simulated.cameraVision('wrist'));
    a.stop();
    b.stop();
  });

  it('isolates assignments, seek boundaries, errors and source cleanup with the same camera name', async () => {
    const a = createVisionScope('kitchen');
    const b = createVisionScope('workshop');
    const close = a.recorded.registerVisionCameras({}, ['wrist']);

    a.simulated.registerVisionCameras({}, ['wrist']);
    b.simulated.registerVisionCameras({}, ['wrist']);
    await a.recorded.configureVisionCamera('wrist', { modelId: 'rfdetr-nano', fps: 2 });
    await b.simulated.configureVisionCamera('wrist', { modelId: 'rfdetr-nano', fps: 3 });

    const release = await liveSceneVision(a).acquireVisionCamera('wrist', {
      modelId: 'rfdetr-nano',
      fps: 9,
      current: () => true,
    });

    expect(a.simulated.visionAssignments()).toEqual([
      expect.objectContaining({ camera: 'wrist', fps: 9, source: a.simulated.source }),
    ]);
    expect(a.recorded.visionAssignments()[0].fps).toBe(2);
    expect(b.simulated.visionAssignments()[0].fps).toBe(3);
    a.simulated.publishCameraVision(frame(true));
    b.simulated.publishCameraVision(frame(true));
    a.recorded.publishCameraVision(frame(false));
    a.recorded.invalidateVisionCamera('wrist', 200);
    a.recorded.publishCameraVision(frame(true, 199));
    expect(a.recorded.cameraVision('wrist')).toBeNull();
    expect(a.simulated.cameraVision('wrist')?.detections).toHaveLength(1);
    expect(b.simulated.cameraVision('wrist')?.detections).toHaveLength(1);
    a.recorded.setCameraVisionError('wrist', 'Decode failed.', 200);
    expect(a.simulated.cameraVisionError('wrist')).toBeNull();
    expect(b.simulated.cameraVisionError('wrist')).toBeNull();
    close();
    expect(a.recorded.visionAssignments()).toEqual([]);
    expect(a.simulated.visionAssignments()[0].fps).toBe(9);
    release();
    expect(a.simulated.visionAssignments()).toEqual([]);
    expect(b.simulated.visionAssignments()[0].fps).toBe(3);
  });

  it('forwards only the owning scene’s live sources and ignores playback, unowned and private frames', () => {
    const a = createVisionScope('kitchen');
    const b = createVisionScope('workshop');
    const received = vi.fn();
    const changed = vi.fn();
    const stop = subscribeLiveSceneVision(a, received);
    const stopChanges = a.simulated.onCameraVision(changed);

    a.recorded.publishCameraVision(frame(true));
    b.simulated.publishCameraVision(frame(true));
    publishCameraVision(frame(true));
    a.simulated.publishCameraVision({ ...frame(true), camera: 'camera-shot:private:wrist' });
    expect(received).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
    a.operator.publishCameraVision({ ...frame(true), camera: 'operator' });
    a.simulated.publishCameraVision(frame(false));
    expect(received.mock.calls.map(([result]) => [result.source.kind, result.camera])).toEqual([
      ['operator', 'operator'],
      ['simulated', 'wrist'],
    ]);
    expect(changed).toHaveBeenCalledOnce();
    stop();
    stopChanges();
    a.simulated.publishCameraVision(frame(true, 101));
    expect(received).toHaveBeenCalledTimes(2);
  });
});
