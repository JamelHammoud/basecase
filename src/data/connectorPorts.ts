import type { ConnectorRole, ConnectorType, Port, PortVec } from '../types/ports';

const UP: PortVec = [0, 1, 0];
const PX: PortVec = [1, 0, 0];
const PZ: PortVec = [0, 0, 1];

interface Plug {
  at: PortVec;
  axis: PortVec;
  type: ConnectorType;
  role: ConnectorRole;
}

const plug = ({ at, axis, type, role }: Plug): Port => ({
  name: role,
  position: at,
  axis,
  kind: 'connector',
  connector: type,
  role,
});

function busPair(type: ConnectorType, axis: PortVec, at: [PortVec, PortVec]): Port[] {
  return [plug({ at: at[0], axis, type, role: 'bus-in' }), plug({ at: at[1], axis, type, role: 'bus-out' })];
}

export const STS_BUS = busPair('5264-3', PX, [
  [22.5, -12, -5],
  [22.5, -12, 5],
]);

export const dynamixelBus = (end: number, y: number): Port[] =>
  busPair('jst-eh-3', PZ, [
    [-5, y, end],
    [5, y, end],
  ]);

const battery = (at: PortVec, type: ConnectorType): Port[] => [plug({ at, axis: PX, type, role: 'power-out' })];

const holderPins = (y: number): Port[] => [plug({ at: [0, y, 0], axis: [0, -1, 0], type: 'wire', role: 'power-out' })];

const regulator = (vin: PortVec, vout: PortVec): Port[] => [
  plug({ at: vin, axis: UP, type: 'wire', role: 'power-in' }),
  plug({ at: vout, axis: UP, type: 'wire', role: 'power-out' }),
];

const D36V50 = regulator([-5.08, -1.36, -10.16], [5.08, -1.36, -10.16]);

export const POWER_AND_BUS_PORTS: Record<string, Port[]> = {
  'robotis-u2d2': [plug({ at: [24, 0, -2.8], axis: PX, type: 'jst-eh-3', role: 'bus-out' })],
  'waveshare-bus-servo-adapter-a': [
    plug({ at: [13.5, 5.3, -0.3], axis: UP, type: '5264-3', role: 'bus-out' }),
    plug({ at: [-11.8, 3, 14.8], axis: PZ, type: 'dc-barrel', role: 'power-in' }),
  ],
  'robotis-openrb-150': [
    plug({ at: [-29.3, 4.1, 0], axis: UP, type: 'jst-eh-3', role: 'bus-out' }),
    plug({ at: [29.3, 9.3, 1.6], axis: UP, type: 'wire', role: 'power-in' }),
  ],
  'ovonic-2s-2200-50c': battery([43.5, 0, 0], 'xt60'),
  'ovonic-3s-2200-50c': battery([52.5, 0, 0], 'xt60'),
  'ovonic-4s-2200-35c': battery([38.5, 0, 0], 'xt60'),
  'ovonic-6s-5000-120c': battery([78, 0, 0], 'ec5'),
  'mpd-bh-18650-pc': holderPins(-9.01),
  'mpd-bk-18650-pc4': holderPins(-9.17),
  'pololu-d36v50f5': D36V50,
  'pololu-d36v50f6': D36V50,
  'pololu-d36v50f12': D36V50,
  'pololu-d36v28f5': regulator([8.89, -1.71, -5.08], [8.89, -1.71, 1.27]),
  'pololu-d24v22f5': regulator([-6.35, -1.99, 7.62], [1.27, -1.99, 7.62]),
  'pololu-s13v20f5': regulator([4.76, 0, -2.54], [4.76, 0, 2.54]),
};
