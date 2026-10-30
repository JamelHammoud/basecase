import { z } from 'zod';
import { VIEW, bridge, fail, imageReply, text } from './shared.mjs';

export const simulate = {
  name: 'simulate',
  config: {
    title: 'Simulate (MuJoCo physics)',
    description:
      "Runs the scene in MuJoCo, the physics engine robots are trained in, and reports what happened: whether each legged robot stayed up or fell (and when), tilt, how far it moved, and every joint's peak actuator effort as a share of its torque limit (its servos' stall torque, the maker's published limit, or an estimate from weight when no servo is assigned). " +
      'Built from the scene itself: parts collide as convex hulls and weigh what verify_design weighs them; every joint is a position servo. The robot starts in the pose on the canvas, just above the floor. Robots with leg joints are free to fall; others are bolted down. ' +
      'Controllers: "hold" holds the pose (does it stand on its own?), "animation:<name>" plays an animation\'s keyframes as servo targets (does the walk cycle really walk, or fall?), "policy:<name>" runs a trained policy, "limp" turns the servos off. ' +
      "Shove it with pushes (direction in the robot's frame, strength as a share of its weight for 0.15 s; 0.5 is a firm shove). Ask for frames to see renders of the simulated robot. " +
      'Use it after define_joints and verify_design on anything with legs, and fix what it finds (servos at 100% for long, falls while holding a pose) before you finish.',
    inputSchema: {
      seconds: z.number().min(0.5).max(30).optional().describe('Simulated time, default 5'),
      controller: z.string().optional().describe('"hold" (default), "limp", "animation:<name>" or "policy:<name>"'),
      pushes: z
        .array(
          z.object({
            at: z.number().min(0),
            direction: z.enum(['forward', 'backward', 'left', 'right']),
            strength: z.number().min(0.05).max(3).optional(),
          }),
        )
        .max(10)
        .optional(),
      frames: z.array(z.number().min(0)).max(4).optional().describe('Times (s) to render, e.g. [0.5, 2, 5]'),
      views: z.array(VIEW).max(2).optional(),
    },
  },
  handler: async (args) => {
    try {
      return imageReply(await bridge('simulate', args, 180000), 'Nothing to simulate.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const trainPolicy = {
  name: 'train_policy',
  config: {
    title: 'Train a policy',
    description:
      'Trains a neural-network controller for the scene\'s legged robot with reinforcement learning (PPO) in MuJoCo, on the user\'s machine. Tasks: "stand" (stay up and recover from shoves) or "walk" (walk forward at speed_mps). ' +
      'Sim-to-real is on: 64 copies train at once, each with its own friction, link masses and servo strength, shoved every few seconds. Runs in the background for `minutes` (5–20 is typical; walking needs more than standing); the first run installs Python, MuJoCo and PyTorch. ' +
      'Returns at once: follow it with training_status, then test the result with simulate controller "policy:<name>". Only train when the user asks for it or the design is final: it occupies the CPU.',
    inputSchema: {
      task: z.enum(['stand', 'walk']),
      minutes: z.number().int().min(1).max(60).optional(),
      speed_mps: z.number().min(0.05).max(2).optional().describe('Walking speed, default 0.3'),
    },
  },
  handler: async (args) => {
    try {
      return text((await bridge('train', args, 120000))?.text || 'ok');
    } catch (err) {
      return fail(err);
    }
  },
};

export const trainingStatus = {
  name: 'training_status',
  config: {
    title: 'Training status',
    description:
      "Progress of the running training (time, steps, reward, how long episodes last before a fall) and the scene's trained policies with how each did in a clean test run.",
    inputSchema: {},
  },
  handler: async () => {
    try {
      return text((await bridge('training_status', {}, 20000))?.text || 'No training.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const verifyDesign = {
  name: 'verify_design',
  config: {
    title: 'Verify design',
    description:
      "Engineering checks computed from the model (not opinions), each PASS, WARN, FAIL or NOT RUN with the measured number: mass and centre of mass; servo torque of every declared joint at the servo supply voltage (leg joints: the whole robot on one leg at the gait's crouch, at least 30°, PASS ≤ 0.40 of stall with walking heat ≤ rated, FAIL above 0.60 of stall or 1.6× rated; other joints: the limb held out across its range, PASS ≤ 0.40 of stall and ≤ rated); peak torque (with peak: true and a trained walk policy, it walks the policy in MuJoCo for 14 s with two shoves at 0.3 × body weight and every servo limited to 0.7 × stall at the supply voltage: per leg joint the 99th percentile of the torque the joint asks for over 25 ms windows, PASS ≤ 0.80 of stall, WARN ≤ 1.0, FAIL past stall for over 50 ms or a fall; the walk's RMS torque then replaces the 0.67 × stance estimate in walking heat); servo output on the joint axis; a support bearing opposite each servo; every joint swept through its range for collisions; battery voltage against each servo's input range; current and runtime; standing stability; PLA touching servos; the BOM estimate against the budget (FAIL over it, WARN above 90%). " +
      'Run it after define_joints and again before you finish. A design is not buildable while anything FAILs; fix and re-run. The peak test adds a few seconds: run it once a walk policy is trained.',
    inputSchema: {
      peak: z.boolean().optional().describe('Walk the trained policy in simulation to measure peak torque'),
    },
  },
  handler: async ({ peak }) => {
    try {
      const res = await bridge('verify', { peak: peak === true }, 300000);

      return text(res?.text || 'Nothing to check yet.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const getBom = {
  name: 'get_bom',
  config: {
    title: 'Bill of materials',
    description:
      'The build\'s bill of materials, computed from the scene: catalog components and exact hardware counted by part, printed parts as filament grams, plus purchase-only extras (set_build). Each line has its catalog key and its price: the one the user checked from a listing, with the date, else a dated list price from a maker or distributor store (an estimate, marked ~), else "no price known". ' +
      "The estimate (checked prices plus list prices) is compared with the user's budget. Use it to keep the design inside the budget (fewer or cheaper actuators, one screw size), and report it at the end. Never state a price that is not in this output.",
    inputSchema: {},
  },
  handler: async () => {
    try {
      const res = await bridge('bom', {}, 60000);

      return text(res?.text || 'Nothing to buy yet.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const checkPrintability = {
  name: 'check_printability',
  config: {
    title: 'Check printability',
    description:
      "Checks every printed part (or ids) for the scene's printer (its bed size and keep-out zones are in the first line of the result): best flat orientation, bed fit, overhangs past 45° and the support they need, walls thinner than two 0.42 mm lines, filament grams, print time and plates. " +
      'Fix every part it flags: split anything that does not fit (with dowels, a lap joint or screws across the split), give large overhangs 45° chamfers or a flat face to print on, thicken thin walls. Estimates without a slicer; slice_plates gives the slicer’s own numbers.',
    inputSchema: { ids: z.array(z.string()).max(200).optional() },
  },
  handler: async ({ ids }) => {
    try {
      const res = await bridge('printability', { ids }, 180000);

      return text(res?.text || 'No printed parts yet.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const slicePlates = {
  name: 'slice_plates',
  config: {
    title: 'Slice plates',
    description:
      "Lays the printed parts out on plates for the scene's printer and slices them in the user's slicer (Bambu Studio or OrcaSlicer), with the printer's own profiles. " +
      'Returns per plate the real print time, filament grams, whether it needs supports and the slicer’s warnings. Use it once the design passes check_printability, to report real print time and filament. ' +
      'It never starts a print: the user sends plates from the Build tab.',
    inputSchema: {},
  },
  handler: async () => {
    try {
      const res = await bridge('slice', {}, 600000);

      return text(res?.text || 'No printed parts to slice.');
    } catch (err) {
      return fail(err);
    }
  },
};

export const setBuild = {
  name: 'set_build',
  config: {
    title: 'Build settings',
    description:
      'Adds things to buy that are not modeled parts (battery, charger, buck converter, power switch, cables, microSD) to the BOM, by catalog key: "supply:<id>" from find_parts, or "component:<id>" for a catalog part that isn\'t placed. ' +
      'Merged by key; qty 0 removes one. Also sets the budget (only when the user gives one) and the default print material. With a budget it returns the budget plan: actuators up to 60%, compute up to 15%, power about 10%, with what the scene spends on each so far.',
    inputSchema: {
      extras: z
        .array(
          z.object({
            key: z.string(),
            qty: z.number().int().min(0).max(500),
            note: z.string().max(120).optional().describe('Why it is needed, e.g. "powers the servo bus"'),
          }),
        )
        .max(40)
        .optional(),
      budget_usd: z.number().min(0).max(100000).optional(),
      material: z.enum(['PLA', 'PETG', 'ABS', 'ASA']).optional(),
    },
  },
  handler: async ({ extras, budget_usd, material }) => {
    try {
      const res = await bridge('set_build', { extras, budgetUsd: budget_usd, material });
      const unknown = res?.unknown?.length
        ? ` Unknown keys (not added): ${res.unknown.join(', ')}. Use keys from find_parts.`
        : '';

      const plan = res?.plan ? `\n\n${res.plan}` : '';

      return text(
        `Extras: ${(res?.extras ?? []).map((x) => `${x.qty}× ${x.key}`).join(', ') || 'none'}.${unknown}${plan}`,
      );
    } catch (err) {
      return fail(err);
    }
  },
};

export const buildGuide = {
  name: 'build_guide',
  config: {
    title: 'Build guide',
    description:
      'Makes the printable step-by-step assembly guide (PDF) from the scene, in the style of IKEA and LEGO instructions: cover, tools, a parts catalogue with hardware drawn at 1:1, then illustrated steps with exploded parts, screw paths, sub-assemblies and detail callouts. It replaces the previous guide and takes a few seconds. ' +
      'Only call it when the user asks for a build guide, assembly instructions or a PDF of the build. When a design is finished and verified, do not make one: tell the user they can, with the link [build guide](#build-guide).',
    inputSchema: {},
  },
  handler: async () => {
    try {
      const res = await bridge('build_guide', {}, 300000);

      return text(res?.text || 'No guide made: the scene has no parts to build.');
    } catch (err) {
      return fail(err);
    }
  },
};
