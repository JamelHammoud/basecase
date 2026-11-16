import { Button } from '../../design-system';
import { robotPosition } from './robotPosition';
import type { RegistryItem } from './client';

export function FleetRobot({ robot, now, onOpen }: { robot: RegistryItem; now: number; onOpen: () => void }) {
  const location = robotPosition(robot);
  const stale = Boolean(robot.pose?.observedAt && now - Date.parse(robot.pose.observedAt) > 60000);
  const state = positionState(Boolean(location), stale, robot.pose?.quality);

  return (
    <section className="space-y-2 rounded-xl bg-[#262626] p-3" data-testid="fleet-selected-robot">
      <h2 className="text-[16px] font-semibold">{robot.name}</h2>
      <dl className="grid grid-cols-2 gap-2">
        <dt>Status</dt>
        <dd>{statusState(robot, now)}</dd>
        <dt>Position</dt>
        <dd className="capitalize">{state}</dd>
        {location && (
          <>
            <dt>WGS84 ellipsoid</dt>
            <dd>{`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}, ${location.altitudeM.toFixed(2)} m`}</dd>
          </>
        )}
        {robot.pose?.observedAt && (
          <>
            <dt>Observed</dt>
            <dd>{robot.pose.observedAt}</dd>
          </>
        )}
        {robot.pose?.floor && (
          <>
            <dt>Floor</dt>
            <dd>{robot.pose.floor}</dd>
          </>
        )}
        <dt>Current work</dt>
        <dd>{robot.work?.current}</dd>
        <dt>Declared next work</dt>
        <dd>{robot.work?.next}</dd>
      </dl>
      {robot.facilitySite && <Button onClick={onOpen}>Open Facility</Button>}
    </section>
  );
}

function positionState(located: boolean, stale: boolean, quality: string | undefined) {
  if (!located) return 'Absent';

  if (stale) return 'Stale';

  return quality;
}

function statusState(robot: RegistryItem, now: number) {
  return !robot.observedAt || now - Date.parse(robot.observedAt) > 60000 ? 'Stale' : robot.status;
}
