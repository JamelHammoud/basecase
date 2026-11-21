import { describe, expect, it } from 'vitest';
import { electricalProjection } from './electrical';
import { electricalScenes } from './electricalFixtures';
import { ELECTRICAL_PIN_MAPS } from './electricalPinMaps';
import { component, sceneOf, so101 } from './fixtures';
import { wiringNetlist } from './netlist';
import { validateElectrical } from './electricalValidation';

describe('robot electrical projection', () => {
  it.each(electricalScenes())(
    'preserves source identities, wiring and unknowns for $name',
    ({ scene, mappedServos }) => {
      const before = structuredClone(scene);
      const wiring = wiringNetlist(scene);
      const result = electricalProjection(scene);
      const servos = result.endpoints.filter((end) => end.port === 'bus-in' && end.map);

      expect(servos).toHaveLength(mappedServos);
      expect(result.wiring).toEqual(wiring);
      expect(scene).toEqual(before);
      expect(result.electricalVerdict).toBe('not-established');
      expect(result.completeness).toBe('draft');
      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.nets.every((net) => net.transientA === null)).toBe(true);
      expect(result).toEqual(electricalProjection(JSON.parse(JSON.stringify(scene))));
    },
  );

  it('uses the maker pin numbers at both cable ends instead of connector shape', () => {
    const result = electricalProjection(so101());
    const adapter = result.endpoints.find((end) => end.partId === 'adapter' && end.port === 'bus-out')!;
    const servo = result.endpoints.find((end) => end.partId === 'servo1' && end.port === 'bus-in')!;
    const data = result.nets.find((net) => net.function === 'data')!;
    const ground = result.nets.find((net) => net.function === 'ground')!;

    expect(data.nodes).toContainEqual({ reference: adapter.reference, pin: '1' });
    expect(data.nodes).toContainEqual({ reference: servo.reference, pin: '3' });
    expect(ground.nodes).toContainEqual({ reference: adapter.reference, pin: '3' });
    expect(ground.nodes).toContainEqual({ reference: servo.reference, pin: '1' });
    expect(adapter.map?.source).toBe('https://files.waveshare.com/wiki/Bus_Servo_Adapter_A/Bus_Servo_Adapter_A.pdf');
    expect(servo.map?.sourceLocator).toContain('6-7');
  });

  it('keeps repeated names distinct and preserves bus identities', () => {
    const scene = electricalScenes().find((entry) => entry.name === 'hexapod')!.scene;

    scene.parts.forEach((part) => {
      part.name = 'Module';
    });

    const result = electricalProjection(scene);

    expect(new Set(result.endpoints.map((end) => end.reference)).size).toBe(result.endpoints.length);
    expect(result.nets.filter((net) => net.function === 'data').map((net) => net.bus)).toEqual([0, 1]);
  });

  it('refuses missing maps and missing manufacturer evidence without inventing pins', () => {
    const scene = so101();
    const maps = structuredClone(ELECTRICAL_PIN_MAPS);

    maps[0].ports[0].source = '';

    const missingSource = electricalProjection({ ...scene, pinMaps: maps });
    const unknown = electricalProjection({ ...scene, pinMaps: [] });

    expect(missingSource.requirements.some((item) => item.code === 'missing-pin-source')).toBe(true);
    expect(unknown.endpoints.filter((end) => end.partId !== null).every((end) => end.map === null)).toBe(true);
    expect(
      unknown.nets.every((net) =>
        net.nodes.every(
          (node) => unknown.endpoints.find((end) => end.reference === node.reference)?.map?.basis === 'requirement',
        ),
      ),
    ).toBe(true);
    expect(unknown.completeness).toBe('draft');
    expect(unknown.requirements.some((item) => item.code === 'unknown-pin-map')).toBe(true);
  });

  it('detects reversed polarity and removed ground in a perturbed projection', () => {
    const result = electricalProjection(so101());
    const ground = result.nets.find((net) => net.function === 'ground')!;
    const positive = result.nets.find((net) => net.function === 'positive')!;
    const groundPin = ground.nodes.pop()!;

    expect(validateElectrical(result).some((item) => item.code === 'missing-ground')).toBe(true);
    positive.nodes.push(groundPin);
    expect(validateElectrical(result).some((item) => item.code === 'polarity-conflict')).toBe(true);
  });

  it('detects pin-map perturbations, missing source and overvoltage rather than trusting generated labels', () => {
    const result = electricalProjection(so101());
    const endpoint = result.endpoints.find((end) => end.partId === 'servo1' && end.port === 'bus-in')!;

    endpoint.map!.pins.reverse();
    endpoint.map!.pins[0].function = 'ground';
    expect(validateElectrical(result).some((item) => item.code === 'pin-map-mismatch')).toBe(true);

    const high = electricalProjection({
      ...so101(),
      project: { ...so101().project, tether: { volts: 24, amps: 0.5 } },
    });

    expect(high.requirements.some((item) => item.code === 'rail-voltage')).toBe(true);
    expect(high.requirements.some((item) => item.code === 'rail-overload')).toBe(true);

    const missing = electricalProjection(sceneOf([component('sensor', 'raspberry-pi-5')], []));

    expect(missing.requirements.some((item) => item.code === 'missing-source')).toBe(true);
  });
});
