const join = (...chunks: Uint8Array[]) => {
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  return bytes;
};

function varint(value: number) {
  const bytes: number[] = [];
  let n = value;

  do {
    bytes.push((n & 127) | (n > 127 ? 128 : 0));
    n = Math.floor(n / 128);
  } while (n);

  return new Uint8Array(bytes);
}

const number = (field: number, value: number) => join(varint(field * 8), varint(value));
const message = (field: number, value: Uint8Array) => join(varint(field * 8 + 2), varint(value.length), value);
const string = (field: number, value: string) => message(field, new TextEncoder().encode(value));
const shape = (dims: number[]) => join(...dims.map((dim) => message(1, number(1, dim))));
const valueInfo = (name: string, dims: number[]) =>
  join(string(1, name), message(2, message(1, join(number(1, 1), message(2, shape(dims))))));

export function tinyDetectionOnnx(rows = [0.1, 0.2, 0.3, 0.4, 0.9, 0]) {
  const values = new Float32Array(rows);
  const tensor = join(
    number(1, 1),
    number(1, 1),
    number(1, 6),
    number(2, 1),
    message(9, new Uint8Array(values.buffer)),
  );
  const attribute = join(string(1, 'value'), message(5, tensor), number(20, 4));
  const node = join(string(2, 'detections'), string(4, 'Constant'), message(5, attribute));
  const graph = join(
    message(1, node),
    string(2, 'tiny-detection'),
    message(11, valueInfo('images', [1, 3, 2, 2])),
    message(12, valueInfo('detections', [1, 1, 6])),
  );

  return join(number(1, 8), message(7, graph), message(8, number(2, 13)));
}

const constant = (output: string, values: number[]) => {
  const data = new Float32Array(values);
  const tensor = join(number(1, 1), number(1, 1), number(1, 6), number(2, 1), message(9, new Uint8Array(data.buffer)));
  const attribute = join(string(1, 'value'), message(5, tensor), number(20, 4));

  return message(1, join(string(2, output), string(4, 'Constant'), message(5, attribute)));
};

export function inputSensitiveDetectionOnnx() {
  const keepdims = join(string(1, 'keepdims'), number(3, 0), number(20, 2));
  const mean = message(
    1,
    join(string(1, 'images'), string(2, 'brightness'), string(4, 'ReduceMean'), message(5, keepdims)),
  );
  const multiply = message(1, join(string(1, 'brightness'), string(1, 'scale'), string(2, 'delta'), string(4, 'Mul')));
  const add = message(1, join(string(1, 'base'), string(1, 'delta'), string(2, 'detections'), string(4, 'Add')));
  const graph = join(
    constant('base', [0.1, 0.2, 0.3, 0.4, 0.2, 0]),
    constant('scale', [0, 0, 0, 0, 0.8, 0]),
    mean,
    multiply,
    add,
    string(2, 'image-dependent-detection'),
    message(11, valueInfo('images', [1, 3, 2, 2])),
    message(12, valueInfo('detections', [1, 1, 6])),
  );

  return join(number(1, 8), message(7, graph), message(8, number(2, 13)));
}
