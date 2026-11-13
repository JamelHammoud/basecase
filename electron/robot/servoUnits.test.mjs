import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkWithFake } from './robotLinkFake.mjs';
import { checkedRobotSpec } from './robotSpec.mjs';

const ARM = { family: 'feetech', ids: [1, 2], class: 'arm', emulated: true };
const G1 = { family: 'unitree-g1', emulated: true };

const XL430 = {
  volts: 11.1,
  kt: 0.9,
  resistance: 4.1,
  armature: 0.01,
  friction: {
    base: 0.03,
    stribeck: 0.0001,
    loadMotor: 0.04,
    loadExternal: 0.2,
    loadMotorStribeck: 1e-8,
    loadExternalStribeck: 0.14,
    loadMotorQuad: 0.007,
    loadExternalQuad: 0.003,
    dthetaStribeck: 0.37,
    alpha: 9.9,
    viscous: 0.03,
  },
  firmwareKp: 32,
  errorGain: 0.166,
  errorGainRatio: 1.16,
  maxDuty: 0.97,
  maxVelocity: 5.1,
  delayS: 0.005,
};
const WITH_UNITS = { ...ARM, family: 'dynamixel', units: [XL430, null] };

const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));

const withFriction = (friction) => ({ ...XL430, friction: { ...XL430.friction, ...friction } });

describe('robot link with a servo model per id', () => {
  it('accepts one model or null per id, with or without a factory bus, and keeps its own copy', () => {
    const ask = structuredClone(WITH_UNITS);
    const checked = checkedRobotSpec(ask);

    expect(checked).toEqual({ ok: true, spec: WITH_UNITS });
    ask.units[0].kt = 99;
    ask.units[0].friction.base = 99;
    expect(checked.spec.units[0]).toEqual(XL430);
    expect(checkedRobotSpec({ ...WITH_UNITS, factory: true })).toEqual({
      ok: true,
      spec: { ...WITH_UNITS, factory: true },
    });
    expect(checkedRobotSpec({ ...ARM, units: [null, null] }).ok).toBe(true);
    expect(checkedRobotSpec({ ...ARM, units: [withFriction({ base: 0 }), null] }).ok).toBe(true);
    expect(checkedRobotSpec(ARM).spec).not.toHaveProperty('units');
  });

  it('refuses models that do not fit the ids or the fit', () => {
    const noVolts = without(XL430, 'volts');
    const noAlpha = without(XL430.friction, 'alpha');
    const asks = [
      { ...ARM, units: [XL430] },
      { ...ARM, units: [XL430, null, null] },
      { ...ARM, units: 'xl430' },
      { ...ARM, units: [XL430, undefined] },
      { ...ARM, units: [{ ...XL430, port: '/dev/ttyUSB0' }, null] },
      { ...ARM, units: [noVolts, null] },
      { ...ARM, units: [{ ...XL430, friction: noAlpha }, null] },
      { ...ARM, units: [withFriction({ drag: 1 }), null] },
      { ...ARM, units: [{ ...XL430, friction: null }, null] },
      { ...ARM, units: [{ ...XL430, kt: Infinity }, null] },
      { ...ARM, units: [{ ...XL430, kt: Number.NaN }, null] },
      { ...ARM, units: [{ ...XL430, kt: '0.9' }, null] },
      { ...ARM, units: [{ ...XL430, kt: 0 }, null] },
      { ...ARM, units: [{ ...XL430, resistance: -4.1 }, null] },
      { ...ARM, units: [{ ...XL430, volts: 61 }, null] },
      { ...ARM, units: [{ ...XL430, maxVelocity: 1e5 }, null] },
      { ...ARM, units: [withFriction({ base: -0.03 }), null] },
      { ...ARM, units: [Object.assign(Object.create({ kt: 1 }), XL430), null] },
      { ...G1, units: [] },
    ];

    for (const ask of asks) {
      const reply = checkedRobotSpec(ask);

      expect(reply.ok, JSON.stringify(ask)).toBe(false);
      expect(reply.message).toMatch(/^(A servo model|Give one servo model|Only an emulated robot)/);
    }
  });

  it('writes the models beside the calibration and passes them to the daemon only when given', () => {
    const { link, spawned } = linkWithFake();

    expect(link.connect({ ...WITH_UNITS, factory: true })).toEqual({ ok: true });

    const [{ args }] = spawned;
    const artefacts = args[args.indexOf('--artefacts') + 1];
    const units = path.join(artefacts, 'units.json');

    expect(args.slice(args.indexOf('--units'))).toEqual(['--units', units]);
    expect(args).toContain('--factory');
    expect(JSON.parse(fs.readFileSync(units, 'utf8'))).toEqual([XL430, null]);
    link.disconnect();

    const plain = linkWithFake();

    plain.link.connect(ARM);

    const plainArgs = plain.spawned[0].args;

    expect(plainArgs).not.toContain('--units');
    expect(fs.existsSync(path.join(plainArgs[plainArgs.indexOf('--artefacts') + 1], 'units.json'))).toBe(false);
    plain.link.disconnect();
  });
});
