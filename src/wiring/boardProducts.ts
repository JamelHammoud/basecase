import type { BoardProduct } from './boardTypes';
import { BOARD_POWER_PRODUCTS } from './boardPowerProducts';

const JST_SOURCE = 'https://www.jst.com/wp-content/uploads/2025/06/eEH.pdf';
const ROBOTIS_SOURCE = 'https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/';

export const BOARD_PRODUCTS: readonly BoardProduct[] = [
  {
    id: 'jst-b3b-eh-a',
    catalogId: 'jst-b3b-eh-a',
    modelOffset: [2.5, 1.4, 0.3],
    maker: 'JST',
    mpn: 'B3B-EH-A',
    source: JST_SOURCE,
    sourceLocator: 'Pages 2 and 4. Top-entry 3-circuit header and circuit 1 in the mounting-surface view.',
    footprint: 'JST_B3B_EH_A_TypeA',
    courtyard: { min: [-3, -2.1], max: [8, 2.7] },
    heightMm: 8.1,
    belowMm: 3.2,
    access: { min: [-3, -2.1], max: [8, 2.7], heightMm: 18.1 },
    boardThicknessMm: [0.8, 1.6],
    pads: [
      { number: '1', position: [0, 0], diameterMm: 1.7, drillMm: 0.95, function: 'ground' },
      { number: '2', position: [2.5, 0], diameterMm: 1.7, drillMm: 0.95, function: 'positive' },
      { number: '3', position: [5, 0], diameterMm: 1.7, drillMm: 0.95, function: 'data' },
    ],
    mates: [
      {
        componentId: 'dynamixel-xl330-m288',
        variant: null,
        port: 'bus-in',
        source: ROBOTIS_SOURCE,
        housing: 'EHR-03',
        pins: { '1': '1', '2': '2', '3': '3' },
      },
      {
        componentId: 'dynamixel-xl330-m288',
        variant: null,
        port: 'bus-out',
        source: ROBOTIS_SOURCE,
        housing: 'EHR-03',
        pins: { '1': '1', '2': '2', '3': '3' },
      },
    ],
  },
  ...BOARD_POWER_PRODUCTS,
];

export const boardProduct = (id: string) => BOARD_PRODUCTS.find((product) => product.id === id);
