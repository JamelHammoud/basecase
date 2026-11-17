import type { WiringFixture } from '../../src/wiring/fixtures';

const id = (part: string, port: string, pin: string) => JSON.stringify([part, port, pin]);
const pin = (part: string, port: string, number: string) => id(part, port, number);
const virtual = (name: string, number: string) => id('', name, number);
const sourceName = 'DC Power Supply';
const fuseName = 'Inline Fuse Holder';
const switchName = 'Power Switch';
const sequence = (prefix: string, count: number, start = 1) =>
  Array.from({ length: count }, (_, index) => `${prefix}${start + index}`);
const busDeclarations: Record<string, Array<{ adapter: string; servos: string[]; robotis?: boolean }>> = {
  'tethered-so101': [{ adapter: 'adapter', servos: sequence('servo', 6) }],
  'battery-rover': [{ adapter: 'adapter', servos: sequence('wheel', 2) }],
  quadruped: [{ adapter: 'adapter', servos: sequence('servo', 12) }],
  hexapod: [
    { adapter: 'front', servos: sequence('leg', 9) },
    { adapter: 'back', servos: sequence('leg', 9, 10) },
  ],
  'pan-tilt-camera': [{ adapter: 'adapter', servos: sequence('servo', 2) }],
  gripper: [{ adapter: 'adapter', servos: ['servo1'] }],
  'mixed-voltage': [{ adapter: 'adapter', servos: sequence('sts', 3) }],
  'dual-bus-arm': [
    { adapter: 'adapter', servos: sequence('servo', 3) },
    { adapter: 'second', servos: sequence('xl', 2), robotis: true },
  ],
  'sensor-rich-inspection': [{ adapter: 'adapter', servos: sequence('servo', 4) }],
  'fixed-appliance': [{ adapter: 'adapter', servos: ['servo1'] }],
};

function mergeGroups(groups: string[][]) {
  const result: Set<string>[] = [];

  for (const group of groups.filter((item) => item.length)) {
    const members = new Set(group);
    const touching = result.filter((existing) => group.some((node) => existing.has(node)));

    touching.forEach((existing) => existing.forEach((node) => members.add(node)));
    result.splice(0, result.length, ...result.filter((existing) => !touching.includes(existing)), members);
  }

  return result.map((group) => [...group].sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function expectedVoltage(name: string, scene: WiringFixture) {
  if (name === 'battery-rover') return 6;

  return scene.project.tether?.volts ?? (name === 'dual-bus-arm' ? 6 : 7.4);
}

function moduleTerminals(name: string) {
  if (name === 'gripper')
    return { positive: 'CENTER', ground: 'SLEEVE', fuseIn: 'A', fuseOut: 'B', switchIn: '2', switchOut: '3' };

  return { positive: '+', ground: '-', fuseIn: 'IN', fuseOut: 'OUT', switchIn: 'IN', switchOut: 'OUT' };
}

export function expectedConnections(name: string, scene: WiringFixture) {
  const battery = name === 'battery-rover';
  const groups: string[][] = [];
  const terminals = moduleTerminals(name);
  const sourcePositive = battery ? pin('pack', 'power-out', '+') : virtual(sourceName, terminals.positive);
  const sourceGround = battery ? pin('pack', 'power-out', '-') : virtual(sourceName, terminals.ground);
  const downstream = battery ? pin('buck', 'power-out', 'VOUT') : virtual(switchName, terminals.switchOut);

  groups.push(
    [sourcePositive, virtual(fuseName, terminals.fuseIn)],
    [virtual(fuseName, terminals.fuseOut), virtual(switchName, terminals.switchIn)],
  );

  if (name === 'gripper') groups.push([virtual(switchName, '1')]);

  if (battery)
    groups.push(
      [virtual(switchName, 'OUT'), pin('buck', 'power-in', 'VIN')],
      [sourceGround, pin('buck', 'power-in', 'GND'), pin('buck', 'power-out', 'GND')],
    );

  for (const bus of busDeclarations[name]) {
    const ground = bus.robotis ? '1' : '3';
    const data = bus.robotis ? '3' : '1';
    const servoGround = '1';
    const servoData = '3';
    const servoPins = (number: string) =>
      bus.servos.flatMap((servo) => ['bus-in', 'bus-out'].map((port) => pin(servo, port, number)));

    groups.push([pin(bus.adapter, 'bus-out', data), ...servoPins(servoData)]);
    groups.push([
      pin(bus.adapter, 'bus-out', '2'),
      ...servoPins('2'),
      ...(bus.robotis ? [] : [downstream, pin(bus.adapter, 'power-in', '1')]),
    ]);
    groups.push([
      pin(bus.adapter, 'bus-out', ground),
      ...servoPins(servoGround),
      ...(bus.robotis ? [] : [sourceGround, pin(bus.adapter, 'power-in', '2'), pin(bus.adapter, 'power-in', '3')]),
    ]);
  }

  return {
    groups: mergeGroups(groups),
    expectedServoVolts: expectedVoltage(name, scene),
    sourcePositive,
  };
}
