import { describe, expect, it } from 'vitest';
import { portsFromLogs } from './ports.mjs';

describe('portsFromLogs', () => {
  it('reads each echoed port once, even when diff() echoes it again', () => {
    const line = 'ECHO: "PORT", "horn", [0, 0, 18.9], [0, 0, 2], "output", 19.95';
    const { ports, problems } = portsFromLogs([line, 'ECHO: "other"', line]);

    expect(problems).toEqual([]);
    expect(ports).toEqual([
      { name: 'horn', position: [0, 0, 18.9], axis: [0, 0, 1], kind: 'output', diameterMm: 19.95 },
    ]);
  });

  it('explains a malformed port', () => {
    expect(portsFromLogs(['ECHO: "PORT", "x", [0, 0], [0, 0, 1], "bore"']).problems[0]).toMatch(/needs name/);
  });
});
