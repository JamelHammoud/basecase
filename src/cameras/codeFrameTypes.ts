export interface CodeFrameRequest {
  camera: string;
  width: number;
  height: number;
  fps: number;
}

export interface CodeFrameStream {
  port: MessagePort;
  close: () => void;
}

export type OpenCodeFrames = (request: CodeFrameRequest) => CodeFrameStream | string;

export interface CodeFrameMessage {
  bitmap: ImageBitmap;
  time: number;
}

export const CODE_FRAME_MAX = { width: 640, height: 480, fps: 15 } as const;

export const CODE_FRAME_DEFAULT = { width: 160, fps: 10 } as const;

export const MAX_FRAME_STREAMS = 2;

export const frameHeight = (width: number) => Math.round((width * 3) / 4);
