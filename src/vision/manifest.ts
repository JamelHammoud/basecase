export type VisionKind = 'detect' | 'segment' | 'keypoints' | 'classify' | 'depth';
export type VisionAdapter = 'yolo' | 'rfdetr' | 'depth' | 'yunet' | 'classification';

export interface VisionModelManifest {
  id: string;
  name: string;
  kind: VisionKind;
  owner: string;
  repo: string;
  revision: string;
  path: string;
  sha256: string;
  maxBytes: number;
  inputSize: [number, number];
  classes: readonly string[];
  adapter: VisionAdapter;
  normalization: 'unit' | 'imagenet' | 'bgr';
  resize: 'letterbox' | 'stretch';
  inputName?: string;
  depthUnits?: 'meters' | 'relative';
}

export const COCO_CLASSES = [
  'person',
  'bicycle',
  'car',
  'motorcycle',
  'airplane',
  'bus',
  'train',
  'truck',
  'boat',
  'traffic light',
  'fire hydrant',
  'stop sign',
  'parking meter',
  'bench',
  'bird',
  'cat',
  'dog',
  'horse',
  'sheep',
  'cow',
  'elephant',
  'bear',
  'zebra',
  'giraffe',
  'backpack',
  'umbrella',
  'handbag',
  'tie',
  'suitcase',
  'frisbee',
  'skis',
  'snowboard',
  'sports ball',
  'kite',
  'baseball bat',
  'baseball glove',
  'skateboard',
  'surfboard',
  'tennis racket',
  'bottle',
  'wine glass',
  'cup',
  'fork',
  'knife',
  'spoon',
  'bowl',
  'banana',
  'apple',
  'sandwich',
  'orange',
  'broccoli',
  'carrot',
  'hot dog',
  'pizza',
  'donut',
  'cake',
  'chair',
  'couch',
  'potted plant',
  'bed',
  'dining table',
  'toilet',
  'tv',
  'laptop',
  'mouse',
  'remote',
  'keyboard',
  'cell phone',
  'microwave',
  'oven',
  'toaster',
  'sink',
  'refrigerator',
  'book',
  'clock',
  'vase',
  'scissors',
  'teddy bear',
  'hair drier',
  'toothbrush',
] as const;

const COCO_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 27, 28, 31, 32, 33, 34, 35, 36,
  37, 38, 39, 40, 41, 42, 43, 44, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 67,
  70, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 84, 85, 86, 87, 88, 89, 90,
];
const DETR_CLASSES = Array.from({ length: 91 }, (_, id) => COCO_CLASSES[COCO_IDS.indexOf(id)] ?? '');

export const VISION_MODELS: readonly VisionModelManifest[] = [
  {
    id: 'person-detection',
    name: 'YOLO11n',
    kind: 'detect',
    owner: 'webnn',
    repo: 'yolo11n',
    revision: '9c5acfdd74aaff2d0f47c51b878506361039a51f',
    path: 'onnx/yolo11n.onnx',
    sha256: '7d8fd1717d9d5bbab6986cd134afb620649c7a394303d55b1e09fc00804cc5c1',
    maxBytes: 10720228,
    inputSize: [640, 640],
    classes: COCO_CLASSES,
    adapter: 'yolo',
    normalization: 'unit',
    resize: 'letterbox',
  },
  {
    id: 'object-detection',
    name: 'RF-DETR Nano',
    kind: 'detect',
    owner: 'PierreMarieCurie',
    repo: 'rf-detr-onnx',
    revision: '94f91976449c187be38e649863e3dadecc312437',
    path: 'rf-detr-nano.onnx',
    sha256: '3fcbba0f68bad4939fdf1c38f432783b95691e2869af3be369780aa5be67abb2',
    maxBytes: 107816789,
    inputSize: [384, 384],
    classes: DETR_CLASSES,
    adapter: 'rfdetr',
    normalization: 'imagenet',
    resize: 'stretch',
  },
  {
    id: 'obstacle-near',
    name: 'Depth Anything V2 Small',
    kind: 'depth',
    owner: 'kornia',
    repo: 'depth-anything',
    revision: '86f40563e7e87a0839be758988aa804930409a61',
    path: 'depth-anything-v2-metric-small-indoor.onnx',
    sha256: '50dbcac7a6d667e365a3ceffdf51cc497aa5e06b6d2c1d5824c252640fbf5bf3',
    maxBytes: 99774771,
    inputSize: [392, 392],
    depthUnits: 'meters',
    classes: [],
    adapter: 'depth',
    normalization: 'imagenet',
    resize: 'stretch',
  },
  {
    id: 'face-detection',
    name: 'YuNet',
    kind: 'detect',
    owner: 'opencv',
    repo: 'face_detection_yunet',
    revision: '3cc26e7f1014a5ee5d74a42acee58bafc9d0a310',
    path: 'face_detection_yunet_2023mar.onnx',
    sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    maxBytes: 232589,
    inputSize: [640, 640],
    classes: ['face'],
    adapter: 'yunet',
    normalization: 'bgr',
    resize: 'letterbox',
  },
];

export const visionModel = (id: string): VisionModelManifest | undefined =>
  VISION_MODELS.find((model) => model.id === id);
