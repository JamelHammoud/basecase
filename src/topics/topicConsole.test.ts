import { describe, expect, it } from 'vitest';
import { parseCase, touchTheDots } from '../cases/testing';
import { DEFAULT_CONSOLE } from '../cases/console/layout';
import type { CaseConsole } from '../cases/console/format';
import { fixtureRobots } from '../sim/fixtures/robots';
import { recordingConsole } from './topicConsole';
import { CAMERA, DIAGNOSTICS, IMU, JOINTS, MODE, ODOMETRY, recordedTopic, ROSOUT, topicIndex } from './topicFixtures';

const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
const kase = touchTheDots(arm);
const added = (c: CaseConsole) => c.panels.slice(DEFAULT_CONSOLE.panels.length);

describe('a recording’s console', () => {
  it('adds one area after the last with log, diagnostics, states, IMU, odometry and one message', () => {
    const second = recordedTopic('/gait', 'std_msgs/String', [0], { labels: { data: ['trot'] } });
    const third = recordedTopic('/arm_mode', 'std_msgs/String', [0], { labels: { data: ['hold'] } });
    const index = topicIndex(CAMERA, ROSOUT, DIAGNOSTICS, MODE, second, third, IMU, ODOMETRY, JOINTS);
    const made = recordingConsole(DEFAULT_CONSOLE, index);

    expect(added(made)).toEqual([
      { id: 'log', kind: 'log' },
      { id: 'diagnostics', kind: 'diagnostics' },
      { id: 'states', kind: 'states', signal: 'topic./mode.data' },
      { id: 'states-2', kind: 'states', signal: 'topic./gait.data' },
      { id: 'imu', kind: 'plot', signals: ['topic./imu.angular_velocity.*'] },
      {
        id: 'odometry',
        kind: 'plot',
        signals: ['topic./odom.pose.pose.position.y'],
        x: 'topic./odom.pose.pose.position.x',
      },
      { id: 'message', kind: 'message', topic: 'topic./arm_mode' },
    ]);
    expect(made.layout.areas).toEqual([
      ...DEFAULT_CONSOLE.layout.areas,
      { size: 360, panels: ['log', 'diagnostics', 'states', 'states-2', 'imu', 'odometry', 'message'] },
    ]);
    expect(() => parseCase({ ...JSON.parse(JSON.stringify(kase)), console: made })).not.toThrow();
  });

  it('shows only what the recording has, and never repeats a panel id', () => {
    const base: CaseConsole = {
      ...DEFAULT_CONSOLE,
      panels: [...DEFAULT_CONSOLE.panels, { id: 'message', kind: 'text', text: 'Hi' }],
      layout: { areas: [...DEFAULT_CONSOLE.layout.areas, { size: 300, panels: ['message'] }] },
    };
    const made = recordingConsole(base, topicIndex(CAMERA, JOINTS));

    expect(made.panels.at(-1)).toEqual({ id: 'message-2', kind: 'message', topic: 'topic./joint_states' });
    expect(made.layout.areas.at(-1)).toEqual({ size: 360, panels: ['message-2'] });
    expect(recordingConsole(DEFAULT_CONSOLE, topicIndex(CAMERA))).toBe(DEFAULT_CONSOLE);
  });
});
