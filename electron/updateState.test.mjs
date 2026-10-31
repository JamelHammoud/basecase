import { describe, expect, it } from 'vitest';
import { NO_UPDATE, nextUpdate, worthChecking } from './updateState.mjs';

const run = (words) => words.reduce((state, [word, version]) => nextUpdate(state, word, version), NO_UPDATE);

describe('update state', () => {
  it('shows the button only once the download lands', () => {
    expect(run([['found', '1.2.0']])).toEqual({ stage: 'getting', version: '1.2.0' });
    expect(
      run([
        ['found', '1.2.0'],
        ['ready', '1.2.0'],
      ]),
    ).toEqual({ stage: 'ready', version: '1.2.0' });
  });

  it('keeps the button while a newer release downloads, then offers the newer one', () => {
    const state = run([
      ['found', '1.2.0'],
      ['ready', '1.2.0'],
      ['found', '1.3.0'],
    ]);

    expect(state).toEqual({ stage: 'ready', version: '1.2.0' });
    expect(nextUpdate(state, 'error')).toBe(state);
    expect(nextUpdate(state, 'ready', '1.3.0')).toEqual({ stage: 'ready', version: '1.3.0' });
  });

  it('drops a failed download so the next check starts over', () => {
    expect(run([['found', '1.2.0'], ['error']])).toBe(NO_UPDATE);
  });

  it('installs only what has landed, and offers it again when the install fails', () => {
    expect(run([['install']])).toBe(NO_UPDATE);

    const installing = run([['found', '1.2.0'], ['ready', '1.2.0'], ['install']]);

    expect(installing.stage).toBe('installing');
    expect(nextUpdate(installing, 'ready', '1.3.0')).toBe(installing);
    expect(nextUpdate(installing, 'error')).toEqual({ stage: 'ready', version: '1.2.0' });
  });

  it('never checks while a download or an install is under way', () => {
    expect(['none', 'getting', 'ready', 'installing'].filter(worthChecking)).toEqual(['none', 'ready']);
  });
});
