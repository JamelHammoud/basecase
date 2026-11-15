import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fitBody } from './bodyTools.mjs';

const accepts = (payload) => z.object(fitBody.config.inputSchema).strict().safeParse(payload).success;

describe('fit_body payloads', () => {
  it('takes an optional robot key and no fit parameters', () => {
    expect(accepts({})).toBe(true);
    expect(accepts({ robot: 'arm' })).toBe(true);
    expect(accepts({ robot: '' })).toBe(false);
    expect(accepts({ robot: '../arm' })).toBe(false);
    expect(accepts({ robot: 'arm', massScales: { forearm: 1.3 } })).toBe(false);
  });

  it('rejects injected fit parameters before sending a bridge request', async () => {
    expect(await fitBody.handler({ robot: 'arm', payloadKg: { hand: 0.15 } })).toMatchObject({ isError: true });
  });
});
