import loadMujoco from '@mujoco/mujoco';
import { expect, it } from 'vitest';
import { selfContactDesigns } from './fixtures/selfContactDesigns';
import { prepareContactModel } from './contactPreparationClient';
import type { SimModel } from './mjcfTypes';
import type { Recording } from './recorder';
import { SimEngine } from './engine';
import { Recorder, frameContacts } from './recorder';
import { encodeRecording, decodeRecording } from '../cases/recordingFile';
import { robotPackageFiles } from './robotPackage/buildRobotPackage';

it.each(selfContactDesigns)(
  '$name keeps its contact model and evidence in Robot Package and recording bytes',
  async (spec) => {
    const fixture = spec.build();
    const model = await prepareContactModel(fixture.input);
    const files = robotPackageFiles({
      name: spec.name,
      robot: model.robots[0].name,
      model,
      parts: fixture.input.parts,
      project: { ...fixture.input.project, joints: fixture.input.rig.joints },
      measures: fixture.input.measures,
      triangles: {},
      policies: [],
    });

    expect(new TextDecoder().decode(files['robot.xml'])).toBe(model.xml);

    const engine = new SimEngine(await loadMujoco(), model);
    const controller = { kind: 'hold' as const, values: fixture.reference };
    const recorder = new Recorder(engine, controller);

    try {
      engine.setController(controller);
      engine.stepHook = recorder.hook;

      for (let i = 0; i < 150; i++) engine.step(0.02);

      const original = recorder.finish();
      const reopened = decodeRecording(encodeRecording(original))!;
      const expected = fixture.expected.slice().sort().join('/');
      const observed = recordingPairs(reopened, model);

      expect(observed).toContain(expected);
      expect(reopened.qpos).toEqual(original.qpos);
      expect(reopened.contacts).toEqual(original.contacts);
      expect(reopened.controller).toEqual(controller);
    } finally {
      engine.dispose();
    }
  },
);

function recordingPairs(recording: Recording, model: SimModel): Set<string> {
  const observed = new Set<string>();

  for (let frame = 0; frame < recording.frames; frame++) {
    const contacts = frameContacts(recording, frame);

    for (let i = 0; i < contacts.length; i += 2) {
      const a = model.bodies[contacts[i]].parts;
      const b = model.bodies[contacts[i + 1]].parts;

      a.forEach((first) => b.forEach((second) => observed.add([first, second].sort().join('/'))));
    }
  }

  return observed;
}
