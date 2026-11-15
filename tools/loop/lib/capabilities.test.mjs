import { describe, expect, it } from 'vitest';
import { taskRequirements, unavailableCapabilities, withRequirements } from './capabilities.mjs';

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
