import React, { useState } from 'react';
import { Button, MetaLine, Modal } from '../../design-system';
import type { FleetIncident } from '../../robot/fleetIncidents';
import { acknowledgeIncident, inspectUnitProblems, useInspectedUnit } from '../../robot/fleetIncidentStore';
import { clockTime, dayLabel } from '../../utils/timeAgo';

interface FleetIncidentsProps {
  incidents: FleetIncident[];
  onOpenTry?: (id: string) => Promise<boolean>;
}

export const FleetIncidents: React.FC<FleetIncidentsProps> = ({ incidents, onOpenTry }) => {
  const inspected = useInspectedUnit();
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const newest = incidents[0];

  if (!newest) return null;

  const showTry = async (id: string) => {
    const opened = await onOpenTry?.(id).catch(() => false);

    if (opened) inspectUnitProblems(null);
    else setUnavailable(id);
  };

  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Button
        size="sm"
        variant="ghost"
        title={`Inspect Problems for ${newest.unit}`}
        onClick={() => inspectUnitProblems(newest.unit)}
      >
        Inspect Problems
      </Button>
      <Modal isOpen={inspected === newest.unit} onClose={() => inspectUnitProblems(null)} title={newest.name}>
        <div className="overflow-y-auto px-5 pb-5 divide-y divide-white/[0.07]">
          {incidents.map((incident) => (
            <div key={incident.id} className="py-3" data-incident={incident.id} data-active={incident.active}>
              <p className="text-[13px] text-white/90">{incident.message}</p>
              <MetaLine
                className="text-[12px] text-white/50 mt-1"
                items={[
                  incident.unit,
                  dayLabel(new Date(incident.startedAt).toISOString()),
                  clockTime(incident.startedAt),
                  incident.active ? 'Active' : 'Recovered',
                  incident.acknowledgedAt !== null ? 'Acknowledged' : null,
                ]}
              />
              <MetaLine
                className="text-[12px] text-white/50 mt-1"
                items={[incident.modelHash?.slice(0, 7), incident.policyHash?.slice(0, 7)]}
              />
              <div className="flex gap-2 mt-2">
                {incident.acknowledgedAt === null && (
                  <Button size="sm" variant="secondary" onClick={() => acknowledgeIncident(incident.id)}>
                    Acknowledge
                  </Button>
                )}
                {incident.recording && onOpenTry && unavailable !== incident.recording && (
                  <Button size="sm" variant="secondary" onClick={() => void showTry(incident.recording!)}>
                    Open Try
                  </Button>
                )}
              </div>
              {(!incident.recording || unavailable === incident.recording) && (
                <p className="text-[12px] text-white/50 mt-2">Try unavailable</p>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
};
