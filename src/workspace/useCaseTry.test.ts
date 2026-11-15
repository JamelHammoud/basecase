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

vi.mock('./useStartupLease', () => ({ useStartupLease: vi.fn() }));
vi.mock('./useCaseVision', () => ({ useCaseVision: () => ({}) }));

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
