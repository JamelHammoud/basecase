import { describe, expect, it } from 'vitest';
import type { Skill } from '../skills/artifacts';
import { isPolicySpec } from '../sim/policy';
import manifest from './kit/manifest.json';
import { loadKitLibrary } from './kitLibrary';

const FILES = import.meta.glob<Skill>('./kit/*.skill.json', { import: 'default', eager: true });

describe('the committed Kit policies', () => {
  it('are each listed in the manifest with their robot, Forge version, steps and Arena line', () => {
    const listed = manifest.policies.map((p) => `./kit/${p.file}`).sort();

    expect(Object.keys(FILES).sort()).toEqual(listed);

    for (const entry of manifest.policies) {
      const skill = FILES[`./kit/${entry.file}`];

      expect(skill.name).toBe(entry.skill);
      expect(skill.binding.design).toBe(entry.robot);
      expect(skill.origin?.cost.steps).toBe(entry.steps);
      expect(skill.evidence?.passed).toBe(true);
      expect(skill.evidence?.summary).toBe(entry.arena);
      expect(entry.forge).toMatch(/^forge-train \d+\.\d+\.\d+ at [0-9a-f]{7,}$/);
      expect(skill.controller.kind === 'policy' && isPolicySpec(skill.controller.policy)).toBe(true);
    }
  });

  it('load for Routines in file order', async () => {
    const skills = await loadKitLibrary();

    expect(skills.map((s) => s.name)).toEqual(
      Object.keys(FILES)
        .sort()
        .map((f) => FILES[f].name),
    );
  });
});
