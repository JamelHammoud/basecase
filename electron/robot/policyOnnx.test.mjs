import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { act } from '../../src/sim/policy';
import { policyOnnx } from './policyOnnx.mjs';

const KIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'routines', 'kit');
const kitPolicy = (name) => JSON.parse(fs.readFileSync(path.join(KIT, `${name}.skill.json`), 'utf8')).controller.policy;

function fields(bytes) {
  const out = [];
  let at = 0;
  const varint = () => {
    let value = 0;
    let scale = 1;

    while (bytes[at] & 0x80) {
      value += (bytes[at++] & 0x7f) * scale;
      scale *= 128;
    }

    return value + bytes[at++] * scale;
  };

  while (at < bytes.length) {
    const key = varint();
    const wire = key % 8;
    const field = Math.floor(key / 8);

    const length = { 0: 0, 2: wire === 2 ? varint() : 0, 5: 4 }[wire];
    const start = at;

    at += length;

    if (wire === 0) out.push({ field, value: varint() });

    if (wire === 5) out.push({ field, value: bytes.readFloatLE(start) });

    if (wire === 2) out.push({ field, value: bytes.subarray(start, at) });
  }

  return out;
}

const all = (list, field) => list.filter((f) => f.field === field).map((f) => f.value);
const one = (list, field) => all(list, field)[0];
const text = (list, field) => one(list, field)?.toString('utf8');

function decode(bytes) {
  const model = fields(bytes);
  const graph = fields(one(model, 7));
  const tensors = new Map(
    all(graph, 5).map((t) => {
      const f = fields(t);
      const raw = one(f, 9);

      return [
        text(f, 8),
        { dims: all(f, 1), values: new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length)) },
      ];
    }),
  );
  const nodes = all(graph, 1).map((n) => {
    const f = fields(n);

    return { inputs: all(f, 1).map(String), output: text(f, 2), op: text(f, 4) };
  });

  return { ir: one(model, 1), opset: one(fields(one(model, 8)), 2), tensors, nodes };
}

const ELEMENTWISE = {
  Sub: (a, b) => a - b,
  Div: (a, b) => a / b,
  Add: (a, b) => a + b,
};

function run({ tensors, nodes }, obs) {
  const values = new Map([...[...tensors].map(([k, t]) => [k, t.values]), ['obs', Float32Array.from(obs)]]);
  const at = (v, i) => (v.length === 1 ? v[0] : v[i]);

  for (const { op, inputs, output } of nodes) {
    const [x, y, z] = inputs.map((name) => values.get(name));
    let result;

    if (op in ELEMENTWISE) result = x.map((v, i) => ELEMENTWISE[op](v, at(y, i)));

    if (op === 'Clip') result = x.map((v) => Math.min(z[0], Math.max(y[0], v)));

    if (op === 'Elu') result = x.map((v) => (v > 0 ? v : Math.expm1(v)));

    if (op === 'Tanh') result = x.map(Math.tanh);

    if (op === 'MatMul') {
      const [, outs] = tensors.get(inputs[1]).dims;

      result = new Float32Array(outs).map((_, o) => x.reduce((s, v, i) => s + v * y[i * outs + o], 0));
    }

    values.set(output, result);
  }

  return values.get('action');
}

describe('policy ONNX', () => {
  it('runs the Motor Kit Walk skill as the app runs it', () => {
    const spec = kitPolicy('quad-servo-velocity-tracking');
    const model = decode(policyOnnx(spec));

    expect([model.ir, model.opset]).toEqual([8, 17]);
    expect(model.nodes.map((n) => n.op)).toEqual([
      'Sub',
      'Div',
      'Clip',
      'MatMul',
      'Add',
      'Elu',
      'MatMul',
      'Add',
      'Elu',
      'MatMul',
      'Add',
      'Elu',
      'MatMul',
      'Add',
      'Clip',
    ]);

    for (let r = 0; r < 8; r++) {
      const obs = spec.obsMean.map((m, i) => m + Math.sin(r * 7 + i) * 3 * spec.obsStd[i]);
      const expected = act(spec, Float32Array.from(obs));
      const got = run(model, obs);

      expected.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 4));
    }
  });

  it('squashes with tanh when the policy does', () => {
    const spec = { ...kitPolicy('quad-servo-settle-to-neutral'), squash: 'tanh' };
    const model = decode(policyOnnx(spec));
    const obs = spec.obsMean.map((m, i) => m + Math.cos(i) * spec.obsStd[i]);

    expect(model.nodes.at(-2).op).toBe('Tanh');
    act(spec, Float32Array.from(obs)).forEach((v, i) => expect(run(model, obs)[i]).toBeCloseTo(v, 4));
  });

  it('refuses a policy whose layers don’t line up', () => {
    const spec = kitPolicy('quad-servo-settle-to-neutral');
    const [first, second, ...rest] = spec.layers;
    const broken = [
      { ...spec, layers: [] },
      { ...spec, layers: [first, { ...second, in: second.in + 1 }, ...rest] },
      { ...spec, layers: [{ ...first, w: first.w.slice(1) }, second, ...rest] },
      { ...spec, layers: [{ ...first, b: [...first.b.slice(1), Number.NaN] }, second, ...rest] },
      { ...spec, obsStd: spec.obsStd.slice(1) },
      { ...spec, activation: 'relu' },
      { ...spec, squash: 'sigmoid' },
      { ...spec, layers: Array(9).fill(first) },
      null,
      'policy',
    ];

    for (const policy of broken) expect(policyOnnx(policy)).toBeNull();
  });
});
