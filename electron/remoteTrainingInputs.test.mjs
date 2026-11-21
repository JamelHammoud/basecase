import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { fixtureModel } from '../src/skills/fixtureModels';
import { holdingPolicy } from '../src/skills/hubSkillFixtures';
import { kitJob } from '../src/skills/kitJob';
import { moveEnvironment } from '../src/skills/moveEnvironment';
import { quadSit } from '../src/skills/moveFixtures';
import { moveJob } from '../src/skills/moveJob';
import { trainingJob } from '../src/sim/trainingJob';
import { RemoteTrainer } from './remoteTrainer.mjs';

function requests() {
  const quad = fixtureModel('quad-servo');
  const hex = fixtureModel('hexapod');
  const rover = fixtureModel('rover-diff');
  const arm = fixtureModel('arm-3dof');
  const stand = kitJob(quad, 'stand', { minutes: 1, seed: 1 });
  const clone = trainingJob(arm, arm.robots[0].key, { task: 'stand', minutes: 1, command: [0, 0, 0] }, 'Touch');
  const width = 12 + clone.joints.length * 3;
  const demos = {
    episodes: [
      { obs: [Array(width).fill(0)], actions: [Array(clone.joints.length).fill(0)], split: 'train' },
      { obs: [Array(width).fill(1)], actions: [Array(clone.joints.length).fill(0)], split: 'validation' },
    ],
  };

  return [
    { xml: quad.xml, job: stand },
    { xml: hex.xml, job: kitJob(hex, 'stand', { minutes: 1, seed: 2 }) },
    {
      xml: rover.xml,
      job: trainingJob(rover, rover.robots[0].key, { task: 'walk', minutes: 1, command: [0.2, 0, 0] }, 'Drive'),
    },
    { xml: arm.xml, job: { ...clone, algo: 'bc', demos } },
    { xml: quad.xml, job: moveJob(quad, moveEnvironment(quad, quadSit()), { name: 'Sit', minutes: 1, seed: 1 }) },
    { xml: quad.xml, job: { ...stand, warmPolicy: holdingPolicy(stand) } },
  ];
}

it('sends existing quad, hexapod, rover, cloning, motion and warm-start inputs through the same remote preparation', async () => {
  const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-inputs-'));
  const prepared = [];
  const remote = {
    selected: () => true,
    descriptors: () => [],
    prepare: async (entry) => {
      prepared.push(entry);

      return { ...entry };
    },
    dispatch: async () => {},
    poll: async () => ({ state: 'running', events: [], stderr: '' }),
  };
  const trainer = new RemoteTrainer({ libraryDir, emit: () => {}, remote });
  const inputs = requests();

  try {
    inputs.forEach((request, index) =>
      trainer.start({ ...request, workspaceId: `scene-${index}`, recoveryKey: `workflow-${index}:0` }),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(prepared).toHaveLength(6);

    for (const [index, entry] of prepared.entries()) {
      expect(fs.readFileSync(path.join(entry.dir, 'model.xml'), 'utf8')).toBe(inputs[index].xml);
      expect(entry.job.joints).toEqual(inputs[index].job.joints);
      expect(entry.job.command).toEqual(inputs[index].job.command);
      expect(entry.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    }

    const clones = prepared[3];
    const warm = prepared[5];

    expect(clones.job.demos).toBe('demos.json');
    expect(JSON.parse(fs.readFileSync(path.join(clones.dir, 'demos.json'), 'utf8'))).toEqual(inputs[3].job.demos);
    expect(warm.job.warmStart).toBe('warm-policy.json');
    expect(JSON.parse(fs.readFileSync(path.join(warm.dir, 'warm-policy.json'), 'utf8'))).toEqual(
      inputs[5].job.warmPolicy,
    );
    expect(prepared[4].job.reference).toEqual(inputs[4].job.reference);
  } finally {
    trainer.dispose();
    fs.rmSync(libraryDir, { recursive: true, force: true });
  }
});
