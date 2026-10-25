import { z } from 'zod';
import { vec3 } from './schemas.mjs';
import { bridge, fail, text } from './shared.mjs';

export const findObjects = {
  name: 'find_objects',
  web: true,
  config: {
    title: 'Find SimReady objects',
    description:
      "Searches NVIDIA's SimReady Central: about 3,600 real objects (kitchenware, food, boxes, bottles, tools, lab gear, furniture, appliances) and robots and grippers from their makers (Franka, UR, FANUC, Comau, Robotiq, OnRobot…), each with measured size, mass, friction and colliders for MuJoCo. " +
      'kind "object" (default) searches objects, "robot" searches arms, grippers and robot bodies. Returns name, maker, size, mass, license and the url to pass to insert_object. ' +
      'Use it for things a robot must handle or work around (a mug to grasp, a shelf to reach, a box to push), not for parts of the robot itself (those come from find_parts).',
    inputSchema: {
      query: z.string().max(80).describe('2-5 words, e.g. "coffee mug", "cardboard box", "two finger gripper"'),
      kind: z.enum(['object', 'robot']).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('find_objects', args))?.text || 'No results.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const insertObject = {
  name: 'insert_object',
  web: true,
  config: {
    title: 'Insert a SimReady object',
    description:
      "Downloads one SimReady asset by the url find_objects returned and inserts it. Objects land as a group that moves freely in simulate (falls, slides, can be pushed or grasped) with the maker's mass and friction; " +
      'robots and grippers come with their joints, like import_robot. position (mm, the bottom centre) places it; omit it to put it beside the scene. The first insert installs the USD reader (about a minute).',
    inputSchema: {
      url: z.string().url(),
      position: vec3.optional(),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('insert_object', args, 300000))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};
