import React from 'react';
import { Button, CameraIcon, HandIcon, RunIcon, Section, Select, StopIcon, TrainIcon } from '../../design-system';
import { withVelocity } from '../../sim/driveAccess';
import type { PolicyRecord, RobotAnimation } from '../../types/robotics';
import type { Simulation } from '../../sim/useSimulation';
import type { Training } from '../../sim/useTraining';
import { DriveKeys } from './CaseSections';
import { DRIVE_WITH_CAMERA, driveWithCamera } from './driveWithCamera';
import { controllerValue } from './format';

interface ControlProps {
  sim: Simulation;
  training: Training;
  animations: RobotAnimation[];
  policies: PolicyRecord[];
  policyKey: string | null;
  setPolicyKey: (key: string | null) => void;
}

export function useChooseController({ sim, training, animations, policies, setPolicyKey }: ControlProps) {
  const chooseLocal = (value: string) => {
    setPolicyKey(null);

    if (value === 'hold' || value === 'limp') {
      sim.setController({ kind: value });

      return;
    }

    const a = animations.find((x) => `anim:${x.id}` === value);

    if (a) sim.setController({ kind: 'animation', animation: a });
  };
  const choosePolicy = async (id: string) => {
    const rec = policies.find((p) => p.id === id);
    const spec = rec ? await training.loadPolicy(id) : null;

    if (!rec || !spec) return;

    setPolicyKey(id);
    sim.setController({ kind: 'policy', policy: spec, robot: rec.robot });
  };

  return async (value: string) => {
    if (sim.drive.active) sim.drive.stop();

    if (value.startsWith('policy:')) await choosePolicy(value.slice(7));
    else chooseLocal(value);

    if (sim.status !== 'off') sim.reset();
  };
}

export interface WalkTeaching {
  velocityReady: boolean;
  teachWalk: (() => void) | null;
  walkTraining: boolean;
}

const DriveButton: React.FC<{ sim: Simulation }> = ({ sim }) => {
  const { drive } = sim;

  return (
    <Button
      variant="secondary"
      size="md"
      fullWidth
      icon={drive.active ? <StopIcon className="w-4 h-4" /> : <RunIcon className="w-4 h-4" />}
      disabled={drive.status === 'checking'}
      title={drive.active ? undefined : 'Drive with the keyboard or a gamepad'}
      onClick={() => (drive.active ? drive.stop() : void drive.start())}
    >
      {drive.active ? 'Stop Driving' : 'Drive'}
    </Button>
  );
};

const CameraButton: React.FC<{ sim: Simulation; onToast: (message: string) => void }> = ({ sim, onToast }) => (
  <Button
    variant="secondary"
    size="md"
    fullWidth
    icon={<CameraIcon className="w-4 h-4" />}
    disabled={sim.drive.status === 'checking'}
    onClick={() => void driveWithCamera(sim.drive, onToast)}
  >
    {DRIVE_WITH_CAMERA}
  </Button>
);

const TeachButton: React.FC<{ walk: WalkTeaching }> = ({ walk }) =>
  walk.teachWalk && (
    <Button
      variant="secondary"
      size="md"
      fullWidth
      icon={<TrainIcon className="w-4 h-4" />}
      disabled={walk.walkTraining}
      onClick={walk.teachWalk}
    >
      Teach It to Move
    </Button>
  );

const DriveControl: React.FC<{ sim: Simulation; walk: WalkTeaching; onToast: (message: string) => void }> = ({
  sim,
  walk,
  onToast,
}) => {
  const offer = withVelocity(sim.drive.offer, walk.velocityReady);

  return (
    <>
      {(offer === 'drive' || sim.drive.active) && <DriveButton sim={sim} />}
      {offer === 'teach' && !sim.drive.active && <TeachButton walk={walk} />}
      {sim.drive.offersPose && !sim.drive.active && <CameraButton sim={sim} onToast={onToast} />}
    </>
  );
};

export const ControlSection: React.FC<
  ControlProps & {
    choose: (value: string) => Promise<void>;
    showDrive: boolean;
    walk: WalkTeaching;
    onToast: (message: string) => void;
  }
> = ({ sim, animations, policies, policyKey, showDrive, choose, walk, onToast }) => {
  const { drive } = sim;
  const options = [
    { value: 'hold', label: 'Hold pose' },
    ...animations.map((a) => ({ value: `anim:${a.id}`, label: a.name })),
    ...policies.map((p) => ({ value: `policy:${p.id}`, label: p.name })),
    { value: 'limp', label: 'Limp' },
  ];

  return (
    <Section title="Control">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Select
            aria-label="Controller"
            value={controllerValue(sim.controller, policyKey)}
            options={options}
            disabled={drive.active}
            onChange={(e) => void choose(e.target.value)}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<HandIcon className="w-4 h-4" />}
            disabled={!sim.playing}
            title="Push the robot sideways"
            onClick={() => sim.push()}
          >
            Push
          </Button>
        </div>
        {showDrive && <DriveControl sim={sim} walk={walk} onToast={onToast} />}
        {drive.status === 'checking' && <p className="text-[12.5px] text-white/50">Checking it stays up…</p>}
        {showDrive && drive.active && drive.cls && <DriveKeys cls={drive.cls} />}
      </div>
    </Section>
  );
};
