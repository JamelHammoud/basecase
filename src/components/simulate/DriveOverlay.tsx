import React from 'react';
import { Button, Kbd } from '../../design-system';
import type { Simulation } from '../../sim/useSimulation';
import { useDriveKeys } from '../../workspace/useDriveKeys';

const Banner: React.FC<{ children: React.ReactNode; tone?: 'danger' }> = ({ children, tone }) => (
  <div
    role="status"
    data-testid="drive-banner"
    className={`glass rounded-[10px] px-3 h-[32px] flex items-center gap-2 text-[13px] font-medium ${
      tone === 'danger' ? 'text-red-400' : 'text-white/90'
    }`}
  >
    {children}
  </div>
);

export const DriveOverlay: React.FC<{ sim: Simulation }> = ({ sim }) => {
  const { drive, stats } = sim;
  const { away } = useDriveKeys(drive);

  if (!drive.active) return null;

  const speed = stats?.robots[0]?.speed;

  return (
    <div className="absolute inset-x-0 top-3 z-20 flex flex-col items-center gap-2 pointer-events-none">
      {drive.fell && <Banner tone="danger">Fell. Press R.</Banner>}
      {away && <Banner>Click the canvas to drive</Banner>}
      <div className="flex items-center gap-2">
        {speed !== undefined && drive.cls !== 'arm' && (
          <Banner>
            <span data-testid="drive-speed" className="tabular">
              {speed.toFixed(1)} m/s
            </span>
          </Banner>
        )}
        <div className="glass rounded-lg pointer-events-auto">
          <Button variant="secondary" size="sm" icon={<Kbd>Esc</Kbd>} onClick={drive.stop}>
            Stop Driving
          </Button>
        </div>
      </div>
    </div>
  );
};
