import { describe, expect, it } from 'vitest';
import { servoLayout } from '../robot/sceneRobot';
import { buildBom } from '../utils/bom';
import { engineeringText, runEngineering } from '../utils/engineering';
import { engineeringFindings } from '../readiness/findings';
import {
  component,
  hexapod,
  mixedArm,
  rover,
  sceneOf,
  servoJoints,
  so101,
  xl330Arm,
  type WiringFixture,
} from './fixtures';
import { wiringNetlist } from './netlist';
import { wiringSupplies } from './wiringSupplies';

const supplies = (scene: WiringFixture) => Object.fromEntries(wiringSupplies(wiringNetlist(scene)));

const bomLines = (scene: WiringFixture) =>
  new Map(
    buildBom({ ...scene, purchases: {}, measures: {}, now: new Date('2026-11-13T12:00:00') }).lines.map((l) => [
      l.key,
      l.qty,
    ]),
  );

describe('wiringNetlist', () => {
  it('chains the SO-101 from its adapter through six STS3215s with six 5264 cables', () => {
    const net = wiringNetlist(so101());

    expect(net.buses).toHaveLength(1);
    expect(net.buses[0].adapter).toBe('adapter');
    expect(net.buses[0].nets.map((n) => [n.from.id, n.to.id])).toEqual([
      ['adapter', 'servo1'],
      ['servo1', 'servo2'],
      ['servo2', 'servo3'],
      ['servo3', 'servo4'],
      ['servo4', 'servo5'],
      ['servo5', 'servo6'],
    ]);
    expect(net.buses[0].nets.every((n) => n.from.connector === '5264-3' && n.to.connector === '5264-3')).toBe(true);
    expect(supplies(so101())).toMatchObject({ 'supply:servo-cable-5264-3pin': 6 });
  });

  it('follows servoLayout order, the numbering Operate and joint_map.json use', () => {
    const scene = so101();
    const joints = [...scene.project.joints!].reverse();
    const net = wiringNetlist({ ...scene, project: { ...scene.project, joints } });
    const layout = servoLayout(joints);

    expect(net.buses[0].servos).toEqual(layout.movable.map((j, i) => ({ id: j.actuators![0], busId: layout.ids[i] })));
  });

  it('splits a hexapod across its two adapters, nine servos each', () => {
    const net = wiringNetlist(hexapod());

    expect(net.buses.map((b) => [b.adapter, b.servos.length])).toEqual([
      ['front', 9],
      ['back', 9],
    ]);
    expect(supplies(hexapod())).toMatchObject({ 'supply:servo-cable-5264-3pin': 18 });
  });

  it('spreads four servos over three adapters so each carries a bus', () => {
    const arm = servoJoints({ prefix: 'servo', componentId: 'feetech-sts3215', variant: 'c001', count: 4 });
    const adapters = ['a', 'b', 'c'].map((id) => component(id, 'waveshare-bus-servo-adapter-a'));
    const scene = sceneOf([...adapters, ...arm.parts], arm.joints);
    const net = wiringNetlist(scene);

    expect(net.buses.map((b) => [b.adapter, b.servos.length])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 1],
    ]);
    expect(engineeringText(runEngineering({ ...scene, measures: {}, servoOutputs: {} }), (v) => v)).toContain(
      '; 1 5264 3-pin cable\n',
    );
  });

  it('runs an XL330 arm on a U2D2 with JST EH cables', () => {
    const net = wiringNetlist(xl330Arm());

    expect(net.buses[0]).toMatchObject({ adapter: 'u2d2', connector: 'jst-eh-3' });
    expect(supplies(xl330Arm())).toEqual({ 'supply:robot-cable-x3p': 5 });
    expect(net.unmatched).toEqual([]);
  });

  it('powers a tethered arm through the fuse and switch into the barrel jack, with no battery pigtail', () => {
    const net = wiringNetlist(so101());

    expect(net.power.nets.map((n) => [n.from.name, n.to.name])).toEqual([
      ['DC Power Supply', 'Inline Fuse Holder'],
      ['Inline Fuse Holder', 'Power Switch'],
      ['Power Switch', so101().parts[0].name],
    ]);
    expect(supplies(so101())['supply:xt60-pigtail']).toBeUndefined();
    expect(bomLines(so101()).has('supply:xt60-pigtail')).toBe(false);
    expect(bomLines(so101()).get('supply:dc-barrel-pigtail')).toBe(1);
  });

  it('feeds a rover bus from its buck regulator and takes the pigtail from the battery', () => {
    const net = wiringNetlist(rover());
    const pairs = net.power.nets.map((n) => [n.from.id ?? n.from.name, n.to.id ?? n.to.name]);

    expect(net.power.source).toMatchObject({ id: 'pack', connector: 'xt60' });
    expect(pairs).toEqual([
      ['pack', 'Inline Fuse Holder'],
      ['Inline Fuse Holder', 'Power Switch'],
      ['Power Switch', 'buck'],
      ['buck', 'adapter'],
    ]);
    expect(supplies(rover())).toMatchObject({ 'supply:xt60-pigtail': 1, 'supply:servo-cable-5264-3pin': 2 });
  });

  it('flags Dynamixel servos left on a Feetech adapter as one Servo bus blocker', () => {
    const net = wiringNetlist(mixedArm());

    expect(net.unmatched).toEqual(['xl1', 'xl2']);

    const scene = mixedArm();
    const report = runEngineering({ ...scene, measures: {}, servoOutputs: {} });
    const findings = engineeringFindings(report).filter((f) => f.check === 'Servo bus');

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ level: 'blocker', ids: ['xl1', 'xl2'] });
    expect(findings[0].text).toBe('These servos need an adapter for their bus.');
    expect(engineeringText(report, (v) => v)).toContain('No adapter takes the connector on: xl1, xl2');
  });

  it('leaves a matched scene without a Servo bus row and gives the agent the chain', () => {
    const report = runEngineering({ ...so101(), measures: {}, servoOutputs: {} });

    expect(report.rows.some((r) => r.check === 'Servo bus')).toBe(false);
    expect(engineeringText(report, (v) => v)).toMatch(/Bus 1: .*adapter.* → .*servo1.* servo id 1/);
  });
});

describe('the BOM reads cables from the netlist', () => {
  it('lists the cables per hop in place of the generic pack', () => {
    expect(bomLines(so101()).get('supply:servo-cable-5264-3pin')).toBe(6);
    expect(bomLines(xl330Arm()).has('supply:servo-cable-5264-3pin')).toBe(false);
  });

  it('changes nothing but the cable line for an old scene with one loose servo', () => {
    const scene = { parts: [component('servo', 'feetech-sts3215', 'c001')], project: so101().project };
    const old = { ...scene, project: { ...scene.project, joints: [] } };
    const lines = bomLines(old);

    expect(lines.get('supply:servo-cable-5264-3pin')).toBe(1);
    expect(lines.get('component:feetech-sts3215|c001')).toBe(1);
  });

  it('keeps the generic cable rule for servos without connector ports', () => {
    const lines = bomLines({ parts: [component('lx', 'hiwonder-lx-16a')], project: so101().project });

    expect(lines.get('supply:servo-cable-5264-3pin')).toBe(1);
  });
});
