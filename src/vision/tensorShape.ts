import type { VisionTensor } from './types';

const MAX_TENSOR_VALUES = 16777216;

export function tensorShape(tensor: VisionTensor | undefined, rank: number) {
  if (!tensor) throw new Error('The vision model returned unsupported tensors.');

  const dims = tensor.dims.length === rank + 1 && tensor.dims[0] === 1 ? tensor.dims.slice(1) : tensor.dims;
  const count = dims.reduce((size, dimension) => size * dimension, 1);

  if (
    dims.length !== rank ||
    !dims.every((dimension) => Number.isInteger(dimension) && dimension >= 0) ||
    !Number.isSafeInteger(count) ||
    count > MAX_TENSOR_VALUES ||
    count !== tensor.data.length
  )
    throw new Error('The vision model returned unsupported tensors.');

  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(Number(tensor.data[i]))) throw new Error('The vision model returned unsupported tensors.');
  }

  return { dims, tensor };
}
