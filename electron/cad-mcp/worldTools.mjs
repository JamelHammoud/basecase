import { z } from 'zod';
import { bridge, fail, imageReply, text } from './shared.mjs';

const vec3 = z.array(z.number().finite()).length(3);

export const worldObject = z.object({
  id: z
    .string()
    .regex(/^[\w.-]{1,80}$/)
    .optional()
    .describe('Plain id; made from the name when left out'),
  name: z.string().min(1).max(80),
  kind: z.enum(['box', 'sphere', 'cylinder']),
  position: vec3.describe('Center [x, y, z] in mm; z up, floor z = 0'),
  size: vec3.describe(
    '[x, y, z] extent in mm; a sphere uses x as its diameter, a cylinder x as diameter and z as height',
  ),
  behavior: z
    .enum(['static', 'dynamic', 'marker'])
    .describe(
      'static: fixed and solid (walls, ramps, tables); dynamic: falls and can be pushed; marker: a goal you can see, never collides',
    ),
  mass_g: z.number().positive().max(100000).optional().describe('Dynamic objects only, default 100'),
  friction: z.number().min(0.05).max(2).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export const setWorld = {
  name: 'set_world',
  config: {
    title: 'Set the simulated world',
    description:
      'Places objects in the simulated world around the robot: boxes, spheres and cylinders that are static (walls, steps, tables), dynamic (things to push or carry) or markers (goals to reach, no collision). ' +
      'World objects are never parts: they stay out of the BOM, checks and edits, and only exist in simulation. Each call replaces the whole world; an empty list clears it. ' +
      'Use it to test a design against its job (a step to climb, a box to push, a target to touch), then run start_drive or simulate.',
    inputSchema: {
      objects: z.array(worldObject).max(64),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('set_world', args, 60000))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};

const command = z.object({
  at: z.number().min(0).max(30).describe('Seconds from the start'),
  forward: z.number().min(-1).max(1).optional(),
  left: z.number().min(-1).max(1).optional(),
  turn: z.number().min(-1).max(1).optional().describe('Counter-clockwise from above'),
  lift: z.number().min(-1).max(1).optional().describe('Arms: raise (1) or lower (-1) the end effector'),
  target: vec3.optional().describe('Arms: move the end effector to this point, mm, z up'),
  grip: z.number().min(0).max(1).optional().describe('Arms with a gripper: close it (1) or open it (0)'),
});

export const startDrive = {
  name: 'start_drive',
  config: {
    title: 'Drive the robot',
    description:
      'Drives the robot in MuJoCo with live commands, the same way a person drives it with the keyboard, and reports what happened. ' +
      'Arms follow the end effector (warm-started inverse kinematics; with a gripper, the point between its fingers, held pointing down); rovers mix wheel speeds; robots with four or more legs walk on baked gait cycles after a 5 s fall check; any legged robot with a trained walk skill (bipeds included) drives through it. Without one, the reply says how to train it. ' +
      'Commands are held until the next one; each axis runs -1 to 1. With live: true it drives the canvas for the user to watch and returns at once; otherwise it runs headless and returns how far the robot went, how much it turned, whether it fell, and the end effector for arms.',
    inputSchema: {
      seconds: z.number().min(0.5).max(30).optional().describe('Simulated time, default 6'),
      commands: z.array(command).min(1).max(60),
      live: z.boolean().optional(),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('start_drive', args, 180000))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};

export const operate = {
  name: 'operate',
  config: {
    title: 'Operate the robot',
    description:
      'Operates the robot one step at a time in the live simulation on the canvas, the way a person at the controls does, and shows what its cameras see after each step. ' +
      "Each call holds one action for a few seconds, pauses, then returns the views from the robot's camera parts and the scene's camera view, plus whether it fell and where the end effector is. Look at the images, decide the next action, and call again: the robot stays where the last step left it. " +
      'Actions are the same as start_drive: forward, left and turn (-1 to 1) for robots that move around; lift (-1 to 1) or target (a point in mm, z up) for arms. restart: true puts the robot back at its start. ' +
      'The user places stationary camera views with Add Camera View; ask for the ones you need by name.',
    inputSchema: {
      action: z
        .object({
          forward: z.number().min(-1).max(1).optional(),
          left: z.number().min(-1).max(1).optional(),
          turn: z.number().min(-1).max(1).optional().describe('Counter-clockwise from above'),
          lift: z.number().min(-1).max(1).optional().describe('Arms: raise (1) or lower (-1) the end effector'),
          target: vec3.optional().describe('Arms: move the end effector to this point, mm, z up'),
        })
        .optional(),
      seconds: z.number().min(0.1).max(5).optional().describe('How long to hold the action, default 1'),
      cameras: z
        .array(z.string())
        .max(3)
        .optional()
        .describe("Camera names to see through; default the scene view and the robot's cameras"),
      restart: z.boolean().optional(),
    },
  },
  handler: async (args) => {
    try {
      return imageReply(await bridge('operate', args, 120000), 'Nothing to operate.');
    } catch (err) {
      return fail(err);
    }
  },
};
