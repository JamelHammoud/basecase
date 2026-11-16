import { useState } from 'react';
import { Button, TextInput } from '../design-system';
import { fleetAddress, openFleet, savedFleetAddress } from './openFleet';

export function FleetLauncher() {
  const [address, setAddress] = useState(savedFleetAddress);

  return (
    <div className="space-y-2 p-3">
      <TextInput
        aria-label="Fleet address"
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);

          const checked = fleetAddress(event.target.value);

          if (checked) localStorage.setItem('fleet-address', checked);
        }}
      />
      <Button fullWidth disabled={!fleetAddress(address)} title="Open Fleet" onClick={openFleet}>
        Open Fleet
      </Button>
    </div>
  );
}
