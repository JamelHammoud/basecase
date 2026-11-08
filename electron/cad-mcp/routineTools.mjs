import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const ROUTINE_SHAPE =
  'A Routine is plain JSON: { schema: 1, id, name, sentence, requires: [camera|microphone|speaker|legs|wheels|arms|head|depth], ' +
  'base: a do step that loops (walk), watchers: [{ id, model, rateHz, maxAgeMs, publishes: { type } }], ' +
  'reactions: [{ id, when: condition, cooldownMs, onRetrigger: ignore|restart|queue, body: keepGoing|stopFirst, steps }], safeStop: settle }. ' +
  'Steps: do { skill, holds }, say { text }, infer { model, input, output: { type } }, ask { prompt, input?, answers }, ' +
  'if { test, then, else }, wait { until? ms? }, together { branches, join }. Every do, say, infer, ask and wait has timeoutMs, onTimeout and onFail; ' +
  'an empty path ends the reaction. Give steps short ids (recognize, lookAt) so traces and faults can name them. ' +
  'Conditions: { fact, is | atLeast | atMost }, { all }, { any }, { not }. {name} in a Say needs an If on the face check above it.';

const scenario = z
  .object({
    covers: z.string().max(200).optional(),
    world: z
      .array(
        z.object({
          at: z.number().min(0).max(60),
          fact: z.string().max(64),
          value: z.union([z.boolean(), z.number(), z.string().max(64)]),
        }),
      )
      .max(64)
      .optional()
      .describe('Facts the watchers see, by time in seconds, e.g. { at: 6, fact: "person", value: true }'),
    mocks: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Answers by node id: a face check is "known" or "unknown", an Ask is one of its answers'),
    faults: z
      .array(
        z.object({
          node: z.string().max(64),
          at: z.number().min(0).max(60),
          kind: z.enum(['hang', 'fail', 'garbage', 'slow']),
        }),
      )
      .max(16)
      .optional(),
    seconds: z.number().min(1).max(60).optional().describe('Simulated seconds, default 20'),
  })
  .describe('What happens around the robot while the Routine runs');

const ask = async (kind, args, timeoutMs) => {
  try {
    return text(await bridge(kind, args, timeoutMs));
  } catch (err) {
    return fail(err);
  }
};

export const makeRoutine = {
  name: 'make_routine',
  config: {
    title: 'Make a Routine',
    description:
      'Turns a sentence into a Routine: a flowchart the robot runs as one background skill plus reactions to what it sees and hears. ' +
      'Write the Routine as JSON from the sentence and pass both. The app compiles it against the robot in the scene (its sensors, its Motor Kit skills and their proven transitions) and draws it in the Routines view. ' +
      'Returns { ok, errors, nodes }; each error has a code, a plain message and the node it names. missing-capability means the robot lacks a sensor (the user can add it in one click); needs-training means a skill isn’t ready on this robot. ' +
      ROUTINE_SHAPE,
    inputSchema: {
      sentence: z.string().min(1).max(2000).describe('What the user asked for, in their words'),
      routine: z.record(z.string(), z.unknown()).describe('The Routine JSON'),
    },
  },
  handler: (args) => ask('make_routine', args, 180000),
};

export const testRoutine = {
  name: 'test_routine',
  config: {
    title: 'Test the Routine',
    description:
      'Runs every scenario the compiler finds for the Routine in the scene (each branch, timeout, failure and preemption) on the real coordinator with mocked perception. ' +
      'Returns { passed, scenarios: [{ covers, passed }], errors }; passed is false when the Routine doesn’t compile.',
    inputSchema: {},
  },
  handler: (args) => ask('test_routine', args, 180000),
};

export const runRoutine = {
  name: 'run_routine',
  config: {
    title: 'Run the Routine',
    description:
      'Runs the Routine in MuJoCo with the robot’s Motor Kit skills, while the scenario feeds what the robot sees and hears. ' +
      'With live: true it runs on the canvas, lighting each node of the flow as it runs, and returns { started } at once. ' +
      'Otherwise it runs headless and returns { passed, said, failures, fellAt }. A Routine that doesn’t compile never runs.',
    inputSchema: { scenario, live: z.boolean().optional() },
  },
  handler: (args) => ask('run_routine', args, 180000),
};
