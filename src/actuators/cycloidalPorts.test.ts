import { beforeAll, describe, expect, it } from 'vitest';
import { scadPortsParallel, type EchoedPort } from '../../electron/cad-mcp/recipes/scadPorts.mjs';
import { cycloidalSpec } from '../data/generatedActuators';
import {
  cycloidalCode,
  levels,
  motorOf,
  POST_ANGLES,
  postRadius,
  PRINTED_PARTS,
  sizedDesign,
  type PrintedPart,
} from './cycloidal';

const design = sizedDesign('odrive-d6374', 15, cycloidalSpec('odrive-d6374', 15)!.stallNm);
const z = levels(design);
let ports: Record<PrintedPart, EchoedPort[]>;

beforeAll(async () => {
  const echoed = await scadPortsParallel(PRINTED_PARTS.map((part) => cycloidalCode(design, part)));

  ports = Object.fromEntries(PRINTED_PARTS.map((part, i) => [part, echoed.ports[i]])) as typeof ports;
}, 120000);

const at = (part: PrintedPart, name: string) => ports[part].find((p) => p.name === name)?.pos;

const polar = (r: number, deg: number, height: number) => [
  r * Math.cos((deg * Math.PI) / 180),
  r * Math.sin((deg * Math.PI) / 180),
  height,
];

const off = (label: string, got: number[] | undefined, want: number[]) =>
  got?.every((v, k) => Math.abs(v - want[k]) < 0.02)
    ? []
    : [`${label}: ${JSON.stringify(got)}, placed at ${JSON.stringify(want)}`];

describe('the cycloidal code and the parts placed around it', () => {
  it('seat the bearings, encoder and output where the placement puts them', () => {
    expect([
      ...off('bearing_a', at('disc_a', 'bearing_a'), [design.e, 0, z.discA]),
      ...off('bearing_b', at('disc_b', 'bearing_b'), [-design.e, 0, z.discB]),
      ...off('shaft_bearing', at('cap', 'shaft_bearing'), [0, 0, z.cap]),
      ...off('out_bearing', at('cap', 'out_bearing'), [0, 0, z.outBearing]),
      ...off('encoder', at('cap', 'encoder'), [0, 0, z.hub]),
      ...off('output', at('output', 'output'), [0, 0, z.out]),
      ...off('motor_shaft', at('shaft', 'motor_shaft'), [0, 0, z.baseTop + 0.3]),
    ]).toEqual([]);
  });

  it('put the posts, cap screws and motor screws where the placement puts them', () => {
    const m = motorOf(design).stator;

    const posts = POST_ANGLES.flatMap((deg, i) => [
      ...off(`post_${i}`, at('housing', `post_${i}`), polar(postRadius(design), deg, z.cap)),
      ...off(`cap_screw_${i}`, at('cap', `cap_screw_${i}`), polar(postRadius(design), deg, z.cap + 2.6)),
    ]);
    const screws = Array.from({ length: m.holes }, (_, i) => m.phase + (360 * i) / m.holes).flatMap((deg, i) =>
      off(`motor_screw_${i}`, at('housing', `motor_screw_${i}`), polar(m.pcd / 2, deg, z.baseTop - m.m - 0.4)),
    );

    expect([...posts, ...screws]).toEqual([]);
  });
});
