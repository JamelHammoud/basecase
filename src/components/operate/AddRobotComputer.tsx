import { useSyncExternalStore } from 'react';
import { ErrorBoundary } from '../../design-system';
import { openRobotComputer, robotComputerSnapshot, subscribeRobotComputer } from '../../robot/robotComputer';
import { RobotComputerForm } from './RobotComputerForm';

export function AddRobotComputer() {
  const install = useSyncExternalStore(subscribeRobotComputer, robotComputerSnapshot, robotComputerSnapshot);

  if (!install) return null;

  return (
    <ErrorBoundary region="Add a Robot Computer" onClose={() => openRobotComputer(null)}>
      <RobotComputerForm install={install} />
    </ErrorBoundary>
  );
}
