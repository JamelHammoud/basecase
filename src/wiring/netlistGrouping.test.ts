import { describe, expect, it } from 'vitest';
import { component, sceneOf, servoJoints } from './fixtures';
import { wiringNetlist } from './netlist';

describe('connector bus grouping', () => {
  it('keeps first servo connector order, adapter order and loose servos across mixed buses', () => {
    const sts = servoJoints({ prefix: 'sts', componentId: 'feetech-sts3215', variant: 'c001', count: 4 });
    const xl = servoJoints({ prefix: 'xl', componentId: 'dynamixel-xl330-m288', count: 3 });
    const adapters = [
      component('sts-a', 'waveshare-bus-servo-adapter-a'),
      component('xl-a', 'robotis-u2d2'),
      component('sts-b', 'waveshare-bus-servo-adapter-a'),
      component('xl-b', 'robotis-u2d2'),
      component('xl-c', 'robotis-u2d2'),
      component('xl-unused', 'robotis-u2d2'),
    ];
    const scene = sceneOf(
      [...adapters, ...sts.parts, ...xl.parts],
      [xl.joints[1], sts.joints[2], xl.joints[0], sts.joints[0], sts.joints[2]],
    );
    const original = structuredClone(scene);
    const net = wiringNetlist(scene);

    expect(net.buses.map((bus) => [bus.connector, bus.adapter, bus.servos.map((servo) => servo.id)])).toEqual([
      ['jst-eh-3', 'xl-a', ['xl2']],
      ['jst-eh-3', 'xl-b', ['xl1']],
      ['jst-eh-3', 'xl-c', ['xl3']],
      ['5264-3', 'sts-a', ['sts3', 'sts1']],
      ['5264-3', 'sts-b', ['sts2', 'sts4']],
    ]);
    expect(net.buses.flatMap((bus) => bus.nets.map((entry) => [entry.from.id, entry.to.id]))).toEqual([
      ['xl-a', 'xl2'],
      ['xl-b', 'xl1'],
      ['xl-c', 'xl3'],
      ['sts-a', 'sts3'],
      ['sts3', 'sts1'],
      ['sts-b', 'sts2'],
      ['sts2', 'sts4'],
    ]);
    expect(net.unmatched).toEqual([]);
    expect(scene).toEqual(original);
  });

  it('retains unheaded buses and only flags unmatched servos when an adapter exists', () => {
    const sts = component('sts', 'feetech-sts3215', 'c001');
    const xl = component('xl', 'dynamixel-xl330-m288');
    const loose = sceneOf([xl, sts], []);
    const net = wiringNetlist(loose);

    expect(net.buses.map((bus) => [bus.connector, bus.adapter])).toEqual([
      ['jst-eh-3', null],
      ['5264-3', null],
    ]);
    expect(net.unmatched).toEqual([]);
    expect(wiringNetlist(sceneOf([...loose.parts, component('adapter', 'robotis-u2d2')], [])).unmatched).toEqual([
      'sts',
    ]);
    expect(wiringNetlist(sceneOf([component('adapter', 'robotis-u2d2')], [])).buses).toEqual([]);
    expect(wiringNetlist(sceneOf([], [])).buses).toEqual([]);
  });
});
