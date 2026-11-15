import { describe, expect, it } from 'vitest';
import { applyMeasurements, benchmarkDevice } from './measurements.mjs';

const source = `export const MODEL_NODES = [
  { id: 'person-detection', model: 'YOLO11n', licence: 'AGPL-3.0', measuredMs: { mac: 1, browser: 2 } },
  { id: 'object-detection', model: 'RF-DETR Nano', licence: 'Apache-2.0', measuredMs: { pi5: 3 } },
  { id: 'speech-out', model: 'Kokoro-82M', licence: 'Apache-2.0', measuredMs: {} },
];\n`;
const record = { device: 'mac', measurements: [{ modelId: 'yolo11n', medianMs: 10.125 }] };
const withoutTimings = (text) => text.replace(/measuredMs:\s*\{[^}]*\}/gu, 'measuredMs: {}');

describe('measured vision timings in the node catalogue', () => {
  it('updates only measured nodes and retains other device timings and model metadata', () => {
    const updated = applyMeasurements(source, record);

    expect(updated).toContain('mac: 10.13');
    expect(updated).toContain('browser: 2');
    expect(updated).toContain(
      "{ id: 'object-detection', model: 'RF-DETR Nano', licence: 'Apache-2.0', measuredMs: { pi5: 3 } }",
    );
    expect(withoutTimings(updated)).toBe(withoutTimings(source));
  });

  it('adds a measured device without replacing an existing device and is idempotent', () => {
    const measured = { device: 'pi5', measurements: [{ modelId: 'yolo11n', medianMs: 40 }] };
    const updated = applyMeasurements(source, measured);

    expect(updated).toContain('mac: 1');
    expect(updated).toContain('browser: 2');
    expect(updated).toContain('pi5: 40');
    expect(applyMeasurements(updated, measured)).toBe(updated);
  });

  it('refuses unsupported devices, malformed catalogues and non-finite measurements', () => {
    expect(() => benchmarkDevice('browser')).toThrow('mac or pi5');
    expect(() => applyMeasurements(source, { ...record, device: 'cloud' })).toThrow('mac or pi5');
    expect(() =>
      applyMeasurements(source, { ...record, measurements: [{ modelId: 'yolo11n', medianMs: NaN }] }),
    ).toThrow('positive');
    expect(() => applyMeasurements('export const MODEL_NODES = load();', record)).toThrow('array');
    expect(() =>
      applyMeasurements(source.replace('measuredMs: { mac: 1, browser: 2 }', 'measuredMs: load()'), record),
    ).toThrow('object');
  });
});
