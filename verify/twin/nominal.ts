import type { ServoFit } from '../../src/data/components';
import type { Family } from './units';

const BAM_PARAMS = 'https://github.com/Rhoban/bam/tree/main/bam/params';

export const TWIN_NOMINAL: Readonly<Record<Family, { fit: ServoFit; volts: number }>> = Object.freeze({
  sts3215: {
    volts: 7.4,
    fit: {
      model: 'bam-m6',
      volts: 7.4,
      kt: 1.2753202369175398,
      resistance: 2.753421214375944,
      armature: 0.021564290129722483,
      friction: {
        base: 0.0533134815909817,
        stribeck: 4.257322248151969e-5,
        loadMotor: 0.044912012282132555,
        loadExternal: 0.24355483356616028,
        loadMotorStribeck: 0.00012448975632695385,
        loadExternalStribeck: 0.1422905635963302,
        loadMotorQuad: 0.007594943296670792,
        loadExternalQuad: 0.00340408727365082,
        dthetaStribeck: 0.371136775424206,
        alpha: 9.93094944677977,
        viscous: 0.028160537042911545,
      },
      firmwareKp: 32,
      errorGain: 0.166,
      errorGainRatio: 1.1616979929275297,
      maxDuty: 0.97,
      maxVelocity: 5.095754044445978,
      delayS: 0.0049807526194816515,
      source: `${BAM_PARAMS}/feetech_sts3215_7_4V/m6.json`,
    },
  },
  xl330: {
    volts: 5,
    fit: {
      model: 'bam-m6',
      volts: 7.5,
      kt: 0.3459739511711113,
      resistance: 2.501880848390462,
      armature: 0.001573222677933975,
      friction: {
        base: 0.011919956825702578,
        stribeck: 0.0008513719673776765,
        loadMotor: 0.22781736172050673,
        loadExternal: 0.10651211228971481,
        loadMotorStribeck: 1.4725366831870136e-8,
        loadExternalStribeck: 0.14201808120858034,
        loadMotorQuad: 0.00526632315329998,
        loadExternalQuad: 0.00298581585293041,
        dthetaStribeck: 0.2606668812858925,
        alpha: 8.528815753151498,
        viscous: 0.005788445053875673,
      },
      firmwareKp: 400,
      errorGain: 4096 / (2 * Math.PI) / (256 * 885),
      errorGainRatio: 1,
      maxDuty: 1,
      delayS: 0.010220594809412403,
      source: `${BAM_PARAMS}/xl330/m6.json`,
    },
  },
});
