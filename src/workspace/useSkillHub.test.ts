import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Command } from '../components/CommandPalette';
import { fixtureModel } from '../skills/fixtureModels';
import { skillCommands } from './skillCommands';
import type { CommandInputs } from './sceneCommands';
import { useSkillHub, type SkillHub, type SkillHubSkills } from './useSkillHub';

vi.mock('../utils/platform/webDemo', () => ({ IS_WEB_DEMO: true }));

function browserHub(options: { available: boolean; busy?: boolean }) {
  const model = fixtureModel('quad-servo');
  const skills: SkillHubSkills = {
    rows: [],
    available: options.available,
    busy: options.busy ?? false,
    model,
    buildModel: async () => model,
    install: () => null,
    loadSkill: async () => null,
    environmentOf: () => null,
  };
  const captured: { hub?: SkillHub } = {};

  function Capture() {
    captured.hub = useSkillHub({ skills, showToast: () => {}, openAccounts: () => {} });

    return null;
  }

  renderToString(createElement(Capture));

  const hub = captured.hub!;
  const commands = skillCommands({ core: { simTraining: { skillHub: hub } } } as unknown as CommandInputs);

  return { hub, commands };
}

const installCommand = (commands: Command[]) => commands.find((command) => command.id === 'skill-install');

describe('Install Skill in the browser', () => {
  it('offers the existing palette command when browser training is available', () => {
    const { hub, commands } = browserHub({ available: true });

    expect(hub.canInstall).toBe(true);
    expect(installCommand(commands)).toMatchObject({ label: 'Install Skill', run: hub.openInstall });
    expect(hub.publishable).toEqual([]);
  });

  it.each([{ available: false }, { available: true, busy: true }])(
    'withholds installation when training cannot start: %j',
    (options) => {
      const { hub, commands } = browserHub(options);

      expect(hub.canInstall).toBe(false);
      expect(installCommand(commands)).toBeUndefined();
    },
  );
});
