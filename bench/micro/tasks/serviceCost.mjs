import { allOf, answerSays, checkRowsOk, headsSeated, screwsEngaged, underBudget, viaAdapter } from '../checks.mjs';
import { component, printed } from '../parts.mjs';
import { box } from '../csg.mjs';
import { legs, serviceTorso } from '../standins.mjs';

const service = (label, args) => viaAdapter('serviceDepth', label, args);

export const SERVICE_TASKS = [
  {
    id: 'S1',
    category: 'service',
    title: 'Replaceable battery',
    instruction: 'Make the battery replaceable without taking the robot apart',
    realScene: 'ribbit',
    fixture: () => serviceTorso({ chargePort: false }),
    grade: allOf(
      service('Battery out in ≤ 2 steps with one basic tool, no joint or structural part removed', {
        target: 'battery',
        maxSteps: 2,
        maxTools: 1,
        forbidJoints: true,
        forbidStructural: true,
      }),
    ),
  },
  {
    id: 'S2',
    category: 'service',
    title: 'Pi from the front',
    instruction: 'Make the Pi replaceable from the front',
    realScene: 'ribbit',
    fixture: () => serviceTorso({ chargePort: false }),
    grade: allOf(
      service('Electronics tray out in ≤ 5 steps, one tool, nothing actuated removed', {
        target: 'pi',
        maxSteps: 5,
        maxTools: 1,
        forbidJoints: true,
        from: 'front',
      }),
    ),
  },
  {
    id: 'S3',
    category: 'service',
    title: 'Knee servo swap',
    instruction: 'Make each knee servo replaceable without removing the torso',
    realScene: 'ribbit',
    fixture: () => legs(),
    grade: allOf(
      service('Each knee servo out in ≤ 10 steps, touching only its joint and the two links next to it', {
        targets: ['left-knee-servo', 'right-knee-servo'],
        maxSteps: 10,
        onlyNeighbours: true,
      }),
    ),
  },
  {
    id: 'S4',
    category: 'service',
    title: 'Enclosure for a board',
    heldOut: true,
    instruction: 'Design an enclosure for this board',
    fixture: () => ({
      name: 'Board',
      parts: [
        component({ id: 'pi', name: 'Raspberry Pi 5', catalog: 'component:raspberry-pi-5', position: [0, 0, 10] }),
      ],
    }),
    grade: allOf(viaAdapter('enclosures', 'No part encloses serviceable contents without a split')),
  },
  {
    id: 'S5',
    category: 'service',
    title: 'Split the torso shell',
    instruction: 'Split the torso shell so the electronics can be reached',
    realScene: 'ribbit',
    fixture: () => serviceTorso(),
    grade: allOf(screwsEngaged(), headsSeated(), service('Pi out in ≤ 5 steps', { target: 'pi', maxSteps: 5 })),
  },
];

const JETSON = 'component:seeed-recomputer-j4012';

export const COST_TASKS = [
  {
    id: 'C1',
    category: 'cost',
    title: 'Over budget',
    instruction: 'Bring this under budget without losing function',
    realScene: 'ribbit-dynamixel',
    fixture: () =>
      legs({
        knee: 'component:feetech-sts3215|c018',
        extras: [
          component({ id: 'computer', name: 'Main computer', group: 'Pelvis', catalog: JETSON, position: [0, 0, 300] }),
        ],
        project: { budgetUsd: 350 },
      }),
    grade: allOf(
      underBudget(),
      checkRowsOk({ pattern: /torque|stance|heat/i, label: 'Torque rows still Pass or Warn' }),
    ),
  },
  {
    id: 'C2',
    category: 'cost',
    title: 'Servo selection',
    instruction:
      'Pick servos for this 3 kg biped: 5 per leg, about 50 cm tall, $600 budget. Selection only: place them, no brackets.',
    fixture: () => ({
      name: 'Biped brief',
      parts: [
        printed({
          id: 'body-envelope',
          name: 'Body envelope',
          group: 'Body',
          solid: box([180, 120, 500], [0, 0, 250]),
        }),
      ],
      project: { budgetUsd: 600 },
    }),
    grade: allOf(viaAdapter('servoSolver', "Within 15% of the solver's cheapest passing set", { tolerance: 0.15 })),
  },
  {
    id: 'C3',
    category: 'cost',
    title: 'Knee servo safety question',
    heldOut: true,
    instruction: 'Is this servo choice safe for walking?',
    realScene: 'ribbit',
    fixture: () =>
      legs({
        extras: [
          printed({
            id: 'battery',
            name: 'Battery',
            group: 'Pelvis',
            solid: box([70, 35, 25], [0, 0, 285]),
            supply: 'supply:lipo-3s-2200',
          }),
        ],
      }),
    grade: allOf(
      answerSays({
        label: 'Names the knee as Warn or Fail at a crouch, no false Pass',
        must: [
          /\bknee/i,
          /\b(warn|fail|marginal|not safe|unsafe|insufficient|too weak|thin margin|undersized|overload)/i,
        ],
        mustNot: [/\bknees?\b[^.\n]{0,60}\b(?:is|are|looks?|should be)\s+(?:safe|fine|ok(?:ay)?|plenty)\b/i],
      }),
    ),
    solutionAnswer:
      'The knee is the weak joint: at a 40° crouch on one leg the STS3215 runs near half of stall, so it lands in Warn, and with a heavier battery it would Fail.',
  },
];
