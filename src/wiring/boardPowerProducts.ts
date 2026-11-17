import type { BoardProduct } from './boardTypes';

const drawing = 'https://www.pololu.com/file/0J1732/d36v50fx-step-down-voltage-regulator-dimensions.pdf';
const labels = ['VOUT', 'GND', 'GND', 'VIN', 'VRP', 'EN'];
const names = ['VOUT', 'GND1', 'GND2', 'VIN', 'VRP', 'CONTROL'];

export const BOARD_POWER_PRODUCTS: BoardProduct[] = ['5', '6', '12'].map((volts, index) => {
  const componentId = `pololu-d36v50f${volts}`;
  const source = `https://www.pololu.com/product/${[4091, 4092, 4095][index]}`;
  const pads = labels.flatMap((label, column) =>
    [0, 1].map((row) => {
      const number = `${names[column]}_${row + 1}`;
      const unused = ['VRP', 'EN'].includes(label)
        ? `${label}: leave the reverse-protection output and control pins unconnected.`
        : undefined;

      return {
        number,
        position: [-6.35 + column * 2.54, 11.43 - row * 2.54] as [number, number],
        diameterMm: 1.8,
        drillMm: 1.02,
        function: label === 'GND' ? ('ground' as const) : ('positive' as const),
        ...(unused ? { unused } : {}),
      };
    }),
  );

  return {
    id: componentId,
    componentId,
    maker: 'Pololu',
    mpn: `D36V50F${volts}`,
    source: drawing,
    sourceLocator: `${drawing}, top view. ${source}, Connections and labeled photograph 0J10742. Pad suffix 1 is the edge row and 2 the inner row. CONTROL_1 is EN, CONTROL_2 is PG. GND1 and GND2 identify the two ground columns. Included headers, 3 A per pin. Header dimensions https://a.pololu-files.com/picture/0J4234.1200.jpg and https://www.pololu.com/product/965: 2.5 mm collar, 6 mm posts and 3 mm tails. Place the collar between the carrier and module, short tails into the carrier, then solder both boards.`,
    footprint: `Pololu_D36V50F${volts}`,
    courtyard: { min: [-13.2, -13.2], max: [13.2, 13.2] },
    heightMm: 10.2,
    belowMm: 3,
    access: { min: [-13.2, -13.2], max: [13.2, 13.2], heightMm: 15.2 },
    boardThicknessMm: [0.8, 1.6],
    maximumA: 6,
    modelHeightMm: 5.4374,
    modelTurnDeg: 180,
    mounting: [
      [-10.5, 10.5],
      [10.5, 10.5],
      [10.5, -10.5],
    ].map((position, i) => ({
      id: `m${i + 1}`,
      position: position as [number, number],
      diameterMm: 2.18,
      keepoutMm: 1.5,
    })),
    pads,
    mates: ['power-in', 'power-out'].map((port) => ({
      componentId,
      variant: null,
      port,
      source,
      housing: `D36V50F${volts} supplied straight headers`,
      pins: Object.fromEntries(
        pads
          .filter((pad) => !pad.unused)
          .filter((pad) => (port === 'power-in' ? !pad.number.startsWith('VOUT') : !pad.number.startsWith('VIN')))
          .map((pad) => [pad.number, pad.number.split('_')[0].replace(/\d$/, '')]),
      ),
    })),
  };
});
