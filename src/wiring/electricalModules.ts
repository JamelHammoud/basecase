import type { ProjectSettings } from '../types/robotics';
import type { ElectricalPin, ElectricalPortMap } from './electricalTypes';

const pin = (number: string, ground = false): ElectricalPin => ({
  number,
  name: number,
  function: ground ? 'ground' : 'positive',
  direction: 'passive',
});

export const POWER_MODULES = [
  {
    id: 'meanwell-gst60a05-p1j',
    role: 'DC Power Supply',
    mpn: 'GST60A05-P1J',
    maker: 'MEAN WELL',
    map: {
      port: 'DC Power Supply',
      connector: 'dc-barrel',
      source: 'https://www.meanwell.com/Upload/PDF/GST60A/GST60A-SPEC.PDF',
      sourceLocator:
        'GST60A05-P1J: 5 V, 6 A, ±5% voltage tolerance. P1J plug: center positive, 2.1 mm inner and 5.5 mm outer diameter. The DC return is isolated from AC frame ground. DC output only.',
      outputV: 5,
      outputMaximumV: 5.25,
      maximumA: 6,
      pins: [pin('CENTER'), pin('SLEEVE', true)],
    } satisfies ElectricalPortMap,
  },
  {
    id: 'littelfuse-0fha0001zxj',
    role: 'Inline Fuse Holder',
    mpn: '0FHA0001ZXJ',
    maker: 'Littelfuse',
    map: {
      port: 'Inline Fuse Holder',
      connector: 'wire',
      source:
        'https://www.littelfuse.com/~/media/commercial-vehicle/datasheets/automotive-fuse-holders/ato/littelfuse-fuse-holders-ato-fha-datasheet.pdf',
      sourceLocator:
        'Ordering information: 0FHA0001ZXJ standard-duty bulk holder, 20 A maximum, with two unpolarized 4-inch GXL wire leads. Fuse selection is separate. A/B identify interchangeable leads in this schematic, not molded terminal numbers.',
      maximumA: 20,
      maximumV: 32,
      terminals: { input: 'A', output: 'B' },
      pins: [pin('A'), pin('B')],
    } satisfies ElectricalPortMap,
  },
  {
    id: 'ck-7103syzqe',
    role: 'Power Switch',
    mpn: '7103SYZQE',
    maker: 'C&K',
    map: {
      port: 'Power Switch',
      connector: 'wire',
      source: 'https://www.ckswitches.com/media/1394/7000toggle.pdf',
      sourceLocator:
        'Pages 1–3: 7103 On-Off-On, terminal 2 common, position 1 connects 2–3, center open. Q silver contacts: 5 A at 28 V DC. S actuator, Y bushing, Z solder lugs, Q contacts, E seal.',
      maximumA: 5,
      maximumV: 28,
      terminals: { input: '2', output: '3' },
      unused: {
        '1': 'The second throw is unused. Position 1 powers the robot through 2–3, and the center position disconnects it.',
      },
      pins: [pin('1'), pin('2'), pin('3')],
    } satisfies ElectricalPortMap,
  },
];

export function selectedPowerModule(project: ProjectSettings, role: string) {
  const selectedIds = new Set((project.extras ?? []).filter((extra) => extra.qty > 0).map((extra) => extra.key));
  const candidates = (project.sourced ?? []).flatMap((item) => {
    const module = POWER_MODULES.find(
      (candidate) => candidate.role === role && candidate.mpn === item.mpn && candidate.maker === item.maker,
    );

    if (
      !module ||
      item.link.status !== 'confirmed' ||
      !selectedIds.has(`supply:${item.id}`) ||
      !item.sources.some((claim) => claim.url === module.map.source)
    )
      return [];

    return [{ module, item }];
  });

  return candidates.length === 1 ? candidates[0] : null;
}
