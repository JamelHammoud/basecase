import { describe, expect, it } from 'vitest';
import { settledWrites, trackWrite } from './pendingWrites.mjs';

describe('pending writes', () => {
  it('waits for every write in flight when no ids are given', async () => {
    let finish;
    let settled = false;

    trackWrite(['enclosure-lid'], new Promise((resolve) => (finish = resolve)));

    const waiting = settledWrites().then(() => (settled = true));

    await Promise.resolve();
    expect(settled).toBe(false);

    finish();
    await waiting;
    expect(settled).toBe(true);
  });
});
