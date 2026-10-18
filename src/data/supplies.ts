import type { PrintMaterial } from '../types/robotics';

export type SupplyGroup = 'Power' | 'Wiring' | 'Electronics' | 'Filament' | 'Tools';

export interface SupplyInfo {
  id: string;
  name: string;
  group: SupplyGroup;
  spec: string;
  search: string;
  weightG?: number;
  typicalPack?: string;
  battery?: { nominalV: number; fullV: number; capacityAh: number; cRating: number };
}

const amazon = (q: string) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;

export const SUPPLIES: SupplyInfo[] = [
  {
    id: 'lipo-2s-2200',
    name: '2S LiPo 2200 mAh',
    group: 'Power',
    spec: '7.4 V nominal (8.4 V full), 2200 mAh, 25C+, XT60, about 105 × 34 × 18 mm',
    search: amazon('2S 7.4V 2200mAh LiPo battery XT60'),
    weightG: 120,
    battery: { nominalV: 7.4, fullV: 8.4, capacityAh: 2.2, cRating: 25 },
  },
  {
    id: 'lipo-3s-2200',
    name: '3S LiPo 2200 mAh',
    group: 'Power',
    spec: '11.1 V nominal (12.6 V full), 2200 mAh, 25C+, XT60, about 105 × 34 × 25 mm',
    search: amazon('3S 11.1V 2200mAh LiPo battery XT60'),
    weightG: 172,
    battery: { nominalV: 11.1, fullV: 12.6, capacityAh: 2.2, cRating: 25 },
  },
  {
    id: 'liion-2s-18650-pack',
    name: '2S 18650 Holder',
    group: 'Power',
    spec: '2-cell 18650 holder in series with leads (cells sold separately)',
    search: amazon('2S 18650 battery holder series with wires'),
    weightG: 20,
  },
  {
    id: 'lipo-balance-charger',
    name: 'LiPo Balance Charger',
    group: 'Power',
    spec: '2S–4S balance charger, XT60 output, USB-C or AC input',
    search: amazon('LiPo balance charger 2S 3S 4S XT60 USB-C'),
  },
  {
    id: 'lipo-safe-bag',
    name: 'LiPo Safe Bag',
    group: 'Power',
    spec: 'Fire-resistant charging bag, fits a 2200 mAh pack',
    search: amazon('LiPo safe bag fireproof battery charging'),
  },
  {
    id: 'buck-5v-5a',
    name: '5 V 5 A Buck Converter',
    group: 'Power',
    spec: '6–24 V in, 5.1 V 5 A out (Raspberry Pi 5 needs 5 A for full USB power), USB-C or screw terminals',
    search: amazon('5V 5A buck converter USB-C Raspberry Pi 5 step down 12V'),
    weightG: 25,
  },
  {
    id: 'xt60-pigtail',
    name: 'XT60 Pigtail Pair',
    group: 'Power',
    spec: 'Male and female XT60 with 14 AWG silicone leads',
    search: amazon('XT60 male female pigtail 14AWG silicone'),
    typicalPack: '5 pairs',
  },
  {
    id: 'rocker-switch-20a',
    name: 'Power Switch',
    group: 'Power',
    spec: 'Panel-mount rocker or toggle, 12 V DC rated 20 A or more',
    search: amazon('12V 20A rocker switch panel mount DC'),
    typicalPack: '5 pieces',
  },
  {
    id: 'blade-fuse-holder',
    name: 'Inline Fuse Holder',
    group: 'Power',
    spec: 'Inline ATC/ATO blade fuse holder, 14–16 AWG, with 10 A fuses',
    search: amazon('inline blade fuse holder 14 AWG ATC with 10A fuses'),
  },
  {
    id: 'lipo-voltage-alarm',
    name: 'LiPo Voltage Alarm',
    group: 'Power',
    spec: '1S–8S cell checker with low-voltage buzzer, plugs into the balance lead',
    search: amazon('LiPo voltage checker low voltage alarm buzzer 1-8S'),
    weightG: 9,
  },

  {
    id: 'wire-18awg-silicone',
    name: '18 AWG Silicone Wire',
    group: 'Wiring',
    spec: 'Red and black stranded silicone wire, 18 AWG',
    search: amazon('18 AWG silicone wire red black'),
    typicalPack: '2 × 5 m',
  },
  {
    id: 'wire-22awg-silicone',
    name: '22 AWG Silicone Wire',
    group: 'Wiring',
    spec: 'Assorted colors, stranded silicone wire, 22 AWG',
    search: amazon('22 AWG silicone wire kit 6 colors'),
  },
  {
    id: 'servo-cable-5264-3pin',
    name: 'Bus Servo Cable',
    group: 'Wiring',
    spec: '3-pin 5264 (Molex 2.5 mm) daisy-chain cable for Feetech STS / SCS servos',
    search: amazon('Feetech servo cable 3 pin 5264 extension'),
    typicalPack: '10 pieces',
  },
  {
    id: 'stemma-qt-cable',
    name: 'STEMMA QT / Qwiic Cable',
    group: 'Wiring',
    spec: '4-pin JST SH 1.0 mm, female–female, 100–200 mm',
    search: amazon('STEMMA QT Qwiic JST SH 4 pin cable 200mm'),
    typicalPack: '5 pieces',
  },
  {
    id: 'pi5-camera-cable-200',
    name: 'Pi 5 Camera Cable',
    group: 'Wiring',
    spec: '22-pin to 15-pin FPC, 200 mm (Raspberry Pi 5 to a Camera Module)',
    search: amazon('Raspberry Pi 5 camera cable 22 pin to 15 pin 200mm'),
  },
  {
    id: 'spiral-wrap',
    name: 'Spiral Cable Wrap',
    group: 'Wiring',
    spec: '6–8 mm spiral wrap for cables crossing joints',
    search: amazon('spiral cable wrap 6mm'),
  },
  {
    id: 'zip-ties-small',
    name: 'Small Zip Ties',
    group: 'Wiring',
    spec: '100 mm × 2.5 mm nylon cable ties',
    search: amazon('small zip ties 4 inch 100mm black'),
  },
  {
    id: 'heat-shrink-kit',
    name: 'Heat Shrink Tubing',
    group: 'Wiring',
    spec: '2:1 polyolefin assortment',
    search: amazon('heat shrink tubing assortment kit 2:1'),
  },

  {
    id: 'microsd-64gb',
    name: 'microSD Card 64 GB',
    group: 'Electronics',
    spec: 'A2 / U3 microSDXC, 64 GB',
    search: amazon('microSD 64GB A2 U3'),
  },
  {
    id: 'round-lcd-128',
    name: '1.28" Round LCD',
    group: 'Electronics',
    spec: 'Waveshare 1.28inch LCD Module: GC9A01, 240 × 240 IPS, Ø32.4 mm active area, module 40.4 × 37.5 mm, SPI',
    search: amazon('Waveshare 1.28 inch round LCD module GC9A01'),
  },
  {
    id: 'pi5-active-cooler',
    name: 'Pi 5 Active Cooler',
    group: 'Electronics',
    spec: 'Raspberry Pi Active Cooler (official)',
    search: amazon('Raspberry Pi 5 Active Cooler official'),
    weightG: 22,
  },

  {
    id: 'filament-pla',
    name: 'PLA Filament 1 kg',
    group: 'Filament',
    spec: '1.75 mm PLA, 1 kg spool (Bambu PLA Basic or any brand)',
    search: amazon('PLA filament 1.75mm 1kg'),
    typicalPack: '1000 g',
  },
  {
    id: 'filament-petg',
    name: 'PETG Filament 1 kg',
    group: 'Filament',
    spec: '1.75 mm PETG, 1 kg spool',
    search: amazon('PETG filament 1.75mm 1kg'),
    typicalPack: '1000 g',
  },
  {
    id: 'filament-abs',
    name: 'ABS Filament 1 kg',
    group: 'Filament',
    spec: '1.75 mm ABS, 1 kg spool (print in the enclosed P1S)',
    search: amazon('ABS filament 1.75mm 1kg'),
    typicalPack: '1000 g',
  },
  {
    id: 'filament-asa',
    name: 'ASA Filament 1 kg',
    group: 'Filament',
    spec: '1.75 mm ASA, 1 kg spool (print in the enclosed P1S)',
    search: amazon('ASA filament 1.75mm 1kg'),
    typicalPack: '1000 g',
  },
  {
    id: 'filament-tpu',
    name: 'TPU Filament 1 kg',
    group: 'Filament',
    spec: '1.75 mm TPU 95A, 1 kg spool (soles, bumpers, grip pads)',
    search: amazon('TPU 95A filament 1.75mm 1kg'),
    typicalPack: '1000 g',
  },

  {
    id: 'heat-insert-tips',
    name: 'Heat-Set Insert Tips',
    group: 'Tools',
    spec: 'Soldering-iron tips for M2–M5 heat-set inserts',
    search: amazon('heat set insert tip kit M2 M3 M4 M5 soldering iron'),
  },
  {
    id: 'hex-key-set',
    name: 'Hex Key Set',
    group: 'Tools',
    spec: '1.5–5 mm metric hex drivers (M2–M5 socket heads)',
    search: amazon('metric hex screwdriver set 1.5 2 2.5 3 4 mm'),
  },
];

export const SUPPLY_BY_ID: Record<string, SupplyInfo> = Object.fromEntries(SUPPLIES.map((s) => [s.id, s]));

export const FILAMENT_SUPPLY: Record<PrintMaterial, string> = {
  PLA: 'filament-pla',
  PETG: 'filament-petg',
  ABS: 'filament-abs',
  ASA: 'filament-asa',
  TPU: 'filament-tpu',
};

export const MATERIAL_DENSITY: Record<PrintMaterial, number> = {
  PLA: 1.26,
  PETG: 1.28,
  ABS: 1.04,
  ASA: 1.07,
  TPU: 1.22,
};

export const MATERIAL_SOFTENS_C: Record<PrintMaterial, number> = { PLA: 54, PETG: 69, ABS: 87, ASA: 95, TPU: 60 };
