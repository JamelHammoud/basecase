import { describe, expect, it } from 'vitest';
import { readBodyRecording } from './bodyRecordingRun';

function session(commands: number) {
  return [
    ...Array.from({ length: 61 }, (_, index) => ({ k: 'status', t: index / 50, q: [index / 100] })),
    ...Array.from({ length: commands }, (_, index) => ({ k: 'intent', t: index / 1000, q: [index / 1000] })),
  ]
    .sort((a, b) => a.t - b.t)
    .map((sample) => JSON.stringify(sample))
    .join('\n');
}

const read = (text: string) => readBodyRecording({ session: text, id: 'arm', joints: ['shoulder'] });

describe('retained body command fidelity', () => {
  it('keeps every bounded command rather than silently applying the fitter command cap', () => {
    const run = read(session(1201));

    expect(run?.statuses).toHaveLength(61);
    expect(run?.intents).toHaveLength(1201);
    expect(run?.intents[0]).toEqual({ at: 0, joints: [0] });
    expect(run?.intents[500]).toEqual({ at: 500, joints: [0.5] });
    expect(run?.intents.at(-1)).toEqual({ at: 1200, joints: [1.2] });
    expect(read(session(2049))).toBeNull();
  });

  it('retains the command active at the start of the bounded observation window', () => {
    const text = [
      { k: 'intent', t: 0, q: [0.25] },
      { k: 'status', t: 1, q: [0] },
      { k: 'status', t: 21, q: [0.5] },
      { k: 'status', t: 22, q: [0.75] },
      { k: 'intent', t: 23, q: [1] },
    ]
      .map((sample) => JSON.stringify(sample))
      .join('\n');

    expect(read(text)).toMatchObject({
      statuses: [
        { at: 21000, positions: [0.5] },
        { at: 22000, positions: [0.75] },
      ],
      intents: [
        { at: 0, joints: [0.25] },
        { at: 23000, joints: [1] },
      ],
    });
  });

  it('validates timestamps before trimming and refuses millisecond overflow', () => {
    const valid = session(30);

    expect(read(valid + '\n' + JSON.stringify({ k: 'input', t: -1 }))).toBeNull();
    expect(read(valid + '\n' + JSON.stringify({ k: 'status', t: 1e308, q: [0] }))).toBeNull();
    expect(read(valid.replace('"t":0.02', '"t":0'))).toBeNull();
  });
});
