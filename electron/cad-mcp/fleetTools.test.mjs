import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { rollBack, rollOut } from './fleetTools.mjs';
import { operate } from './worldTools.mjs';

const schemaOf = (tool) => z.object(tool.config.inputSchema);
const accepts = (tool, payload) => schemaOf(tool).safeParse(payload).success;
const units = (n) => Array.from({ length: n }, (_, i) => `robot-${i + 2}`);

describe('roll_out payloads', () => {
  it('take a skill with optional canaries and units', () => {
    expect(accepts(rollOut, { skill: 'Walk' })).toBe(true);
    expect(accepts(rollOut, { skill: 'Walk', canaries: ['robot'], units: ['robot', 'robot-2', 'arm-7'] })).toBe(true);
  });

  it('refuse a missing skill, bad unit names and more than 32 canaries', () => {
    expect(accepts(rollOut, { canaries: ['robot'] })).toBe(false);
    expect(accepts(rollOut, { skill: '' })).toBe(false);
    expect(accepts(rollOut, { skill: 'Walk', canaries: ['Robot'] })).toBe(false);
    expect(accepts(rollOut, { skill: 'Walk', units: ['-robot'] })).toBe(false);
    expect(accepts(rollOut, { skill: 'Walk', units: ['a'.repeat(33)] })).toBe(false);
    expect(accepts(rollOut, { skill: 'Walk', canaries: units(32) })).toBe(true);
    expect(accepts(rollOut, { skill: 'Walk', canaries: units(33) })).toBe(false);
  });
});

describe('roll_back payloads', () => {
  it('take one unit name and refuse anything else', () => {
    expect(accepts(rollBack, { unit: 'robot-2' })).toBe(true);
    expect(accepts(rollBack, {})).toBe(false);
    expect(accepts(rollBack, { unit: 'robot 2' })).toBe(false);
    expect(accepts(rollBack, { unit: '../robot' })).toBe(false);
  });
});

describe('operate payloads', () => {
  it('take an optional unit name', () => {
    expect(accepts(operate, {})).toBe(true);
    expect(accepts(operate, { action: { forward: 0.5 }, unit: 'robot-3' })).toBe(true);
    expect(accepts(operate, { unit: 'Robot_3' })).toBe(false);
    expect(accepts(operate, { unit: '' })).toBe(false);
  });
});
