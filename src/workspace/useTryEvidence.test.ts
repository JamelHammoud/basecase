import { createElement, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { fixtureRobots } from '../sim/fixtures/robots';
import { useTryEvidence } from './useTryEvidence';

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useEffect: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

it('invalidates a running try on Case, robot or sensor edits and after asynchronous work', async () => {
  const robot = fixtureRobots().find((item) => item.id === 'rover-diff')!;
  const scope = {};
  const options = { scope, parts: robot.parts, joints: robot.joints, partners: () => [] };
  let evidence: ReturnType<typeof useTryEvidence>;

  function Harness() {
    evidence = useTryEvidence(options);

    return null;
  }

  renderToString(createElement(Harness));

  const [effect, dependencies] = vi.mocked(useEffect).mock.calls.at(-1)!;
  const cleanup = effect()!;

  expect(dependencies).toEqual([scope, robot.parts, robot.joints]);
  evidence!.begin();
  expect(evidence!.current()).toBe(true);
  await Promise.resolve();
  cleanup();
  expect(evidence!.current()).toBe(false);
  evidence!.clear();
  expect(evidence!.current()).toBe(false);
});

it('invalidates evidence when another robot slot changes without a local part edit', () => {
  const robot = fixtureRobots().find((item) => item.id === 'rover-diff')!;
  let partner = robot;
  let evidence: ReturnType<typeof useTryEvidence>;

  function Harness() {
    evidence = useTryEvidence({ scope: {}, parts: robot.parts, joints: robot.joints, partners: () => [partner] });

    return null;
  }

  renderToString(createElement(Harness));
  evidence!.begin();
  expect(evidence!.current()).toBe(true);

  partner = {
    ...robot,
    parts: robot.parts.map((part) => ({
      ...part,
      dimensions: { ...part.dimensions, width: part.dimensions.width + 1 },
    })),
  };

  expect(evidence!.current()).toBe(false);
});
