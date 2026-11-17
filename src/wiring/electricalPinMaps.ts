import type { ElectricalPartMap, ElectricalPin, ElectricalPortMap } from './electricalTypes';
import { compareElectricalIds } from './electricalSource';

const FEETECH_SOURCE = 'https://www.feetechrc.com/Data/feetechrc/upload/file/20260622/6391772523943436695270694.pdf';
const WAVESHARE_SOURCE = 'https://files.waveshare.com/wiki/Bus_Servo_Adapter_A/Bus_Servo_Adapter_A.pdf';
const ROBOTIS_ROOT = 'https://emanual.robotis.com/docs/en/';

function busPins(ground: string, data: string): ElectricalPin[] {
  const pins: ElectricalPin[] = [
    { number: ground, name: 'GND', function: 'ground', direction: 'passive' },
    { number: '2', name: 'VDD', function: 'positive', direction: 'passive' },
    { number: data, name: 'DATA', function: 'data', direction: 'bidirectional' },
  ];

  return pins.sort((a, b) => compareElectricalIds(a.number, b.number));
}

function servoPorts(source: string, sourceLocator: string): ElectricalPortMap[] {
  return ['bus-in', 'bus-out'].map((port) => ({
    port,
    connector: '5264-3',
    source,
    sourceLocator,
    pins: busPins('1', '3'),
  }));
}

const feetech: ElectricalPartMap = {
  componentId: 'feetech-sts3215',
  variant: 'c001',
  ports: servoPorts(FEETECH_SOURCE, '6-7 Connector and Cable, pin definition. C001 only.'),
  common: ['ground', 'positive', 'data'],
};

const waveshare: ElectricalPartMap = {
  componentId: 'waveshare-bus-servo-adapter-a',
  common: ['ground', 'positive'],
  unresolved: ['Specify the adapter’s USB or UART host connection.'],
  ports: [
    {
      port: 'bus-out',
      connector: '5264-3',
      source: WAVESHARE_SOURCE,
      sourceLocator: 'H3 and H5. 1 DATA, 2 DC_IN0, 3 GND. Maximum marked 6 A.',
      maximumA: 6,
      pins: busPins('3', '1'),
    },
    {
      port: 'power-in',
      connector: 'dc-barrel',
      source: WAVESHARE_SOURCE,
      sourceLocator: 'DC1 DC005. 1 DC_IN0, 2 and 3 GND.',
      pins: [
        { number: '1', name: 'DC_IN0', function: 'positive', direction: 'passive' },
        { number: '2', name: 'GND', function: 'ground', direction: 'passive' },
        { number: '3', name: 'GND_SWITCH', function: 'ground', direction: 'passive' },
      ],
    },
  ],
};

function robotis(componentId: string, page: string, adapter = false): ElectricalPartMap {
  const source = `${ROBOTIS_ROOT}${page}/`;
  const ports = servoPorts(source, 'Connector Information, TTL pinout. 1 GND, 2 VDD, 3 DATA.');

  return {
    componentId,
    common: adapter ? [] : ['ground', 'positive', 'data'],
    ...(adapter ? { unresolved: ['Specify the adapter’s USB host connection and host power.'] } : {}),
    ports: (adapter ? ports.filter((port) => port.port === 'bus-out') : ports).map((port) => ({
      ...port,
      connector: 'jst-eh-3',
    })),
  };
}

function regulator(componentId: string, product: string): ElectricalPartMap {
  const source = `https://www.pololu.com/product/${product}`;
  const pin = (number: string, ground = false): ElectricalPin => ({
    number,
    name: number,
    function: ground ? 'ground' : 'positive',
    direction: 'passive',
  });

  return {
    componentId,
    common: ['ground'],
    ports: [
      {
        port: 'power-in',
        connector: 'wire',
        source,
        sourceLocator: 'Using the D36V50Fx, labeled VIN and GND pads. Module internals omitted.',
        pins: [pin('VIN'), pin('GND', true)],
      },
      {
        port: 'power-out',
        connector: 'wire',
        source,
        sourceLocator: 'Using the D36V50Fx, labeled VOUT and GND pads. EN, PG and VRP are outside this interface.',
        pins: [pin('VOUT'), pin('GND', true)],
      },
    ],
  };
}

export const ELECTRICAL_PIN_MAPS: ElectricalPartMap[] = [
  feetech,
  waveshare,
  robotis('dynamixel-xl330-m288', 'dxl/x/xl330-m288'),
  robotis('robotis-u2d2', 'parts/interface/u2d2', true),
  regulator('pololu-d36v50f5', '4091'),
  regulator('pololu-d36v50f6', '4092'),
  regulator('pololu-d36v50f12', '4095'),
  {
    componentId: 'ovonic-3s-2200-50c',
    common: [],
    ports: [
      {
        port: 'power-out',
        connector: 'xt60',
        source: 'https://us.ovonicshop.com/products/ovonic-50c-2200mah-3s1p-11-1v-xt60-2pcs-lipo-battery',
        sourceLocator:
          'Main XT60 discharge plug. Terminal identifiers follow the molded + and - polarity marks, not a viewing orientation. Balance connector omitted.',
        pins: [
          { number: '+', name: '+', function: 'positive', direction: 'passive' },
          { number: '-', name: '-', function: 'ground', direction: 'passive' },
        ],
      },
    ],
  },
];
