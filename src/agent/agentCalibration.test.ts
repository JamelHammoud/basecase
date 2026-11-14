import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARM } from '../../e2e/armFixture';
import { replayErrors } from '../reality/jointReplay';
import { unitHistories, withMount } from '../reality/projectCalibrations';
import { FAMILY_SERVOS } from '../reality/servoPart';
import { calibrationErrorsText } from './agentCalibration';

vi.mock('../reality/jointReplay', () => ({ replayErrors: vi.fn(async () => null) }));

const jointId = ARM.project.joints[0].id;
const found = {
  servo: FAMILY_SERVOS.sts3215,
  verdict: 'measured' as const,
  mount: { zeroCounts: 2100, direction: -1 as const },
  reason: 'Measured from camera',
};
const own = withMount(ARM.project, jointId, found);
const project = withMount(own, jointId, { ...found, mount: { ...found.mount, zeroCounts: 2200 } }, 'arm-a');

beforeEach(() => vi.mocked(replayErrors).mockClear());

describe('agent calibration replay', () => {
  it('replays the requested unit histories', async () => {
    await calibrationErrorsText(project, 'arm-a');

    expect(vi.mocked(replayErrors).mock.calls[0][0]).toBe(unitHistories(project, 'arm-a')[jointId]);
  });

  it('keeps the scene own histories as the default for existing callers', async () => {
    await calibrationErrorsText(project);

    expect(vi.mocked(replayErrors).mock.calls[0][0]).toBe(project.servoCalibrations?.[jointId]);
  });

  it('does not replay the scene own calibration for an uncalibrated unit', async () => {
    expect(await calibrationErrorsText(project, 'arm-b')).toBe('');
    expect(vi.mocked(replayErrors).mock.calls.every(([history]) => history === undefined)).toBe(true);
  });
});
