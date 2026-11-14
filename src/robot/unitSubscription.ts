import type { RobotEvent } from './robotState';
import { subscribeFleetEvents } from './robotStore';
import { unitOfEvent } from './robotUnits';

export const subscribeUnitRobot = (unit: string, listener: (event: RobotEvent) => void) =>
  subscribeFleetEvents((event) => {
    if (unitOfEvent(event) === unit) listener(event);
  });
