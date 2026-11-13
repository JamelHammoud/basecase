import { synthesizeFourBar, type LinkageSolution, type Vec2 } from '../utils/linkage';
import { reply } from '../utils/workerRpc';

export const linkageHandlers = {
  synthesize: (points: Vec2[]) => reply<LinkageSolution[]>(synthesizeFourBar(points)),
};
