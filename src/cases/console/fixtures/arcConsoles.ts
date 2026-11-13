export interface ConsoleExample {
  name: string;
  console: Record<string, unknown>;
}

export const ARC_CONSOLES: ConsoleExample[] = [
  {
    name: 'G1 arm teleop',
    console: {
      input: ['camera', 'keys'],
      panels: [
        { id: 'operator', kind: 'camera', title: 'You', signal: 'camera.operator' },
        { id: 'robot-eye', kind: 'camera', signal: 'camera.*' },
        { id: 'joints', kind: 'table', of: 'joints', columns: ['target', 'position'] },
        { id: 'arms', kind: 'plot', title: 'Arms', signals: ['joint.*.position'], seconds: 10 },
      ],
      layout: {
        areas: [
          { size: 480, panels: ['operator', 'robot-eye'] },
          { canvas: true },
          { size: 360, panels: ['joints', 'arms'] },
        ],
      },
    },
  },
  {
    name: 'Rover',
    console: {
      input: ['gamepad'],
      panels: [
        { id: 'front', kind: 'camera', signal: 'camera.front_camera' },
        { id: 'map', kind: 'map', title: 'Map', trail: 60 },
        { id: 'speed', kind: 'value', title: 'Speed', signal: 'robot.speed' },
      ],
      layout: { areas: [{ size: 640, panels: ['front'] }, { canvas: true }, { size: 280, panels: ['map', 'speed'] }] },
    },
  },
  {
    name: 'Sorting cell',
    console: {
      input: ['policy'],
      signals: [{ id: 'sorted', kind: 'counter', when: { signal: 'probe.dot0', below: 30 } }],
      panels: [
        { id: 'count', kind: 'value', title: 'Sorted', signal: 'sorted' },
        { id: 'failures', kind: 'list', title: 'Failures', of: 'failures' },
        { id: 'go', kind: 'button', action: 'try' },
        { id: 'overhead', kind: 'camera', signal: 'camera.*' },
      ],
      layout: { areas: [{ canvas: true }, { size: 300, panels: ['count', 'failures', 'go', 'overhead'] }] },
    },
  },
  {
    name: 'Block game',
    console: {
      input: ['keys'],
      signals: [
        { id: 'clock', kind: 'timer', seconds: 60 },
        { id: 'knocked', kind: 'counter', when: { signal: 'probe.dot1', below: 40 } },
        {
          id: 'score',
          kind: 'score',
          sum: [
            { signal: 'knocked', times: 10 },
            { signal: 'clock', times: 1 },
          ],
        },
      ],
      panels: [
        { id: 'clock', kind: 'value', title: 'Time', signal: 'clock' },
        { id: 'score', kind: 'value', title: 'Score', signal: 'score' },
        { id: 'go', kind: 'button', action: 'try' },
        { id: 'reset', kind: 'button', action: 'reset' },
        { id: 'tries', kind: 'list', of: 'tries' },
      ],
      layout: {
        areas: [
          { size: 240, panels: ['clock', 'score'] },
          { canvas: true },
          { size: 300, panels: ['go', 'reset', 'tries'] },
        ],
      },
    },
  },
  {
    name: 'MIDI hexapod',
    console: {
      input: ['midi'],
      panels: [
        { id: 'timeline', kind: 'plot', title: 'Timeline', signals: ['joint.*.target'], seconds: 30 },
        { id: 'eye', kind: 'camera', signal: 'camera.*' },
      ],
      layout: { areas: [{ canvas: true }, { size: 520, panels: ['timeline', 'eye'] }] },
    },
  },
];
