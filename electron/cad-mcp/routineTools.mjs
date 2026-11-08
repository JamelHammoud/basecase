import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

const ROUTINE_SHAPE =
  'A Routine is plain JSON: { schema: 1, id, name, sentence, requires: [camera|microphone|speaker|legs|wheels|arms|head|depth], ' +
  'base: a do step that loops (walk), watchers: [{ id, model, rateHz, maxAgeMs, publishes: { type } }], ' +
  'reactions: [{ id, when: condition, cooldownMs, onRetrigger: ignore|restart|queue, body: keepGoing|stopFirst, steps }], safeStop: settle }. ' +
  'Steps: do { skill, holds }, say { text }, infer { model, input, output: { type } }, ask { prompt, input?, answers }, ' +
  'if { test, then, else }, wait { until? ms? }, together { branches, join }. Every do, say, infer, ask and wait has timeoutMs, onTimeout and onFail; ' +
  'an empty path ends the reaction. Give steps short ids (recognize, lookAt) so traces and faults can name them. ' +
  'Conditions: { fact, is | atLeast | atMost }, { all }, { any }, { not }. {name} in a Say needs an If on the face check above it. ' +
  'A do step may carry move: { distance (m), speed (m/s), heading (°, 0 ahead, 90 left) } on walk to drive a distance, or { turn (°, + left) } on turn-away; it ends when the robot has gone that far. ' +
  'A Routine made by hand starts with a base do settle of 500 ms whose onTimeout path is its steps.';

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
      'A Routine with the id of one in the scene replaces it, so read_routine first and keep what the user built by hand; prefer edit_routine for small changes. ' +
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

const at = z
  .object({
    seq: z.object({
      parent: z.string().max(64).describe('The step, base or reaction id that owns the path'),
      key: z.enum(['steps', 'then', 'else', 'onTimeout', 'onFail', 'branches']),
      branch: z.number().int().min(0).max(7).optional(),
    }),
    index: z.number().int().min(0).max(512),
  })
  .describe('Where in a path: the base’s onTimeout path holds the main steps of a Routine made by hand');

const edit = z.discriminatedUnion('op', [
  z.object({ op: z.literal('insert'), at, step: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('remove'), id: z.string().max(64) }),
  z.object({ op: z.literal('move'), id: z.string().max(64), to: at }),
  z.object({ op: z.literal('update'), id: z.string().max(64), patch: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('addWatcher'), watcher: z.record(z.string(), z.unknown()) }),
  z.object({ op: z.literal('rename'), name: z.string().min(1).max(120) }),
]);

export const readRoutine = {
  name: 'read_routine',
  config: {
    title: 'Read the Routine',
    description:
      'Returns the Routine open in the Routines view as JSON, with any edits the user made by hand: { routine, routines: [{ id, name, active }], nodes: [{ id, kind }], compiled: { ok, errors } }. ' +
      'Read it before changing a Routine so hand edits are kept.',
    inputSchema: {},
  },
  handler: (args) => ask('read_routine', args, 60000),
};

export const editRoutine = {
  name: 'edit_routine',
  config: {
    title: 'Edit the Routine',
    description:
      'Applies edits to the open Routine (or the one with id) the same way the user’s hand edits do, so both keep each other’s changes, and recompiles it. ' +
      'insert puts a step at a path index, remove deletes a step, watcher or reaction by id, move takes a step to another place, update sets fields on a step, watcher or reaction (never its paths), addWatcher adds a watcher, rename names the Routine. ' +
      'Edits that leave the Routine unreadable are refused whole. Returns { ok, changed, errors, nodes }.',
    inputSchema: {
      id: z.string().max(64).optional().describe('The Routine to edit; the open one by default'),
      edits: z.array(edit).min(1).max(64),
    },
  },
  handler: (args) => ask('edit_routine', args, 180000),
};
