import { createElement, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import type { AlertRequest, AlertResult, AlertSample } from '../cases/operateAlerts.worker';
import { touchTheDots } from '../cases/testing';
import { receiveRobotEvent } from '../robot/robotStore';
import { fixtureRobots } from '../sim/fixtures/robots';
import { useOperateAlerts } from './useOperateAlerts';

vi.mock('react', async (original) => ({ ...(await original<typeof import('react')>()), useEffect: vi.fn() }));

class AlertWorker {
  requests: AlertRequest[] = [];
  onmessage: ((event: { data: AlertResult }) => void) | null = null;
  postMessage(request: AlertRequest) {
    this.requests.push(request);
  }
  terminate() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('keeps supplied telemetry fresh after initial delivery latency and resets replaced pending work', () => {
  const worker = new AlertWorker();

  vi.stubGlobal(
    'Worker',
    class {
      constructor() {
        return worker;
      }
    },
  );

  const kase = touchTheDots(fixtureRobots().find((robot) => robot.id === 'arm-3dof')!);

  kase.task.contract.failures = [
    {
      label: 'Supply low',
      formula: {
        eventually: {
          window: 'whole',
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
  ];

  function Harness() {
    useOperateAlerts([kase], 'scene-one');

    return null;
  }

  renderToString(createElement(Harness));

  const cleanup = vi.mocked(useEffect).mock.calls.at(-1)![0]();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const send = (stamp: number) =>
    receiveRobotEvent({
      event: 'status',
      unit: 'alert-arm',
      at_us: stamp * 1000,
      joints: [{ id: 1, volts: 6 }],
      context: { sceneId: 'scene-one', session: 'operate-one' },
    });
  const finish = () => worker.onmessage?.({ data: { ...(worker.requests.at(-1) as AlertSample), results: [] } });

  try {
    send(0);
    finish();
    clock.mockReturnValue(1050);
    send(100);
    expect(worker.requests.at(-1)).toMatchObject({ at: 1050, now: 1050, signals: { volts: 6 } });
    clock.mockReturnValue(1150);
    send(200);
    clock.mockReturnValue(1250);
    send(300);
    finish();
    expect(worker.requests.at(-1)).toMatchObject({ at: 1250, reset: true });
  } finally {
    if (typeof cleanup === 'function') cleanup();
  }
});
