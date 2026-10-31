import React from 'react';

const ROBOTS = [
  { id: 'unitree-g1', name: 'Unitree G1' },
  { id: 'spot', name: 'Spot' },
  { id: 'open-duck-mini', name: 'Open Duck Mini' },
  { id: 'so101', name: 'SO-101' },
  { id: 'booster-t1', name: 'Booster T1' },
  { id: 'anymal-c', name: 'ANYmal C' },
  { id: 'franka-panda', name: 'Franka Panda' },
  { id: 'apptronik-apollo', name: 'Apptronik Apollo' },
  { id: 'unitree-go2', name: 'Unitree Go2' },
  { id: 'robotis-op3', name: 'ROBOTIS OP3' },
  { id: 'ur5e', name: 'UR5e' },
  { id: 'unitree-h1', name: 'Unitree H1' },
  { id: 'unitree-b2', name: 'Unitree B2' },
  { id: 'berkeley-humanoid', name: 'Berkeley Humanoid' },
  { id: 'unitree-go1', name: 'Unitree Go1' },
  { id: 'unitree-h1-2', name: 'Unitree H1-2' },
];

const COPIES = [0, 1, 2];

const RobotTile: React.FC<{ id: string; name: string; copy: number }> = ({ id, name, copy }) => (
  <li className="shrink-0 pr-[8px]" aria-hidden={copy > 0}>
    <div className="preview w-[152px] h-[114px] sm:w-[200px] sm:h-[150px]">
      <img
        src={`/robots/${id}.webp`}
        alt={copy > 0 ? '' : name}
        className="w-full h-full object-contain"
        draggable={false}
      />
    </div>
  </li>
);

export const RobotStrip: React.FC = () => (
  <div className="landing-strip overflow-hidden">
    <ul className="landing-strip-track flex w-max list-none m-0 p-0">
      {COPIES.map((copy) => ROBOTS.map((robot) => <RobotTile key={`${robot.id}-${copy}`} {...robot} copy={copy} />))}
    </ul>
  </div>
);
