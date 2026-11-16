import { useEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useFacility } from './useFacility';
import { prepareFacilityRequest, type FacilityResult } from './facilityClient';
import { fleetRequest } from './client';
import { registerControls } from '../sites/registration.mjs';
import { siteControls } from '../sites/siteFixtures';

const state = vi.hoisted(() => ({ values: [] as unknown[], initial: null as FacilityResult | null }));

vi.mock('react', () => ({
  useEffect: vi.fn(),
  useEffectEvent: (callback: () => unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const index = state.values.length;
    const value = index === 0 ? (state.initial ?? initial) : initial;

    state.values.push(value);

    return [
      value,
      (value: unknown) => {
        state.values[index] = typeof value === 'function' ? value(state.values[index]) : value;
      },
    ];
  },
}));
vi.mock('./facilityClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./facilityClient')>()),
  prepareFacilityRequest: vi.fn(),
}));
vi.mock('./client', () => ({ fleetRequest: vi.fn() }));

const saved: FacilityResult = {
  facility: {
    name: 'Factory',
    hash: 'a'.repeat(64),
    revision: 'import-a',
    metersPerUnit: 1,
    up: 'Z',
    floors: [],
    sources: [],
  },
  registration: null,
  geometry: null,
};

beforeEach(() => {
  state.values = [];
  state.initial = null;
  vi.clearAllMocks();
});

it('loads one coherent facility response and prevents an older load from overwriting an upload', async () => {
  let finishLoad!: (value: FacilityResult) => void;
  const pending = new Promise<FacilityResult>((resolve) => {
    finishLoad = resolve;
  });

  vi.mocked(prepareFacilityRequest).mockReturnValueOnce(pending).mockResolvedValueOnce(saved);

  const facility = useFacility('org', 'site');
  const cleanup = vi.mocked(useEffect).mock.calls[0][0]();
  const loadSignal = vi.mocked(prepareFacilityRequest).mock.calls[0][1];

  expect(await facility.upload([], { units: 'm', up: 'Z' })).toBe(true);
  expect(loadSignal.aborted).toBe(true);
  finishLoad({ ...saved, registration: registerControls(siteControls) });
  await pending;
  await vi.waitFor(() => expect(state.values[0]).toEqual(saved));
  expect(state.values[0]).toEqual(saved);
  expect(state.values[3]).toBe(1);
  expect(fleetRequest).not.toHaveBeenCalled();
  cleanup?.();
});

it('aborts an active upload on navigation and ignores its late response', async () => {
  let finishUpload!: (value: FacilityResult) => void;
  const pending = new Promise<FacilityResult>((resolve) => {
    finishUpload = resolve;
  });

  vi.mocked(prepareFacilityRequest).mockResolvedValueOnce(saved).mockReturnValueOnce(pending);

  const facility = useFacility('org', 'site');
  const cleanup = vi.mocked(useEffect).mock.calls[0][0]();

  await vi.waitFor(() => expect(state.values[0]).toEqual(saved));

  const upload = facility.upload([], { units: 'm', up: 'Z' });
  const signal = vi.mocked(prepareFacilityRequest).mock.calls[1][1];

  cleanup?.();
  finishUpload({ ...saved, facility: { ...saved.facility!, hash: 'b'.repeat(64) } });
  expect(await upload).toBe(false);
  expect(signal.aborted).toBe(true);
  expect(state.values[0]).toEqual(saved);
});

it.each([false, true])(
  'refreshes registration without reloading geometry and guards a concurrent replacement: %s',
  async (replaced) => {
    state.initial = saved;

    const registration = registerControls(siteControls);
    const metadata = {
      ...saved,
      registration,
      facility: { ...saved.facility!, revision: replaced ? 'import-b' : saved.facility!.revision },
    };

    vi.mocked(fleetRequest).mockResolvedValue(metadata);
    useFacility('org', 'site', saved.facility!.revision, registration);

    const cleanup = vi.mocked(useEffect).mock.calls[0][0]();

    await vi.waitFor(() => expect(fleetRequest).toHaveBeenCalledOnce());
    await Promise.resolve();
    await Promise.resolve();
    expect(prepareFacilityRequest).not.toHaveBeenCalled();
    expect(state.values[0]).toEqual(replaced ? saved : { ...saved, registration });
    expect((state.values[0] as FacilityResult).geometry).toBe(saved.geometry);
    cleanup?.();
  },
);

it('ignores a registration response for a facility replaced while the request was in flight', () => {
  state.initial = saved;

  const facility = useFacility('org', 'site');
  const registration = registerControls(siteControls);

  facility.setRegistration(registration, 'import-b');
  expect(state.values[0]).toEqual(saved);
  facility.setRegistration(registration, saved.facility!.revision!);
  expect(state.values[0]).toEqual({ ...saved, registration });
});
