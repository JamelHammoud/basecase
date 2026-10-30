import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AgentKeys } from './agentKeys.mjs';

const reversing = {
  available: () => true,
  encrypt: (value) => Buffer.from([...value].reverse().join('')).toString('base64'),
  decrypt: (sealed) => [...Buffer.from(sealed, 'base64').toString()].reverse().join(''),
};

let dir;

afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

describe('agent keys', () => {
  it('keeps keys encrypted on disk and reads them back in a new session', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-keys-'));
    new AgentKeys({ dir, secrets: reversing }).set('gemini', ' AIzaTest ');

    expect(fs.readFileSync(path.join(dir, 'agent-keys.json'), 'utf-8')).not.toContain('AIzaTest');
    expect(new AgentKeys({ dir, secrets: reversing }).get('gemini')).toBe('AIzaTest');

    new AgentKeys({ dir, secrets: reversing }).set('gemini', '');

    expect(new AgentKeys({ dir, secrets: reversing }).get('gemini')).toBeUndefined();
  });

  it('never writes a key to disk without encryption', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-keys-'));

    const keys = new AgentKeys({ dir, secrets: undefined });

    keys.set('gemini', 'AIzaTest');

    expect(keys.get('gemini')).toBe('AIzaTest');
    expect(fs.existsSync(path.join(dir, 'agent-keys.json'))).toBe(false);
  });

  it('keeps other secrets in their own file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-keys-'));
    new AgentKeys({ dir, secrets: reversing, file: 'printer-keys.json' }).set('p1s', '12345678');

    expect(fs.existsSync(path.join(dir, 'agent-keys.json'))).toBe(false);
    expect(new AgentKeys({ dir, secrets: reversing, file: 'printer-keys.json' }).get('p1s')).toBe('12345678');
    expect(new AgentKeys({ dir, secrets: reversing }).get('p1s')).toBeUndefined();
  });
});
