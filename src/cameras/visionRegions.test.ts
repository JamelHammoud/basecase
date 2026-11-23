import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CameraRegions } from '../vision/tracking/types';
import { cameraRegions, onCameraRegions, resetCameraTracking, setCameraRegions } from './visionRegions';

const runtime = vi.hoisted(() => ({ track: vi.fn(), resetTracking: vi.fn() }));

vi.mock('../vision/runtime', () => ({ visionRuntime: () => runtime }));

const source = { scene: 'scene', kind: 'simulated' as const, id: 'one' };
const regions: CameraRegions = { zones: [], lines: [{ name: 'gate', from: [0.5, 1], to: [0.5, 0] }] };

beforeEach(() => {
  runtime.track.mockClear();
  runtime.resetTracking.mockClear();
  setCameraRegions(source, 'front', undefined);
  runtime.track.mockClear();
});

describe('camera regions', () => {
  it('tell the worker once per change, under the source and camera, and tell listeners', () => {
    const listen = vi.fn();
    const stop = onCameraRegions(listen);

    setCameraRegions(source, 'front', regions);
    setCameraRegions(source, 'front', structuredClone(regions));

    expect(runtime.track).toHaveBeenCalledTimes(1);
    expect(runtime.track).toHaveBeenCalledWith('one', 'front', regions);
    expect(listen).toHaveBeenCalledWith('one/front');
    expect(cameraRegions('one/front')).toEqual(regions);

    setCameraRegions(source, 'front', { zones: [], lines: [] });
    expect(runtime.track).toHaveBeenLastCalledWith('one', 'front', undefined);
    expect(cameraRegions('one/front')).toBeUndefined();
    stop();
  });

  it('keep two sources’ cameras with the same name apart', () => {
    setCameraRegions(source, 'front', regions);
    setCameraRegions({ ...source, id: 'two' }, 'front', undefined);

    expect(cameraRegions('one/front')).toEqual(regions);
    expect(cameraRegions('two/front')).toBeUndefined();
    setCameraRegions(source, 'front', undefined);
  });

  it('restart tracking only for a camera that has regions', () => {
    resetCameraTracking('one/front');
    expect(runtime.resetTracking).not.toHaveBeenCalled();

    setCameraRegions(source, 'front', regions);
    resetCameraTracking('one/front');
    expect(runtime.resetTracking).toHaveBeenCalledWith('one', 'front');
    setCameraRegions(source, 'front', undefined);
  });
});
