import { useSyncExternalStore } from 'react';
import { robotSnapshot, subscribeRobot } from './robotStore';

export const useRobot = () => useSyncExternalStore(subscribeRobot, robotSnapshot, robotSnapshot);
