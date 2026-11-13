import { fixtureRobots } from '../src/sim/fixtures/robots';
import { DEFAULT_PROJECT } from '../src/types/robotics';

export const standIn = (id: string, x: number) => ({
  id,
  name: `Generic servo ${id}`,
  kind: 'servo',
  category: 'actuators',
  role: 'solid',
  position: [x, 20, 0],
  rotation: [0, 0, 0],
  dimensions: { width: 40, height: 40, depth: 20 },
  color: '#888888',
  note: '',
  visible: true,
  locked: false,
});

export const servo = {
  ...standIn('servo', 0),
  name: 'Feetech STS3215',
  kind: 'component',
  componentId: 'feetech-sts3215',
  componentVariant: 'c001',
};

export const armWithEstimates = () => {
  const arm = fixtureRobots().find((r) => r.id === 'arm-3dof')!;
  const servo = { ...standIn('mg996r', 0), name: 'MG996R', kind: 'component', componentId: 'towerpro-mg996r' };
  const joints = arm.joints.map((j) => {
    if (j.id === 'arm0') return { ...j, effortNm: undefined };

    return j.id === 'arm1' ? { ...j, actuators: ['mg996r'] } : j;
  });

  return { name: 'arm', parts: [...arm.parts, servo], project: { ...DEFAULT_PROJECT, joints } };
};
