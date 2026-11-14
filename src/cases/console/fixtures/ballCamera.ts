import * as THREE from 'three';
import type { V3 } from '../../../utils/kinematics';
import type { FrameSize } from '../codeStreams';

export const BALL_FOV_DEG = 60;

const BACKGROUND = [90, 90, 90];
const RED = [230, 40, 40];

export interface PixelBitmap {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  closed: boolean;
  close: () => void;
}

export function ballPixel(eye: V3, ball: V3, size: FrameSize): { x: number; y: number; radius: number } {
  const camera = new THREE.PerspectiveCamera(BALL_FOV_DEG, size.width / size.height, 1, 10_000);

  camera.position.set(...eye);
  camera.up.set(0, 0, -1);
  camera.lookAt(eye[0], eye[1] - 1, eye[2]);
  camera.updateMatrixWorld();

  const at = new THREE.Vector3(...ball).project(camera);
  const depth = eye[1] - ball[1];

  return {
    x: ((at.x + 1) / 2) * size.width,
    y: ((1 - at.y) / 2) * size.height,
    radius: (25 / depth) * (size.height / 2 / Math.tan(THREE.MathUtils.degToRad(BALL_FOV_DEG / 2))),
  };
}

export function ballFrame(eye: V3, ball: V3, size: FrameSize): PixelBitmap {
  const { x, y, radius } = ballPixel(eye, ball, size);
  const pixels = new Uint8ClampedArray(size.width * size.height * 4);

  for (let row = 0; row < size.height; row++) {
    for (let col = 0; col < size.width; col++) {
      const color = Math.hypot(col + 0.5 - x, row + 0.5 - y) <= radius ? RED : BACKGROUND;

      pixels.set([...color, 255], (row * size.width + col) * 4);
    }
  }

  const bitmap: PixelBitmap = {
    width: size.width,
    height: size.height,
    pixels,
    closed: false,
    close: () => {
      bitmap.closed = true;
    },
  };

  return bitmap;
}

export class PixelCanvas {
  private pixels: Uint8ClampedArray = new Uint8ClampedArray(0);

  readonly width: number;

  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      drawImage: (bitmap: PixelBitmap) => {
        this.pixels = bitmap.pixels;
      },
      getImageData: () => ({ data: this.pixels, width: this.width, height: this.height }),
    };
  }
}
