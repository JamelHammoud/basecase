import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARM } from '../../e2e/armFixture';
import { presetServo } from '../reality/servoEstimate';
import type { RobotInstallAsk } from '../robot/networkTypes';
import { openRobotComputer, robotComputerSnapshot } from '../robot/robotComputer';
import { fixturePackageJob } from '../sim/fixtures/robotPackage';
import { addRobotComputer } from './robotComputer';
import type { WorkspaceCore } from './useWorkspaceCore';

afterEach(() => {
  openRobotComputer(null);
  vi.unstubAllGlobals();
});

describe('robot computer installation request', () => {
  it('uses the Dynamixel bus and each catalog servo model without collecting export geometry', async () => {
    const models = ['dynamixel-xl330-m288', 'dynamixel-xl430-w250'];
    const actuators = ARM.project.joints.map((joint) => joint.actuators![0]);
    const parts = ARM.parts.map((part) => {
      const index = actuators.indexOf(part.id);

      return index < 0 ? part : { ...part, componentId: models[index], componentVariant: undefined };
    });
    const { job } = fixturePackageJob({ id: 'dynamixel-arm', parts, joints: ARM.project.joints });
    const measureParts = vi.fn();
    const partTriangles = vi.fn();
    const loadPolicy = vi.fn();
    const install = vi.fn(async (_request: RobotInstallAsk) => ({ ok: false as const, message: 'Fixture complete.' }));
    const core = {
      posing: { hasRig: true },
      simTraining: { sim: { model: job.model }, training: { loadPolicy } },
      viewportRef: { current: { measureParts, partTriangles } },
      scene: { sceneName: 'Dynamixel arm' },
      project: job.project,
      parts,
    } as unknown as WorkspaceCore;

    vi.stubGlobal('window', { electronAPI: { robotInstall: install } });
    addRobotComputer(core);
    await robotComputerSnapshot()!({ host: 'robot.local', user: 'robot', key: '' });

    const request = install.mock.calls[0][0];

    expect(request.spec).toMatchObject({ family: 'dynamixel', ids: [1, 2], class: 'arm', emulated: true });
    expect(request.jointMap).toMatchObject({ joints: [{ family: 'dynamixel' }, { family: 'dynamixel' }] });
    expect(request.spec).toHaveProperty('units');

    const units = 'units' in request.spec ? request.spec.units : [];

    for (const [index, componentId] of models.entries()) {
      const { fit, volts } = presetServo({ componentId });

      expect(units?.[index]).toMatchObject({ volts, kt: fit.kt, resistance: fit.resistance, friction: fit.friction });
    }

    expect(measureParts).not.toHaveBeenCalled();
    expect(partTriangles).not.toHaveBeenCalled();
    expect(loadPolicy).not.toHaveBeenCalled();
  });
});
