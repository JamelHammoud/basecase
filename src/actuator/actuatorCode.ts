import { boxPlaceholder, type CadBox } from '../agent/cadPlaceholder';
import type { AgentCadPayload } from '../agent/cadMesh';
import type { CycloidalDesign } from './cycloidal';
import type { BldcMotor } from './motors';

export type PrintedPiece = 'housing' | 'cover' | 'disc1' | 'disc2' | 'output' | 'shaft';

export const PRINTED_PIECES: Array<{ piece: PrintedPiece; name: string }> = [
  { piece: 'housing', name: 'Housing' },
  { piece: 'cover', name: 'Cover' },
  { piece: 'disc1', name: 'Disc 1' },
  { piece: 'disc2', name: 'Disc 2' },
  { piece: 'output', name: 'Output' },
  { piece: 'shaft', name: 'Input shaft' },
];

const MECH = 'include <robotics.scad>\ninclude <mechanisms.scad>\n';

export function cycloidalCall(d: CycloidalDesign, motor: BldcMotor, piece: PrintedPiece): string {
  const args = [
    `ratio = ${d.ratio}`,
    `pin_r = ${d.pinCircleR}`,
    `pin_d = ${d.pinD}`,
    `ecc = ${d.ecc}`,
    `fit = ${d.fit}`,
    `disc_t = ${d.discT}`,
    `gap = ${d.gap}`,
    `cam_d = ${d.camD}`,
    `disc_bore = ${d.discBore}`,
    `out_pins = ${d.outPins}`,
    `out_pin_d = ${d.outPinD}`,
    `out_pin_r = ${d.outPinR}`,
    `hole_d = ${d.holeD}`,
    `wall = ${d.wall}`,
    `housing_h = ${d.housingH}`,
    `stage_h = ${d.stageH}`,
    `shaft_d = ${d.shaftD}`,
    `bolt_circle = ${motor.faceBolts.circleMm}`,
    `bolt_m = ${motor.faceBolts.m}`,
    `part = "${piece}"`,
  ];

  return `${MECH}cycloidal_drive(${args.join(', ')});`;
}

const discZ = (d: CycloidalDesign, k: 0 | 1) => 5 + k * (d.discT + d.gap);

function roughBox(d: CycloidalDesign, piece: PrintedPiece): CadBox {
  const R = d.housingD / 2;
  const disc = d.pinCircleR + d.ecc;
  const carrier = d.outPinR + d.outPinD / 2 + 3;
  const boxes: Record<PrintedPiece, CadBox> = {
    housing: [
      [-R, -R, 0],
      [R, R, d.housingH],
    ],
    cover: [
      [-R, -R, d.housingH],
      [R, R, d.stageH - 1],
    ],
    disc1: [
      [-disc, -disc, discZ(d, 0)],
      [disc, disc, discZ(d, 0) + d.discT],
    ],
    disc2: [
      [-disc, -disc, discZ(d, 1)],
      [disc, disc, discZ(d, 1) + d.discT],
    ],
    output: [
      [-carrier, -carrier, 5.5],
      [carrier, carrier, d.stageH],
    ],
    shaft: [
      [-d.camD / 2 - d.ecc, -d.camD / 2, 1],
      [d.camD / 2 + d.ecc, d.camD / 2, discZ(d, 1) + d.discT],
    ],
  };

  return boxes[piece];
}

export const pieceCad = (d: CycloidalDesign, motor: BldcMotor, piece: PrintedPiece): AgentCadPayload =>
  boxPlaceholder(cycloidalCall(d, motor, piece), roughBox(d, piece));
