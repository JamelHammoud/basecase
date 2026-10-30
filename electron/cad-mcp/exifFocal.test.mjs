import { describe, expect, it } from 'vitest';
import { exifFocal } from './exifFocal.mjs';

function jpegWithFocal({ focal35, focalMm }) {
  const tiff = Buffer.alloc(80);

  tiff.write('II', 0, 'ascii');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8769, 10);
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(2, 26);
  tiff.writeUInt16LE(0xa405, 28);
  tiff.writeUInt16LE(3, 30);
  tiff.writeUInt32LE(1, 32);
  tiff.writeUInt16LE(focal35, 36);
  tiff.writeUInt16LE(0x920a, 40);
  tiff.writeUInt16LE(5, 42);
  tiff.writeUInt32LE(1, 44);
  tiff.writeUInt32LE(60, 48);
  tiff.writeUInt32LE(focalMm * 100, 60);
  tiff.writeUInt32LE(100, 64);

  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff]);
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0]);

  header.writeUInt16BE(app1.length + 2, 4);

  return Buffer.concat([header, app1, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
}

describe('EXIF focal length', () => {
  it('reads the 35 mm equivalent and the real focal length from a phone JPEG', () => {
    expect(exifFocal(jpegWithFocal({ focal35: 26, focalMm: 6.86 }))).toEqual({ focal35: 26, focalMm: 6.86 });
  });

  it('has nothing for a PNG', () => {
    expect(exifFocal(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBeNull();
  });
});
