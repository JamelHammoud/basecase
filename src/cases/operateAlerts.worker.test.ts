import { afterEach, expect, it, vi } from 'vitest';
import { MAX_UNITS } from '../../electron/robot/units.mjs';
import type { AlertRequest, AlertResult } from './operateAlerts.worker';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

it('bounds worker continuity across unit turnover and restarts duration for an evicted unit', async () => {
  const scope = {
    onmessage: null as ((event: { data: AlertRequest }) => Promise<void>) | null,
    postMessage: vi.fn<(result: AlertResult) => void>(),
  };

  vi.stubGlobal('self', scope);
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  await import('./operateAlerts.worker');

  const send = async (data: AlertRequest) => {
    expect(scope.onmessage).not.toBeNull();
    await scope.onmessage!({ data });
  };
  const sample = (unit: string) => ({
    unit,
    at: 1000,
    now: 1000,
    signals: { volts: 6 },
    context: { session: unit, sceneId: 'scene-one', modelHash: null, policyHash: null },
  });

  await send({
    cases: [
      {
        id: 'supply',
        failures: [
          {
            label: 'Supply low',
            formula: {
              hold_for: {
                within: 'whole',
                seconds: 1,
                state: {
                  atom: {
                    expr: { signal: 'volts' },
                    cmp: '<',
                    value: 7,
                    scale: 1,
                  },
                },
              },
            },
          },
        ],
      },
    ],
  });

  for (let index = 0; index <= MAX_UNITS; index++) await send(sample(`arm-${index}`));

  for (const at of [1400, 1800, 2000]) {
    vi.mocked(Date.now).mockReturnValue(at);
    await send({ ...sample('arm-0'), at, now: at });
  }

  expect(scope.postMessage.mock.calls.at(-1)?.[0].results[0].active).toBeNull();
  vi.mocked(Date.now).mockReturnValue(2400);
  await send({ ...sample('arm-0'), at: 2400, now: 2400 });
  expect(scope.postMessage.mock.calls.at(-1)?.[0].results[0].active).toBe(true);
});
