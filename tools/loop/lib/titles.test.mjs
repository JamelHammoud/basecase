import { describe, expect, it } from 'vitest';
import { openMatch, sameTitle, similarTitle } from './titles.mjs';

describe('sameTitle', () => {
  it.each([
    [
      'Update: Move the agent adapters to their latest releases',
      'Update: Move the agent adapters to their latest releases',
    ],
    ['Refine: Trim the inspector', 'refine:  trim the inspector.'],
  ])('treats %s and %s as one', (a, b) => {
    expect(sameTitle(a, b)).toBe(true);
  });

  it('tells different work apart', () => {
    expect(sameTitle('Feature: Import from Onshape', 'Feature: Import from Fusion')).toBe(false);
  });
});

describe('similarTitle', () => {
  it.each([
    [
      'Open a Case as a Live Console with the robot, its cameras, joints and tries',
      'Open the Case in a Live Console with its robot, cameras, tries and joints',
    ],
    [
      'Feature: Number each servo as you plug it in, with the canvas lighting its joint',
      "Number each servo as it's plugged in, with the canvas lighting its joint",
    ],
  ])('treats %s and %s as the same work', (a, b) => {
    expect(similarTitle(a, b)).toBe(true);
  });

  it.each([
    ['Feature: Import from Onshape', 'Feature: Import from Fusion'],
    [
      'Open a Case as a Live Console with the robot, its cameras, the operator camera, joints and tries in one window',
      'Open a Case in a Live Console showing the robot, its cameras, joints and tries',
    ],
    ['Simulate the hexapod walking in MuJoCo', 'Train the hexapod walking in MuJoCo'],
    ['Train a walking policy for the hexapod in a Case', 'Simulate a walking policy for the hexapod in a Case'],
    ['Import STEP files into the Parts library', 'Export STEP files from the Parts library'],
    ['Add joint limits to the Pose tab', 'Remove joint limits from the Pose tab'],
    ['Show servo torque in the Build checks', 'Show servo cost in the Build checks'],
    ['Show servo torque in the Build checks', 'Show servo torque and cost in the Build checks'],
    ['Simulate catalog LiDARs from their spec rows', 'Import a scanned room as a Case world at true size'],
    ['Digest: week of 2026-11-06', 'Digest: week of 2026-11-13'],
    ['Teleop a G1 over ethernet from the Mac camera', 'Teleop a H1 over ethernet from the Mac camera'],
  ])('tells %s and %s apart', (a, b) => {
    expect(similarTitle(a, b)).toBe(false);
  });
});

describe('openMatch', () => {
  const steps = ['loop:next', 'loop:building'];
  const open = (title, label) => [{ number: 7, title, labels: [label] }];

  it('finds the open step a new step rewords', () => {
    const step = open('Open the Case in a Live Console with its robot, cameras, tries and joints', 'loop:building');

    expect(openMatch('Open a Case as a Live Console with the robot, its cameras, joints and tries', step, steps)).toBe(
      step[0],
    );
  });

  it('files the Train step while the Simulate step for the same robot is open', () => {
    const step = open('Simulate the hexapod walking in MuJoCo', 'loop:next');

    expect(openMatch('Train the hexapod walking in MuJoCo', step, steps)).toBeNull();
  });

  it('files a step that rewords the idea it promotes', () => {
    const idea = open('Train a policy from teleop demos', 'loop:idea');

    expect(openMatch('Train a policy from the teleop demos', idea, steps)).toBeNull();
  });

  it('files a step under an arc with the same words', () => {
    const arc = open('Operate a robot from a Case Live Console', 'loop:arc');

    expect(openMatch('Operate the robot from the Case Live Console', arc, steps)).toBeNull();
  });

  it('files the next digest while the last one is open', () => {
    expect(openMatch('Digest: week of 2026-11-13', open('Digest: week of 2026-11-06', 'loop:digest'))).toBeNull();
  });

  it('finds any issue with the same title', () => {
    expect(openMatch('Digest: week of 2026-11-13', open('digest: week of 2026-11-13', 'loop:digest'))).not.toBeNull();
  });
});
