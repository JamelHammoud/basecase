import { useEffect, useState } from 'react';
import { Button, Select } from '../../design-system';
import { timeAgo } from '../../utils/timeAgo';
import { useInventory } from './useInventory';

export function FleetInventory({ org }: { org: string }) {
  const inventory = useInventory(org);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);

    return () => clearInterval(timer);
  }, []);

  return (
    <section className="mx-auto max-w-5xl space-y-4 rounded-xl bg-[#1f1f1f] p-3">
      {inventory.error && <p role="alert">{inventory.error}</p>}
      <Select
        aria-label="Site"
        value={inventory.site}
        onChange={(event) => inventory.chooseSite(event.target.value)}
        options={[
          { value: '', label: 'All sites' },
          ...inventory.sites.items.map((site) => ({ value: site.id, label: site.name })),
        ]}
      />
      {inventory.sites.next && <Button onClick={inventory.nextSites}>Next Sites</Button>}
      <table className="w-full text-left text-[14px]">
        <thead>
          <tr className="h-10 text-white/50">
            <th>Robot</th>
            <th>Identity</th>
            <th>Status</th>
            <th>Observed</th>
          </tr>
        </thead>
        <tbody>
          {inventory.robots.items.map((robot) => (
            <tr key={robot.id} className="h-12 border-t border-white/[0.06]">
              <td>{robot.name}</td>
              <td className="text-[12px] text-white/50">{robot.id}</td>
              <td>{!robot.observedAt || now - Date.parse(robot.observedAt) > 60000 ? 'Stale' : robot.status}</td>
              <td>{robot.observedAt ? timeAgo(robot.observedAt) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {inventory.robots.next && <Button onClick={inventory.nextRobots}>Next Robots</Button>}
    </section>
  );
}
