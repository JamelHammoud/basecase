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

it('retains identified teaching completion but discards an unsolicited ordinary reply after cancellation', async () => {
  const postMessage = vi.fn();
  const worker = { current: { postMessage } as unknown as Worker };
  let link: ReturnType<typeof useRecordingLink> | undefined;

  function Harness() {
    link = useRecordingLink(worker);

    return null;
  }

  renderToString(createElement(Harness));

  const early = recording();

  link!.reply({ type: 'recorded', recordId: 1, recording: early });
  expect(await link!.stopRecording(1)).toBe(early);
  expect(postMessage).not.toHaveBeenCalled();
  link!.reply({ type: 'recorded', recording: recording() });

  const pending = link!.stopRecording();
  const current = recording();

  expect(postMessage).toHaveBeenCalledWith({ type: 'record', on: false });
  link!.reply({ type: 'recorded', recording: current });
  expect(await pending).toBe(current);
});
