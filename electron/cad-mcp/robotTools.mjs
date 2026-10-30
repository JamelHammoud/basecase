import fs from 'node:fs';
import { z } from 'zod';
import { IK_GOAL, PREVIEW, ROBOT, ROOT, vec3 } from './schemas.mjs';
import { VIEW, bridge, evidencePath, fail, text, withImages } from './shared.mjs';

export const defineJoints = {
  name: 'define_joints',
  config: {
    title: 'Declare joints',
    description:
      "Declares the robot's joints so the app can check them: which parts sit on each side, which servo drives it, and its range. " +
      "parent = parts the joint is mounted on (toward the torso); child = the parts of the next link that turn with it (the app adds everything further out through the other joints, and screws, inserts and nuts follow the parts they clamp, so don't list them). Ranges are what the joint must do, not what clears today; verify_design lists any range narrower than its first definition. " +
      "With actuators, the pivot and axis come from the servo's real output spline, so omit origin and axis unless the joint is not on a servo output (a linkage, an idler-only joint). " +
      'A joint with the id of a skeleton joint (define_skeleton) takes its origin, axis, range, limb and name from it when you omit them, and is flagged when its servo output is off the skeleton axis. ' +
      'limb sets the load case: leg joints are also checked standing on that leg. Merged by id unless replace is true.',
    inputSchema: {
      joints: z
        .array(
          z.object({
            id: z.string().regex(/^[a-z0-9_-]+$/),
            name: z.string().max(60).optional().describe('e.g. "Left Knee Pitch"'),
            type: z
              .enum(['revolute', 'prismatic', 'fixed'])
              .optional()
              .describe(
                'revolute (default) turns about the axis; prismatic slides along it (a lift, a linear actuator)',
              ),
            parent: z.array(z.string()).min(1).max(40),
            child: z.array(z.string()).min(1).max(80),
            parent_joint: z
              .string()
              .optional()
              .describe(
                'The joint this one is mounted on, when several joints share one link (a 2-DOF wrist: the second joint sits on the first)',
              ),
            actuators: z
              .array(z.string())
              .max(2)
              .optional()
              .describe('Servo part ids; two opposed servos share the load'),
            origin: vec3
              .optional()
              .describe('A point on the axis, mm, z up (omit to use the servo output or the skeleton joint)'),
            axis: vec3.optional().describe('Axis direction (omit to use the servo output or the skeleton joint)'),
            range: z
              .tuple([z.number().min(-2000).max(0), z.number().min(0).max(2000)])
              .optional()
              .describe(
                'From the modeled pose: degrees, e.g. [-30, 120] (mm for prismatic). Posing and animations are held inside it.',
              ),
            limb: z.enum(['leg', 'arm', 'neck', 'torso', 'other']).optional(),
          }),
        )
        .min(1)
        .max(40),
      replace: z.boolean().optional(),
    },
  },
  handler: async ({ joints, replace }) => {
    try {
      const res = await bridge('define_joints', { joints, replace });

      return text(res?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};

export const getRig = {
  name: 'get_rig',
  config: {
    title: 'Joints and poses',
    description:
      "Lists the robot's joints (id, type, axis, pivot, range, the joint it is mounted on, the parts it moves), the pose on the canvas, saved poses, animations, the feet a gait would use and the mocap landmarks. " +
      'Call it before posing or animating, and after import_robot. With several robots it names them all and details one.',
    inputSchema: { robot: ROBOT },
  },
  handler: async ({ robot }) => {
    try {
      return text((await bridge('get_rig', { robot }))?.text || 'No joints.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const pose = {
  name: 'pose',
  config: {
    title: 'Pose',
    description:
      "Poses the robot on the canvas: set joint values (degrees, or mm for prismatic joints, from the modeled pose; held inside each joint's range), and/or reach with IK (a hand to a point, a foot onto a step), and/or move the whole body. " +
      'Starts from the current pose unless from_rest. Never edits the parts: the modeled pose stays the design. Reports values held at a limit, IK misses, new collisions between links and the floor. ' +
      'save_as keeps it as a named pose; apply restores a saved one. Pass views to see the result. Use it when the user asks for a pose ("wave", "crouch", "T-pose"), and to check a design can reach what it needs to.',
    inputSchema: {
      robot: ROBOT,
      values: z.record(z.string(), z.number()).optional().describe('Joint id → value'),
      relative: z.boolean().optional().describe('Add values to the current ones'),
      from_rest: z.boolean().optional().describe('Start from the modeled pose'),
      root: ROOT,
      ik: z.array(IK_GOAL).max(6).optional().describe('Reach goals solved together; joints given in values stay fixed'),
      apply: z.string().optional().describe('Name of a saved pose to start from'),
      save_as: z.string().max(40).optional(),
      views: z.array(VIEW).max(3).optional(),
    },
  },
  handler: async (args) => {
    try {
      return withImages(await bridge('pose', args, 120000));
    } catch (err) {
      return fail(err);
    }
  },
};

const GAIT = z
  .object({
    feet: z
      .array(z.string())
      .max(8)
      .optional()
      .describe('Ankle joints or foot parts; found automatically when left out'),
    phases: z
      .array(z.number().min(0).max(1))
      .max(8)
      .optional()
      .describe('When each foot lifts, as a fraction of the cycle'),
    stride: z.number().min(0).max(2000).optional().describe('Step length, mm'),
    lift: z.number().min(0).max(500).optional().describe('Foot lift, mm'),
    period: z.number().min(0.2).max(10).optional().describe('Seconds per cycle'),
    duty: z
      .number()
      .min(0.3)
      .max(0.9)
      .optional()
      .describe('Share of the cycle each foot is down (walk ~0.6, trot ~0.5)'),
    crouch: z.number().min(0).max(500).optional().describe('Lower the body, mm'),
    bob: z.number().min(0).max(200).optional(),
    sway: z.number().min(0).max(200).optional(),
    heading: z.number().min(-180).max(180).optional().describe('Degrees from straight ahead'),
    oscillators: z
      .array(
        z.object({
          joint: z.string(),
          amplitude: z.number(),
          phase: z.number().optional().describe('Degrees of the cycle'),
          offset: z.number().optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .optional();

export const animate = {
  name: 'animate',
  config: {
    title: 'Animate',
    description:
      'Makes a named animation and plays it. Either keyframes (t in seconds; joint values, a body offset, and/or IK goals per keyframe; joints not given hold their previous value) for gestures like a wave or a nod, ' +
      'or a gait: a walk cycle solved with IK so the feet stay planted while on the ground and lift while swinging, for any number of legs (2: walk; 4: trot, feet front-left, front-right, rear-left, rear-right). ' +
      'Gait defaults come from the leg length; tune stride, lift, period, crouch (bend the knees so they can reach), bob and sway, and add oscillators for arm swing or a head bob. ' +
      'Same name replaces. Reports IK misses, joints at their limits, collisions and floor contact at 8 sampled times; preview renders frames.',
    inputSchema: {
      name: z.string().min(1).max(40),
      robot: ROBOT,
      duration: z.number().min(0.1).max(600).optional().describe('Seconds (a gait: one cycle)'),
      loop: z.boolean().optional(),
      interpolation: z.enum(['smooth', 'linear']).optional(),
      keyframes: z
        .array(
          z.object({
            t: z.number().min(0),
            values: z.record(z.string(), z.number()).optional(),
            root: ROOT,
            ik: z
              .array(IK_GOAL.extend({ target: vec3 }))
              .max(6)
              .optional(),
          }),
        )
        .max(120)
        .optional(),
      gait: GAIT,
      play: z.boolean().optional(),
      preview: PREVIEW,
    },
  },
  handler: async (args) => {
    try {
      return withImages(await bridge('animate', args, 180000));
    } catch (err) {
      return fail(err);
    }
  },
};

function readEvidenceText(file) {
  if (!file) return { found: true, body: undefined };

  const full = evidencePath(file);

  if (!fs.existsSync(full)) return { found: false };

  return { found: true, body: fs.readFileSync(full, 'utf-8') };
}

export const retargetMotion = {
  name: 'retarget_motion',
  config: {
    title: 'Retarget motion capture',
    description:
      "Turns a BVH motion-capture file (an attached evidence file, or a URL) into an animation on the robot. Each robot limb is pointed the way the performer's limb points (so different proportions and rest poses work), the body follows the hips scaled by leg length, and feet are kept on the floor. " +
      'Bones and joints are matched by name automatically; override with bones / joints (landmark → BVH bone or robot joint id; landmarks: hips, chest, head, leftShoulder, leftElbow, leftWrist, leftHip, leftKnee, leftAnkle, leftToe and the right ones). ' +
      'Reports the match and the mean miss per landmark; preview renders frames.',
    inputSchema: {
      file: z.string().optional().describe('Evidence path of a .bvh file'),
      robot: ROBOT,
      url: z.string().url().optional().describe('Or a link to one'),
      name: z.string().max(40).optional(),
      start: z.number().min(0).optional().describe('Seconds into the clip'),
      end: z.number().min(0).optional(),
      fps: z.number().min(5).max(60).optional(),
      in_place: z.boolean().optional().describe('Keep the robot over its spot (no travel)'),
      loop: z.boolean().optional(),
      bones: z.record(z.string(), z.string()).optional(),
      joints: z.record(z.string(), z.string()).optional(),
      play: z.boolean().optional(),
      preview: PREVIEW,
    },
  },
  handler: async ({ file, ...rest }) => {
    try {
      const evidence = readEvidenceText(file);

      if (!evidence.found) return text(`${file}: not found. Call list_evidence for the exact paths.`);

      const textBody = evidence.body;

      if (!textBody && !rest.url) return text('Give file (an attached .bvh) or url.');

      return withImages(await bridge('retarget', { ...rest, file, text: textBody }, 300000));
    } catch (err) {
      return fail(err);
    }
  },
};

export const importRobot = {
  name: 'import_robot',
  config: {
    title: 'Import a published robot',
    description:
      'Inserts a published robot from its URDF or MuJoCo MJCF with its meshes: every link becomes a part, every joint becomes a posable joint with its real axis and limits. ' +
      'Presets: humanoids unitree-g1 (29 joints), unitree-h1, unitree-h1-2, apptronik-apollo, booster-t1, berkeley-humanoid; small bipeds robotis-op3, open-duck-mini; quadrupeds unitree-go2, unitree-go1, unitree-b2, anymal-c, spot; arms so101, franka-panda, ur5e. Or a raw/GitHub URL to a .urdf or .xml. ' +
      'Use it when the user wants an existing robot to pose or animate, or as a reference beside a design.',
    inputSchema: {
      preset: z
        .enum([
          'unitree-g1',
          'unitree-h1',
          'unitree-h1-2',
          'apptronik-apollo',
          'booster-t1',
          'berkeley-humanoid',
          'robotis-op3',
          'open-duck-mini',
          'unitree-go2',
          'unitree-go1',
          'unitree-b2',
          'anymal-c',
          'spot',
          'so101',
          'franka-panda',
          'ur5e',
        ])
        .optional(),
      url: z.string().url().optional(),
      name: z.string().max(40).optional(),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('import_robot', args, 300000))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};
