import { expect, it } from 'vitest';
import { gzipSync } from 'three/examples/jsm/libs/fflate.module.js';
import { offlineEvaluationMesh } from './evaluationAssets';
import { decodeEvaluationPayload, MAX_EVALUATION_PAYLOAD } from './evaluationPayload';

function meshWithUri(uri: string): Uint8Array {
  const json = JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri, byteLength: 4 }] });
  const padded = json.padEnd(Math.ceil(json.length / 4) * 4);
  const bytes = new Uint8Array(20 + padded.length);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(new TextEncoder().encode(padded), 20);

  return bytes;
}

it('refuses external, local and executable mesh resources before loading their geometry', () => {
  for (const uri of ['https://example.com/mesh.bin', '../mesh.bin', 'file:///mesh.bin', 'data:text/html;base64,AAAA'])
    expect(offlineEvaluationMesh(meshWithUri(uri))).toBe(false);

  expect(offlineEvaluationMesh(meshWithUri('data:application/octet-stream;base64,AAAAAA=='))).toBe(true);
  expect(offlineEvaluationMesh(new Uint8Array([1, 2, 3]))).toBe(false);
});

it('bounds decompression before allocating an imported evaluation payload', () => {
  const bytes = gzipSync(new TextEncoder().encode('{}'), { mtime: 0 });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  view.setUint32(bytes.length - 4, MAX_EVALUATION_PAYLOAD + 1, true);
  expect(() => decodeEvaluationPayload(bytes)).toThrow('exceeds its limits');
});
