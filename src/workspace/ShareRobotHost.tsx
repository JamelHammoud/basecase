import { ShareRobotSheet } from '../components/ShareRobotSheet';
import { ErrorBoundary } from '../design-system';
import type { ShareRobot } from './useShareRobot';

export function ShareRobotHost({ active, share }: { active: boolean; share: ShareRobot }) {
  if (!active || !share.league.open) return null;

  return (
    <ErrorBoundary region="Share Robot" onClose={share.league.close}>
      <ShareRobotSheet league={share.league} link={share.link} />
    </ErrorBoundary>
  );
}
