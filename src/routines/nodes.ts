import type { DataType } from './schema';

export type NodeInput = DataType | 'audio';
export type NodeTier = 'perception' | 'remote' | 'case';
export type Device = 'mac' | 'pi5' | 'browser' | 'cloud';

export interface ModelNode {
  id: string;
  label: string;
  inputs: NodeInput[];
  outputs: DataType[];
  tier: NodeTier;
  runsOn: Device[];
  model: string;
  licence: string;
  source: string;
  measuredMs: Partial<Record<Device, number>>;
}

export const SENSOR_FACTS: Record<string, { type: NodeInput; capability: string }> = {
  camera: { type: 'image', capability: 'camera' },
  microphone: { type: 'audio', capability: 'microphone' },
  depth: { type: 'image', capability: 'depth' },
};

const FACT_NAMES: Record<string, string> = {
  'person-detection': 'person',
  'object-detection': 'objects',
  'obstacle-near': 'obstacle',
  'face-detection': 'faces',
  'face-embedding': 'facePrint',
  'face-recognition': 'recognize',
  'wake-word': 'wakeWord',
  'speech-in': 'heard',
  'speech-in-small': 'heard',
  'vision-llm': 'answer',
  'cloud-llm': 'answer',
};

export const factNameOf = (model: string): string => FACT_NAMES[model] ?? model;

export const MODEL_NODES: readonly ModelNode[] = [
  {
    id: 'person-detection',
    label: 'See Person',
    inputs: ['image'],
    outputs: ['boolean', 'detections'],
    tier: 'perception',
    runsOn: ['mac', 'pi5', 'browser'],
    model: 'YOLO11n',
    licence: 'AGPL-3.0',
    source: 'https://github.com/ultralytics/ultralytics',
    measuredMs: {},
  },
  {
    id: 'object-detection',
    label: 'See Objects',
    inputs: ['image'],
    outputs: ['detections', 'boolean'],
    tier: 'perception',
    runsOn: ['mac', 'pi5', 'browser'],
    model: 'RF-DETR Nano',
    licence: 'Apache-2.0',
    source: 'https://github.com/roboflow/rf-detr',
    measuredMs: {},
  },
  {
    id: 'obstacle-near',
    label: 'Obstacle Ahead',
    inputs: ['image'],
    outputs: ['boolean', 'number'],
    tier: 'perception',
    runsOn: ['mac', 'pi5', 'browser'],
    model: 'Depth Anything V2 Small',
    licence: 'Apache-2.0',
    source: 'https://github.com/DepthAnything/Depth-Anything-V2',
    measuredMs: {},
  },
  {
    id: 'face-detection',
    label: 'Find Faces',
    inputs: ['image'],
    outputs: ['detections', 'boolean'],
    tier: 'perception',
    runsOn: ['mac', 'pi5', 'browser'],
    model: 'YuNet',
    licence: 'MIT',
    source: 'https://github.com/opencv/opencv_zoo',
    measuredMs: {},
  },
  {
    id: 'face-embedding',
    label: 'Face Print',
    inputs: ['image'],
    outputs: ['faceEmbedding'],
    tier: 'perception',
    runsOn: ['mac', 'pi5'],
    model: 'InsightFace buffalo_l (SCRFD-10G + ArcFace R50)',
    licence: 'MIT code, non-commercial research weights',
    source: 'https://github.com/deepinsight/insightface',
    measuredMs: {},
  },
  {
    id: 'face-recognition',
    label: 'Check Face',
    inputs: ['image'],
    outputs: ['identity'],
    tier: 'perception',
    runsOn: ['mac', 'pi5'],
    model: 'InsightFace buffalo_l against the local gallery',
    licence: 'MIT code, non-commercial research weights',
    source: 'https://github.com/deepinsight/insightface',
    measuredMs: {},
  },
  {
    id: 'pose',
    label: 'Body Pose',
    inputs: ['image'],
    outputs: ['pose'],
    tier: 'perception',
    runsOn: ['mac', 'pi5', 'browser'],
    model: 'RTMPose-m',
    licence: 'Apache-2.0',
    source: 'https://github.com/open-mmlab/mmpose',
    measuredMs: {},
  },
  {
    id: 'wake-word',
    label: 'Wake Word',
    inputs: ['audio'],
    outputs: ['boolean'],
    tier: 'perception',
    runsOn: ['mac', 'pi5', 'browser'],
    model: 'openWakeWord',
    licence: 'Apache-2.0 code, CC BY-NC-SA 4.0 bundled models',
    source: 'https://github.com/dscripka/openWakeWord',
    measuredMs: {},
  },
  {
    id: 'speech-in',
    label: 'Hear Speech',
    inputs: ['audio'],
    outputs: ['text'],
    tier: 'perception',
    runsOn: ['mac'],
    model: 'Whisper large-v3-turbo (whisper.cpp)',
    licence: 'MIT',
    source: 'https://github.com/ggml-org/whisper.cpp',
    measuredMs: {},
  },
  {
    id: 'speech-in-small',
    label: 'Hear Speech (Small)',
    inputs: ['audio'],
    outputs: ['text'],
    tier: 'perception',
    runsOn: ['pi5', 'browser'],
    model: 'Moonshine Base',
    licence: 'MIT',
    source: 'https://github.com/usefulsensors/moonshine',
    measuredMs: {},
  },
  {
    id: 'speech-out',
    label: 'Speak',
    inputs: ['text'],
    outputs: [],
    tier: 'perception',
    runsOn: ['mac', 'pi5', 'browser'],
    model: 'Kokoro-82M',
    licence: 'Apache-2.0',
    source: 'https://huggingface.co/hexgrad/Kokoro-82M',
    measuredMs: {},
  },
  {
    id: 'vision-llm',
    label: 'Look and Answer',
    inputs: ['image', 'text'],
    outputs: ['text'],
    tier: 'remote',
    runsOn: ['mac'],
    model: 'Qwen3-VL-4B-Instruct',
    licence: 'Apache-2.0',
    source: 'https://github.com/QwenLM/Qwen3-VL',
    measuredMs: {},
  },
  {
    id: 'cloud-llm',
    label: 'Ask the Agent',
    inputs: ['image', 'text'],
    outputs: ['text'],
    tier: 'remote',
    runsOn: ['cloud'],
    model: 'The model in your agent profile',
    licence: 'Provider terms',
    source: 'Agent settings',
    measuredMs: {},
  },
  {
    id: 'case-fact',
    label: 'Case Fact',
    inputs: [],
    outputs: ['number', 'boolean', 'text'],
    tier: 'case',
    runsOn: ['mac', 'browser'],
    model: 'The Case’s world in the sim',
    licence: 'Basecase',
    source: 'src/cases/caseFacts.ts',
    measuredMs: {},
  },
  {
    id: 'live-input',
    label: 'Live Input',
    inputs: [],
    outputs: ['text', 'number', 'boolean'],
    tier: 'case',
    runsOn: ['mac', 'browser'],
    model: 'A live input’s named events',
    licence: 'Basecase',
    source: 'src/cases/caseLogic.ts',
    measuredMs: {},
  },
];

const BY_ID = new Map(MODEL_NODES.map((node) => [node.id, node]));

export const findNode = (id: string): ModelNode | undefined => BY_ID.get(id);

export const askNodeFor = (input: string | undefined): ModelNode =>
  findNode(input === undefined ? 'cloud-llm' : 'vision-llm') as ModelNode;
