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
];

const RobotTile: React.FC<{ id: string; name: string; hidden?: boolean }> = ({ id, name, hidden }) => (
  <li className="preview w-[152px] h-[114px] shrink-0" aria-hidden={hidden}>
    <img
      src={`/robots/${id}.webp`}
      alt={hidden ? '' : name}
      className="w-full h-full object-contain"
      draggable={false}
    />
  </li>
);

export const RobotStrip: React.FC = () => (
  <div className="landing-strip overflow-hidden">
    <ul className="landing-strip-track flex gap-[8px] w-max list-none m-0 p-0">
      {ROBOTS.map((robot) => (
        <RobotTile key={robot.id} {...robot} />
      ))}
      {ROBOTS.map((robot) => (
        <RobotTile key={`${robot.id}-again`} {...robot} hidden />
      ))}
    </ul>
  </div>
);
