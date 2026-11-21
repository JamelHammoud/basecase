import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { Recording } from './recorder';
import { useRecordingLink } from './useRecordingLink';

const recording = (): Recording => ({
  dt: 0.02,
  frames: 1,
  nq: 0,
  nv: 0,
  nu: 0,
  nbody: 0,
  t: new Float32Array([0]),
  ctrl: new Float32Array(),
  qpos: new Float64Array(),
  qvel: new Float32Array(),
  poses: new Float32Array(),
});

function recordingLink() {
  const postMessage = vi.fn();
  const worker = { current: { postMessage } as unknown as Worker };
  let link: ReturnType<typeof useRecordingLink> | undefined;

  function Harness() {
    link = useRecordingLink(worker);

    return null;
  }

  renderToString(createElement(Harness));

  return { link: link!, postMessage };
}

it('retains identified teaching completion but discards an unsolicited ordinary reply after cancellation', async () => {
  const { link, postMessage } = recordingLink();
  const early = recording();

  link.reply({ type: 'recorded', recordId: 1, recording: early });
  expect(await link.stopRecording(1)).toBe(early);
  expect(postMessage).not.toHaveBeenCalled();
  link.reply({ type: 'recorded', recording: recording() });

  const pending = link.stopRecording();
  const current = recording();

  expect(postMessage).toHaveBeenCalledWith({ type: 'record', on: false });
  link.reply({ type: 'recorded', recording: current });
  expect(await pending).toBe(current);
});

it('preserves identified finalization through simulator shutdown while cancelling ordinary recording requests', async () => {
  const { link } = recordingLink();

  const teaching = link.stopRecording(7);
  const ordinary = link.stopRecording();
  const final = recording();

  link.cancel(true);
  link.reply({ type: 'recorded', recordId: 7, recording: final });
  expect(await ordinary).toBeNull();
  expect(await teaching).toBe(final);
});

it('releases identified finalization on worker failure and drops cached completions', async () => {
  const { link, postMessage } = recordingLink();
  const pending = link.stopRecording(7);

  link.reply({ type: 'recorded', recordId: 8, recording: recording() });
  link.cancel();
  expect(await pending).toBeNull();
  postMessage.mockClear();

  const next = link.stopRecording(8);

  expect(postMessage).toHaveBeenCalledWith({ type: 'record', on: false, recordId: 8 });
  link.cancel();
  expect(await next).toBeNull();
});
