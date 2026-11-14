import { unzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { describe, expect, it } from 'vitest';
import { EMPTY_HISTORY, recordMount } from '../../reality/history';
import { fixturePackageJob } from '../fixtures/robotPackage';
import { fixtureRobots } from '../fixtures/robots';
import { exportRobotJointMap, exportRobotPackageZip } from './robotPackageClient';

describe('robot installer joint map', () => {
  it('uses exactly the joint map and calibration produced by Robot Package export', async () => {
    const arm = fixtureRobots().find((robot) => robot.id === 'arm-3dof')!;
    const { job } = fixturePackageJob(arm);
    const mount = { zeroCounts: 2184, direction: -1 } as const;

    job.project = {
      ...job.project,
      servoCalibrations: {
        [arm.joints[0].id]: recordMount(EMPTY_HISTORY, {
          servo: { componentId: 'feetech-sts3215', variant: 'c001' },
          verdict: 'measured',
          mount,
          reason: '',
        }),
      },
    };

    const map = await exportRobotJointMap({
      name: job.robot,
      model: { joints: job.model.joints, robots: job.model.robots },
      parts: job.parts,
      project: job.project,
    });
    const files = unzipSync(await exportRobotPackageZip(job));
    const packaged = JSON.parse(new TextDecoder().decode(files[`${job.name}/joint_map.json`]));

    expect(JSON.parse(JSON.stringify(map))).toEqual(packaged);
    expect(map.joints[0]).toMatchObject({ zero_counts: 2184, direction: -1, calibration: { mount } });
    expect(map.joints.length).toBeGreaterThan(0);
    expect(map.joints.every((joint) => Number.isFinite(joint.zero_counts))).toBe(true);
  });
});
