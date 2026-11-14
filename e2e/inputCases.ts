import { presetCase } from '../src/cases/caseBuilder';
import type { Routine } from '../src/routines/schema';
import type { FixtureRobot } from '../src/sim/fixtures/parts';
import { DEFAULT_PROJECT } from '../src/types/robotics';
import { buildRig } from '../src/utils/kinematics';

export const HEARD_WORD = 'sit';

const sitOnVoice: Routine = {
  schema: 1,
  id: 'sit-on-voice',
  name: 'Sit',
  requires: ['wheels'],
  base: { kind: 'do', id: 'start', skill: 'drive', holds: ['body'], timeoutMs: 60000, onTimeout: [], onFail: [] },
  watchers: [{ id: 'voice', model: 'live-input', rateHz: 20, maxAgeMs: 300, publishes: { type: 'text' } }],
  reactions: [
    {
      id: 'on-sit',
      when: { fact: 'voice', is: HEARD_WORD },
      cooldownMs: 0,
      onRetrigger: 'ignore',
      body: 'keepGoing',
      steps: [{ kind: 'wait', ms: 500, timeoutMs: 1000, onTimeout: [], onFail: [] }],
    },
  ],
  safeStop: 'drive',
};

const PUPPET_CONSOLE = {
  input: ['hand'],
  panels: [
    { id: 'operator', kind: 'camera', title: 'You', signal: 'camera.operator' },
    { id: 'go', kind: 'button', action: 'try' },
  ],
  layout: { areas: [{ size: 320, panels: ['operator', 'go'] }, { canvas: true }] },
};

const SIT_CONSOLE = {
  input: ['voice', 'keys'],
  panels: [{ id: 'go', kind: 'button', action: 'try' }],
  layout: { areas: [{ canvas: true }, { size: 280, panels: ['go'] }] },
};

function sceneWithCase<Kase extends { id: string; name: string }>(robot: FixtureRobot, kase: Kase) {
  return {
    name: kase.id,
    parts: robot.parts,
    project: { ...DEFAULT_PROJECT, joints: robot.joints, cases: [kase] },
  };
}

export function puppetScene(arm: FixtureRobot) {
  const preset = presetCase('touch-the-dots', buildRig(arm.joints, arm.parts), arm.parts);

  return sceneWithCase(arm, { ...preset, id: 'hand-puppet', name: 'Hand Puppet', console: PUPPET_CONSOLE });
}

export function sitScene(rover: FixtureRobot) {
  const preset = presetCase('reach-the-flag', buildRig(rover.joints, rover.parts), rover.parts);

  return sceneWithCase(rover, {
    ...preset,
    id: 'sit-when-told',
    name: 'Sit When Told',
    console: SIT_CONSOLE,
    logic: sitOnVoice,
  });
}
