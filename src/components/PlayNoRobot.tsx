import { Button, CasesIcon, EmptyState, RobotsIcon } from '../design-system';

export function PlayNoRobot({ onBrowseRobots }: { onBrowseRobots: () => void }) {
  return (
    <EmptyState
      icon={<CasesIcon className="w-5 h-5" />}
      title="No robot"
      action={
        <Button
          variant="primary"
          size="sm"
          icon={<RobotsIcon className="w-4 h-4" />}
          title="Add a robot to play with"
          onClick={onBrowseRobots}
        >
          Browse Robots
        </Button>
      }
    />
  );
}
