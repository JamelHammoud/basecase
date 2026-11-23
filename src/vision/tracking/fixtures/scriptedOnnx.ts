import { join, message, number, string, valueInfo } from '../../onnxFixture';
import { boxOf, type ScriptedFrame, type Workflow } from './scripts';
import type { VisionPixels } from '../../types';

export const SCRIPTED_SLOTS = 4;

const CHANNELS = 12;
const FLOAT = 1;
const INT64 = 7;

const channel = (slot: number, field: 0 | 1 | 2) => slot * 3 + field;

function constant(name: string, dims: number[], type: number, data: Uint8Array) {
  const tensor = join(...dims.map((dim) => number(1, dim)), number(2, type), message(9, data));
  const attribute = join(string(1, 'value'), message(5, tensor), number(20, 4));

  return message(1, join(string(2, name), string(4, 'Constant'), message(5, attribute)));
}

const floats = (values: number[]) => new Uint8Array(new Float32Array(values).buffer);
const longs = (values: number[]) => new Uint8Array(new BigInt64Array(values.map(BigInt)).buffer);

const operation = (type: string, inputs: string[], output: string) =>
  message(1, join(...inputs.map((input) => string(1, input)), string(2, output), string(4, type)));

export function scriptedDetectionOnnx(workflow: Workflow) {
  const objects = workflow.objects;

  if (objects.length > SCRIPTED_SLOTS) throw new Error('The scripted detector reads up to four objects.');

  const rows = SCRIPTED_SLOTS;
  const width = rows * 6;
  const weights = new Array<number>(CHANNELS * width).fill(0);
  const bias = new Array<number>(width).fill(0);
  const weigh = (from: number, to: number) => {
    weights[from * width + to] = 1;
  };

  for (let slot = 0; slot < rows; slot++) {
    const object = objects[slot];
    const [w, h] = object?.size ?? [0.1, 0.1];

    weigh(channel(slot, 0), slot * 6);
    weigh(channel(slot, 1), slot * 6 + 1);
    weigh(channel(slot, 2), slot * 6 + 4);
    bias[slot * 6] = -w / 2;
    bias[slot * 6 + 1] = -h / 2;
    bias[slot * 6 + 2] = w;
    bias[slot * 6 + 3] = h;
    bias[slot * 6 + 5] = Math.max(0, workflow.classes.indexOf(object?.label ?? ''));
  }

  const graph = join(
    constant('flat_shape', [2], INT64, longs([1, CHANNELS])),
    constant('weights', [CHANNELS, width], FLOAT, floats(weights)),
    constant('bias', [1, width], FLOAT, floats(bias)),
    constant('row_shape', [3], INT64, longs([1, rows, 6])),
    operation('Reshape', ['images', 'flat_shape'], 'flat'),
    operation('MatMul', ['flat', 'weights'], 'mixed'),
    operation('Add', ['mixed', 'bias'], 'wide'),
    operation('Reshape', ['wide', 'row_shape'], 'detections'),
    string(2, 'scripted-detection'),
    message(11, valueInfo('images', [1, 3, 2, 2])),
    message(12, valueInfo('detections', [1, rows, 6])),
  );

  return join(number(1, 8), message(7, graph), message(8, number(2, 13)));
}

export function scriptedPixels(workflow: Workflow, frame: ScriptedFrame): VisionPixels {
  const data = new Uint8ClampedArray(16);

  for (let pixel = 0; pixel < 4; pixel++) data[pixel * 4 + 3] = 255;

  const put = (index: number, value: number) => {
    data[(index % 4) * 4 + Math.floor(index / 4)] = Math.round(Math.min(1, Math.max(0, value)) * 255);
  };

  for (let slot = 0; slot < SCRIPTED_SLOTS; slot++) {
    const object = workflow.objects[slot];
    const seen = frame.objects[slot];

    if (!object || !seen) continue;

    const box = boxOf(object, seen.centre);

    put(channel(slot, 0), box[0] + box[2] / 2);
    put(channel(slot, 1), box[1] + box[3] / 2);
    put(channel(slot, 2), seen.present ? 1 : 0);
  }

  return { width: 2, height: 2, data };
}
