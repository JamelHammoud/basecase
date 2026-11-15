import type { VisionModelFile } from './manifest';

const owner = 'diffusionstudio';
const repo = 'sam2.1-small-video-onnx-fp16';
const revision = '927ecec6e6ae2727d0af7720eefdb07f2efe4689';

const graph = (name: string, bytes: number, sha256: string): VisionModelFile => ({
  owner,
  repo,
  revision,
  file: `onnx/${name}.onnx`,
  bytes,
  sha256,
});

export const SEGMENTATION_MODELS = {
  vision_encoder: graph('vision_encoder', 83679474, 'fb570036f5afac59ef20848958b075c84da746e333efd863104d94604652efc4'),
  mask_decoder: graph('mask_decoder', 8910345, '999b3b47bf2e924d522ed6cc011fa2c9b651754cc07895eb0da16a28a5ce7c4d'),
  memory_encoder: graph('memory_encoder', 2807884, 'f36324e383dbf21fcd549169aedf698db00c307fd9a49538c0e5f0aa168e4f99'),
  memory_attention: graph(
    'memory_attention',
    16175204,
    '6666be8ca502b5c16e9a113d3d3934996d32f27e93bee5e66a8317fcceec9985',
  ),
  pointer_tpos: graph('pointer_tpos', 34228, 'f9c1b36e0aa9dc6b7c05b02a8fdaa17cc671d967ffcacc14fcd3177e65ec25e9'),
};

export type SegmentationGraph = keyof typeof SEGMENTATION_MODELS;
