import { ARM_TASKS } from './tasksArm';
import { MOVE_TASKS } from './tasksMove';
import { POSE_TASKS } from './tasksPose';
import type { ZooTask } from './taskTypes';

const soft = (id: string, prompts: string[]): ZooTask => ({
  id,
  family: 'soft',
  classes: [],
  say: (rng) => prompts[Math.floor(rng() * prompts.length) % prompts.length],
});

const SOFT_TASKS: ZooTask[] = [
  soft('fold-a-towel', ['Fold the towel in half.', 'Fold this cloth into a neat square.']),
  soft('pour-water', ['Pour the water from the cup into the bowl.', 'Fill the glass from the jug.']),
  soft('tie-a-knot', ['Tie the rope into a knot.', 'Tie a bow with the ribbon.']),
];

export const ZOO_TASKS: readonly ZooTask[] = Object.freeze([...MOVE_TASKS, ...POSE_TASKS, ...ARM_TASKS, ...SOFT_TASKS]);

export const zooTask = (id: string): ZooTask => {
  const task = ZOO_TASKS.find((t) => t.id === id);

  if (!task) throw new Error(`No zoo task ${id}`);

  return task;
};
