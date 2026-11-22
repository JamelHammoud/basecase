import { expect, it } from 'vitest';
import {
  agentRequestSignal,
  startAgentRequests,
  stopAgentRequests,
  cancellableAgentRequest,
} from './agentRequestScope';

it('keeps stopped and previous turns cancelled when the same lane starts another turn', () => {
  const lane = {};
  const original = agentRequestSignal(lane);

  stopAgentRequests(lane);
  expect(original.aborted).toBe(true);
  expect(agentRequestSignal(lane)).toBe(original);
  startAgentRequests(lane);

  const next = agentRequestSignal(lane);

  expect(next.aborted).toBe(false);
  expect(next).not.toBe(original);
  startAgentRequests(lane);
  expect(next.aborted).toBe(true);
  expect(agentRequestSignal(lane).aborted).toBe(false);
  expect(agentRequestSignal({}).aborted).toBe(false);
});

it('rejects a cancelled read immediately and detaches its later result', async () => {
  const controller = new AbortController();
  let complete = (_value: number) => {};
  const work = new Promise<number>((resolve) => {
    complete = resolve;
  });
  const waiting = cancellableAgentRequest(work, controller.signal);

  controller.abort();
  await expect(waiting).rejects.toThrow();
  complete(42);
  expect(controller.signal.aborted).toBe(true);
});
