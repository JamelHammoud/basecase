import { describe, expect, it, vi } from 'vitest';
import {
  availableCapabilities,
  AVAILABLE,
  taskRequirements,
  unavailableCapabilities,
  withRequirements,
} from './capabilities.mjs';

describe('executable work', () => {
  it('rejects a task needing an interactive Windows host while allowing Windows CI work', () => {
    expect(unavailableCapabilities({ requires: ['windows-host'] })).toEqual(['windows-host']);
    expect(unavailableCapabilities({ requires: ['windows-ci'], body: 'Verify the Windows build in CI.' })).toEqual([]);
    expect(unavailableCapabilities({ body: 'Resume on a Windows execution host and measure ten runs.' })).toEqual([
      'windows-host',
    ]);
  });

  it('catches missing hardware and contradictory requirements before a task can be filed', () => {
    expect(unavailableCapabilities({ requires: ['physical-robot', 'cuda-gpu'] })).toEqual([
      'physical-robot',
      'cuda-gpu',
    ]);
    expect(unavailableCapabilities({ requires: ['repository'], body: 'This requires a Windows host.' })).toEqual([
      'windows-host',
    ]);
  });

  it('persists declared requirements through an issue body and rejects unknown capabilities', () => {
    const body = withRequirements('Build the feature.', ['repository', 'windows-ci']);

    expect(taskRequirements({ body })).toEqual(['repository', 'windows-ci']);
    expect(unavailableCapabilities({ body: 'Requires: unavailable-service\nBuild it.' })).toEqual([
      'unavailable-service',
    ]);
    expect(withRequirements(body, ['macos-host'])).toBe(body);
  });
});

describe('Windows diagnostic requirements', () => {
  it('gates legacy before/after Windows measurements separately from published-ref CI', () => {
    const task = {
      title: 'Make shutdown deterministic on Windows',
      body: 'Requires: windows-ci\n\nUse a Windows run on a branch and measure at least ten runs before and ten after at equal load.',
    };

    expect(unavailableCapabilities(task)).toContain('windows-diagnostics');
    expect(unavailableCapabilities(task, [...AVAILABLE, 'windows-diagnostics'])).toEqual([]);
    expect(
      unavailableCapabilities({
        title: 'Repair Windows gallery navigation',
        body: 'Collect at least ten baseline and ten fixed runs at equal load.',
      }),
    ).toContain('windows-diagnostics');
  });

  it('keeps ordinary Windows CI work and Linux-only measurements eligible', () => {
    expect(
      unavailableCapabilities({
        title: 'Verify Windows compatibility',
        body: 'Requires: windows-ci\nRun the regression checks on the published PR.',
      }),
    ).toEqual([]);
    expect(
      unavailableCapabilities({
        title: 'Keep Linux and Windows compatible',
        body: 'Requires: windows-ci, linux-container\n\nMeasure ten Linux runs before and ten after at equal load. Verify Windows compatibility in PR CI.',
      }),
    ).toEqual([]);
  });

  it('allows retained-log analysis and makes an explicitly configured Windows host diagnostic-capable', () => {
    expect(
      unavailableCapabilities({
        title: 'Analyze Windows failures',
        body: 'Requires: repository\n\nCompare ten baseline and ten fixed runs from existing logs.',
      }),
    ).toEqual([]);
    vi.stubEnv('BASECASE_LOOP_CAPABILITIES', 'windows-host');

    try {
      expect(availableCapabilities()).toContain('windows-diagnostics');
      expect(unavailableCapabilities({ requires: ['windows-diagnostics'] })).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
