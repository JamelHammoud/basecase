import { COMPONENT_BY_ID } from '../data/components';
import type { ScenePart } from '../types/robotics';

interface SceneFacts {
  battery: boolean;
  tether: boolean;
  servos: boolean;
  sensors: boolean;
  piCamera: boolean;
  pi: boolean;
  pi5: boolean;
  inserts: boolean;
  screws: boolean;
}

interface Need {
  supply: string;
  match: RegExp;
  when: (s: SceneFacts) => boolean;
}

const powered = (s: SceneFacts) => s.battery || s.tether;

const NEEDS: Need[] = [
  { supply: 'dc-bench-supply', match: /power supply|bench supply|psu/i, when: (s) => s.tether },
  { supply: 'rocker-switch-20a', match: /switch/i, when: powered },
  { supply: 'blade-fuse-holder', match: /fuse/i, when: powered },
  { supply: 'xt60-pigtail', match: /xt60|xt30|pigtail/i, when: powered },
  { supply: 'wire-18awg-silicone', match: /\bawg\b|\d+\s*awg/i, when: powered },
  { supply: 'lipo-balance-charger', match: /charger/i, when: (s) => s.battery },
  { supply: 'servo-cable-5264-3pin', match: /servo cable|5264|jst.*servo|dynamixel.*cable/i, when: (s) => s.servos },
  { supply: 'stemma-qt-cable', match: /stemma|qwiic|dupont|jumper/i, when: (s) => s.sensors },
  { supply: 'pi5-camera-cable-200', match: /camera (cable|ribbon)|ffc|fpc/i, when: (s) => s.piCamera },
  { supply: 'microsd-64gb', match: /micro\s?sd/i, when: (s) => s.pi },
  { supply: 'pi5-active-cooler', match: /cooler|heatsink/i, when: (s) => s.pi5 },
  { supply: 'heat-insert-tips', match: /insert tip|heat.*tip/i, when: (s) => s.inserts },
  { supply: 'hex-key-set', match: /hex key|allen|driver set/i, when: (s) => s.screws },
];

const componentOf = (p: ScenePart) => (p.componentId ? COMPONENT_BY_ID[p.componentId] : undefined);

function sceneFacts(parts: ScenePart[], tether: boolean): SceneFacts {
  const comps = parts.map(componentOf).filter((c) => !!c);
  const hardware = parts.flatMap((p) => (p.kind === 'hardware' && p.hardware ? [p.hardware.type] : []));

  return {
    battery: comps.some((c) => !!c.battery),
    tether,
    servos: comps.some((c) => c.group === 'Servos'),
    sensors: comps.some((c) => /sensor|imu|tof/i.test(`${c.group} ${c.name}`)),
    piCamera: comps.some((c) => /raspberry.*camera/i.test(`${c.manufacturer} ${c.name}`)),
    pi: comps.some((c) => /raspberry pi/i.test(c.name) && c.group === 'Computers'),
    pi5: comps.some((c) => c.id === 'raspberry-pi-5'),
    inserts: hardware.includes('heat_insert'),
    screws: hardware.some((t) => t.endsWith('_head')),
  };
}

export function neededSupplyKeys(parts: ScenePart[], listed: string, tether = false): string[] {
  const facts = sceneFacts(parts, tether);

  return NEEDS.filter((n) => n.when(facts) && !n.match.test(listed)).map((n) => `supply:${n.supply}`);
}
