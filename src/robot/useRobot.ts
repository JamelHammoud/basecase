import { useSyncExternalStore } from 'react';
import { fleetSnapshot, robotSnapshot, subscribeRobot } from './robotStore';

export const useRobot = () => useSyncExternalStore(subscribeRobot, robotSnapshot, robotSnapshot);

export const useFleet = () => useSyncExternalStore(subscribeRobot, fleetSnapshot, fleetSnapshot);
