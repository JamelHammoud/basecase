import { Button, StopIcon, TrainIcon } from '../../design-system';
import type { DatasetActions } from './DatasetPane';

export function DatasetTrainButton({ actions }: { actions: DatasetActions }) {
  if (actions.vision?.running)
    return (
      <Button size="sm" icon={<StopIcon className="w-4 h-4" />} onClick={actions.vision.stop}>
        Stop Training
      </Button>
    );

  if (!actions.canTrain) return null;

  return (
    <Button size="sm" disabled={actions.trainBusy} icon={<TrainIcon className="w-4 h-4" />} onClick={actions.train}>
      {actions.vision ? 'Train' : 'Train from Tries'}
    </Button>
  );
}
