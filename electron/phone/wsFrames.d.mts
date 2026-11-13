export const OPCODE: { text: 1; binary: 2; close: 8; ping: 9; pong: 10 };

export const CLOSE: { normal: 1000; protocol: 1002; tooBig: 1009 };

export const MAX_PAYLOAD: number;

export class FrameError extends Error {
  code: number;
  constructor(code: number, message: string);
}

export function acceptKey(secKey: string): string;

export interface Frame {
  opcode: number;
  payload: Buffer;
  size: number;
}

export function readFrame(bytes: Buffer): Frame | null;

export function readFrames(bytes: Buffer): { frames: Frame[]; rest: Buffer };

export function serverFrame(opcode: number, payload?: Buffer | string): Buffer;

export function closeFrame(code: number): Buffer;

export function pongFrame(payload: Buffer): Buffer;

export function maskedFrame(opcode: number, payload?: Buffer | string): Buffer;
