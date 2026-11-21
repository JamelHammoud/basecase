import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { readCases } from '../cases/schema';
import { touchTheDots } from '../cases/testing';
import { fixtureRobots } from '../sim/fixtures/robots';
import type { Simulation } from '../sim/useSimulation';
import { buildRig } from '../utils/kinematics';
import { StartupLease } from './startupLease';
import { useCaseTry } from './useCaseTry';
import { useStartupLease } from './useStartupLease';
import { startCaseTeaching } from './caseTeaching';

vi.mock('./useStartupLease', () => ({ useStartupLease: vi.fn() }));
vi.mock('./useCaseVision', () => ({
  useCaseVision: () => ({ prepare: async () => null, release: vi.fn() }),
}));
vi.mock('./caseTeaching', () => ({ startCaseTeaching: vi.fn() }));

it('keeps startup owned by the saved Case across reparsing and replaces it when the saved Case changes', () => {
  const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
  const saved = touchTheDots(arm);
  const lease = new StartupLease();
  const subscribeStop = vi.fn();
  const sim = { stats: null, subscribeStop } as unknown as Simulation;

  vi.mocked(useStartupLease).mockReturnValue(lease);

  function Harness({ scope }: { scope: typeof saved }) {
    useCaseTry({
      active: readCases([scope])[0],
      scope,
      sim,
      rig: buildRig(arm.joints, arm.parts),
      parts: arm.parts,
      joints: arm.joints,
      partners: () => [],
      onTry: vi.fn(),
      onRefuse: vi.fn(),
    });

    return null;
  }

  renderToString(createElement(Harness, { scope: saved }));
  renderToString(createElement(Harness, { scope: saved }));
  expect(
    vi
      .mocked(useStartupLease)
      .mock.calls.slice(-2)
      .map(([scope]) => scope),
  ).toEqual([saved, saved]);
  expect(vi.mocked(useStartupLease).mock.calls.at(-1)?.[0]).toBe(saved);

  const edited = { ...saved, name: 'Edited Case' };

  renderToString(createElement(Harness, { scope: edited }));
  expect(useStartupLease).toHaveBeenLastCalledWith(edited, subscribeStop, expect.any(Function));
  expect(vi.mocked(useStartupLease).mock.calls.at(-1)?.[0]).toBe(edited);
});

it.each([false, true])(
  'leaves recording ownership alone after teaching startup cancellation, replacement=%s',
  async (replacement) => {
    const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
    const active = touchTheDots(arm);
    const lease = new StartupLease();
    const stopRecording = vi.fn(async () => null);
    const sim = {
      stats: null,
      subscribeStop: vi.fn(),
      latestStats: () => null,
      modelNow: () => ({}),
      runCase: vi.fn(),
      record: vi.fn(),
      drive: { active: true, start: async () => true, stop: vi.fn() },
      stopRecording,
    } as unknown as Simulation;
    let release: () => void = () => {};
    let enter: () => void = () => {};
    const loading = new Promise<void>((resolve) => (enter = resolve));
    const admitted = new Promise<null>((resolve) => (release = () => resolve(null)));
    let attempt: ReturnType<typeof useCaseTry> | undefined;

    vi.mocked(useStartupLease).mockReturnValue(lease);
    vi.mocked(startCaseTeaching)
      .mockClear()
      .mockImplementation(() => {
        enter();

        return admitted;
      });

    function Harness() {
      attempt = useCaseTry({
        active,
        scope: active,
        sim,
        rig: buildRig(arm.joints, arm.parts),
        parts: arm.parts,
        joints: arm.joints,
        partners: () => [],
        onTry: vi.fn(),
        onRefuse: vi.fn(),
      });

      return null;
    }

    renderToString(createElement(Harness));

    const pending = attempt!.teach!();

    await loading;
    expect(startCaseTeaching).toHaveBeenCalledOnce();
    lease.cancel();

    if (replacement) await attempt!.start();

    release();
    await pending;
    expect(stopRecording).not.toHaveBeenCalled();
    expect(sim.drive.stop).not.toHaveBeenCalled();
  },
);
