import { fixtureRobots } from '../sim/fixtures/robots';
import type { FixtureRobot } from '../sim/fixtures/parts';
import type { V3 } from '../utils/kinematics';
import { addPerson, replacePerson } from './personAuthoring';
import type { Case, WorldObject } from './schema';
import { presetCase } from './testing';

export const PERSON_ENCOUNTERS = [
  'Kitchen crossing',
  'Doorway pause',
  'Warehouse aisle crossing',
  'Workshop approach',
  'Hospital corridor crossing',
  'Retail aisle pass',
  'Classroom crossing',
  'Outdoor path crossing',
  'Person behind an arm workbench',
  'Two people crossing a rover route',
] as const;

function obstacle(id: string, position: V3, size: V3): WorldObject {
  return { id, name: id, kind: 'box', position, rotation: [0, 0, 0], size, behavior: 'static', color: '#777777' };
}

function scenery(index: number): WorldObject[] {
  if (index === 0)
    return [
      obstacle('kitchen-counter', [1800, 450, 450], [600, 900, 2200]),
      obstacle('kitchen-island', [-1800, 450, 450], [700, 900, 1600]),
    ];

  if (index === 1)
    return [
      obstacle('doorway-left', [0, 1000, -700], [100, 2000, 800]),
      obstacle('doorway-right', [0, 1000, 1600], [100, 2000, 800]),
      obstacle('doorway-header', [0, 2100, 450], [100, 200, 1500]),
    ];

  if (index === 3)
    return [
      obstacle('tool-bench', [1800, 450, 450], [600, 900, 2000]),
      obstacle('tool-chest', [-1800, 350, 450], [600, 700, 1000]),
    ];

  if (index === 6)
    return [-700, 0, 700].map((x, i) => obstacle(`classroom-desk-${i}`, [x, 350, 1600], [500, 700, 400]));

  if (index === 7) return [obstacle('path-edge', [0, -20, 450], [5000, 40, 3000])];

  if (index === 8) return [obstacle('workbench', [0, 350, 1100], [1200, 700, 500])];

  const aisle = 1800 + index * 100;
  const length = 1800 + index * 200;

  return [
    obstacle(`left-${index}`, [-aisle, 900, 450], [300, 1800, length]),
    obstacle(`right-${index}`, [aisle, 900, 450], [300, 1800, length]),
  ];
}

function configurePerson(kase: Case, index: number, personIndex: number): Case {
  const made = addPerson(kase);
  const object = made.world.objects.filter((item) => item.person).at(-1)!;
  const height = 1100 + index * 100;
  const y = height / 2;
  const z = index === 8 ? -650 : 450 + personIndex * 200;
  const direction = index % 2 ? -1 : 1;
  const position: V3 = [-1200 * direction, y, z];

  return replacePerson(made, {
    ...object,
    position,
    size: [380 + index * 20, height, 220 + index * 15],
    person: {
      speedMmS: 600 + index * 50,
      startSeconds: 0.2 + index * 0.05 + personIndex * 2,
      route: [
        { position, pauseSeconds: index === 1 ? 0.6 : 0 },
        { position: [0, y, z], pauseSeconds: index === 1 ? 0.8 : 0 },
        { position: [1200 * direction, y, z], pauseSeconds: 0 },
      ],
    },
  });
}

export function personEncounterFixture(index: number): { name: string; kase: Case; robot: FixtureRobot } {
  const arm = index === 8;
  const groundRobot = index % 3 === 0 ? 'rover-four' : 'rover-diff';
  const robotId = arm ? 'arm-3dof' : groundRobot;
  const robot = structuredClone(fixtureRobots().find((item) => item.id === robotId)!);
  const base = robot.parts[0];

  base.dimensions.width += index * 3;

  const source = presetCase(robot, arm ? 'touch-the-dots' : 'reach-the-flag');
  const kase = {
    ...source,
    name: PERSON_ENCOUNTERS[index],
    world: { ...source.world, objects: [...source.world.objects, ...scenery(index)] },
    reference: { timeline: source.reference.timeline.map((command) => ({ ...command, at: command.at + 6 })) },
    task: { ...source.task, seconds: source.task.seconds + 6 },
  };
  const first = configurePerson(kase, index, 0);

  return { name: PERSON_ENCOUNTERS[index], robot, kase: index === 9 ? configurePerson(first, index, 1) : first };
}
