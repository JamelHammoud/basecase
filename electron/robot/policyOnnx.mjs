const IR_VERSION = 8;
const OPSET = 17;
const TENSOR_FLOAT = 1;
const ATTRIBUTE_FLOAT = 1;
const NORM_CLIP = 5;
const ACTION_CLIP = 1;
const MAX_LAYERS = 8;
const MAX_WIDTH = 4096;
const MAX_WEIGHTS = 4_000_000;

function varint(value) {
  const out = [];
  let rest = value;

  while (rest >= 0x80) {
    out.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }

  out.push(rest);

  return Buffer.from(out);
}

class Message {
  chunks = [];

  tag(field, wire) {
    this.chunks.push(varint(field * 8 + wire));
  }

  number(field, value) {
    this.tag(field, 0);
    this.chunks.push(varint(value));

    return this;
  }

  bytes(field, value) {
    this.tag(field, 2);
    this.chunks.push(varint(value.length), value);

    return this;
  }

  text(field, value) {
    return this.bytes(field, Buffer.from(value, 'utf8'));
  }

  message(field, value) {
    return this.bytes(field, value.encode());
  }

  float(field, value) {
    const raw = Buffer.alloc(4);

    raw.writeFloatLE(value);
    this.tag(field, 5);
    this.chunks.push(raw);

    return this;
  }

  encode() {
    return Buffer.concat(this.chunks);
  }
}

const floats = (values) => Buffer.from(new Float32Array(values).buffer);

function tensor(name, dims, values) {
  const message = new Message();

  for (const dim of dims) message.number(1, dim);

  return message.number(2, TENSOR_FLOAT).text(8, name).bytes(9, floats(values));
}

function valueInfo(name, width) {
  const shape = new Message().message(1, new Message().text(2, 'batch')).message(1, new Message().number(1, width));
  const tensorType = new Message().number(1, TENSOR_FLOAT).message(2, shape);

  return new Message().text(1, name).message(2, new Message().message(1, tensorType));
}

function node(op, name, inputs, output) {
  const message = new Message();

  for (const input of inputs) message.text(1, input);

  return message.text(2, output).text(3, name).text(4, op);
}

function activation(kind, name, input, output) {
  if (kind === 'tanh') return node('Tanh', name, [input], output);

  const alpha = new Message().text(1, 'alpha').float(2, 1).number(20, ATTRIBUTE_FLOAT);

  return node('Elu', name, [input], output).message(5, alpha);
}

function weightsByInput(layer) {
  const out = new Array(layer.in * layer.out);

  for (let o = 0; o < layer.out; o++)
    for (let i = 0; i < layer.in; i++) out[i * layer.out + o] = layer.w[o * layer.in + i];

  return out;
}

const finiteList = (values, length) =>
  Array.isArray(values) && values.length === length && values.every((v) => Number.isFinite(v));

const isWidth = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_WIDTH;

function layerFits(layer, inputs) {
  if (!layer || layer.in !== inputs || !isWidth(layer.in) || !isWidth(layer.out)) return false;

  return finiteList(layer.w, layer.in * layer.out) && finiteList(layer.b, layer.out);
}

function fits(spec) {
  const layers = spec?.layers;

  if (!Array.isArray(layers) || layers.length === 0 || layers.length > MAX_LAYERS) return false;

  if (!['elu', 'tanh'].includes(spec.activation) || ![undefined, 'tanh'].includes(spec.squash)) return false;

  if (layers.reduce((n, l) => n + (Number(l?.in) || 0) * (Number(l?.out) || 0), 0) > MAX_WEIGHTS) return false;

  const width = layers[0]?.in;

  return (
    finiteList(spec.obsMean, width) &&
    finiteList(spec.obsStd, width) &&
    layers.every((layer, k) => layerFits(layer, k === 0 ? width : layers[k - 1].out))
  );
}

function graphOf(spec) {
  const width = spec.obsMean.length;
  const nodes = [
    node('Sub', 'center', ['obs', 'obs_mean'], 'centered'),
    node('Div', 'scale', ['centered', 'obs_std'], 'scaled'),
    node('Clip', 'bound', ['scaled', 'clip_low', 'clip_high'], 'normalized'),
  ];
  const initializers = [
    tensor('obs_mean', [width], spec.obsMean),
    tensor('obs_std', [width], spec.obsStd),
    tensor('clip_low', [], [-NORM_CLIP]),
    tensor('clip_high', [], [NORM_CLIP]),
  ];
  let current = 'normalized';

  spec.layers.forEach((layer, k) => {
    initializers.push(
      tensor(`w${k}`, [layer.in, layer.out], weightsByInput(layer)),
      tensor(`b${k}`, [layer.out], layer.b),
    );
    nodes.push(
      node('MatMul', `layer${k}`, [current, `w${k}`], `mul${k}`),
      node('Add', `offset${k}`, [`mul${k}`, `b${k}`], `sum${k}`),
    );
    current = `sum${k}`;

    if (k === spec.layers.length - 1) return;

    nodes.push(activation(spec.activation, `activate${k}`, current, `act${k}`));
    current = `act${k}`;
  });

  if (spec.squash === 'tanh') {
    nodes.push(node('Tanh', 'squash', [current], 'squashed'));
    current = 'squashed';
  }

  nodes.push(node('Clip', 'bound_action', [current, 'action_low', 'action_high'], 'action'));
  initializers.push(tensor('action_low', [], [-ACTION_CLIP]), tensor('action_high', [], [ACTION_CLIP]));

  return { nodes, initializers, outputs: spec.layers.at(-1).out };
}

export function policyOnnx(spec) {
  if (!fits(spec)) return null;

  const { nodes, initializers, outputs } = graphOf(spec);
  const graph = new Message();

  for (const item of nodes) graph.message(1, item);

  graph.text(2, 'basecase_policy');

  for (const item of initializers) graph.message(5, item);

  graph.message(11, valueInfo('obs', spec.obsMean.length)).message(12, valueInfo('action', outputs));

  return new Message()
    .number(1, IR_VERSION)
    .text(2, 'basecase')
    .message(7, graph)
    .message(8, new Message().text(1, '').number(2, OPSET))
    .encode();
}
