import { useState } from 'react';
import { Select } from '../../design-system';
import type { RegistryItem } from './client';
import { FleetMap } from './FleetMap';
import { FacilityUpload } from './FacilityUpload';
import { RegistrationForm } from './RegistrationForm';
import { useFacility } from './useFacility';
import { facilityRevision } from './facilityClient';

export function FleetSite({
  org,
  site,
  robots,
  onSelect,
  onChanged,
}: {
  org: string;
  site: RegistryItem;
  robots: RegistryItem[];
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const facility = useFacility(org, site.id, facilityRevision(site.facility), site.registration);
  const sourceRevision = facilityRevision(facility.value?.facility);
  const [floor, setFloor] = useState('');
  const visible = robots
    .filter((robot) => !floor || robot.pose?.floor === floor)
    .map((robot) => ({
      ...robot,
      registration: robot.facilitySite === site.id ? facility.value?.registration : robot.registration,
      facility: robot.facilitySite === site.id ? facility.value?.facility : robot.facility,
    }));

  return (
    <section aria-label={site.name} className="space-y-3" data-testid="fleet-site">
      {site.canManage && (
        <FacilityUpload
          busy={facility.busy}
          onUpload={(files, options, floors) =>
            void facility.upload(files, { ...options, floors }).then((saved) => {
              if (saved) onChanged();
            })
          }
        />
      )}
      {facility.error && (
        <p role="alert" className="text-red-400">
          Check facility files and site access
        </p>
      )}
      {facility.value?.geometry && (
        <>
          <p className="text-white/60">{facility.value.facility?.name}</p>
          <p className="text-[12px] text-white/60">{`${facility.value.facility?.metersPerUnit} m per source unit, ${facility.value.facility?.up} up`}</p>
          {!facility.value.registration && (
            <p className="text-amber-400">Register this facility to place robots on the globe</p>
          )}
          <Select
            aria-label="Floor"
            value={floor}
            onChange={(event) => setFloor(event.target.value)}
            options={[
              { value: '', label: 'All floors' },
              ...facility.value.geometry.floors.map((name) => ({ value: name, label: name })),
            ]}
          />
          <FleetMap
            key={`map:${facility.version}`}
            geometry={facility.value.geometry}
            registration={facility.value.registration}
            robots={visible}
            onSelect={onSelect}
          />
          {site.canManage && (
            <RegistrationForm
              key={`registration:${facility.version}:${JSON.stringify(facility.value.registration)}`}
              path={facility.path}
              facility={facility.value.facility!.hash}
              registration={facility.value.registration ?? null}
              onSaved={(value) => {
                if (sourceRevision) facility.setRegistration(value, sourceRevision);

                onChanged();
              }}
            />
          )}
          <details>
            <summary className="cursor-pointer py-2">Source files</summary>
            {facility.value.facility?.sources.map((source) => (
              <p
                key={source.name}
                className="break-all text-[12px] text-white/60"
              >{`${source.name}: ${source.hash}`}</p>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
