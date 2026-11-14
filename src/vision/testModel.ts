import { VISION_MODELS, type VisionModelManifest } from './manifest';

const MODEL =
  'CAg6lAIKPAoGaW1hZ2VzEgRtZWFuIgpSZWR1Y2VNZWFuKg8KBGF4ZXNAAUACQAOgAQcqDwoIa2VlcGRpbXMYAKABAgodCgRtZWFuCgVzaGFwZRIFc2NvcmUiB1Jlc2hhcGUKLAoFYm94ZXMKBXNjb3JlEgdvdXRwdXQwIgZDb25jYXQqCwoEYXhpcxgBoAECEhFjYW1lcmEtYnJpZ2h0bmVzcyoQCAMQBzoDAQEBQgVzaGFwZSohCAEIBAgBEAEiEAAAgD8AAIA/AACAPwAAgD9CBWJveGVzWiAKBmltYWdlcxIWChQIARIQCgIIAQoCCAMKAggCCgIIAmIdCgdvdXRwdXQwEhIKEAgBEgwKAggBCgIIBQoCCAFCBAoAEA0=';

export const testVisionModel = (): Uint8Array => Uint8Array.from(atob(MODEL), (character) => character.charCodeAt(0));

export const TEST_VISION_MANIFEST: VisionModelManifest = {
  ...VISION_MODELS[0],
  id: 'camera-brightness-test',
  sha256: 'e7297996c25a0898a538604749de5309e6b0a870a6ee51db7d6b7055acb726b0',
  name: 'Camera brightness test',
  classes: ['person'],
  inputSize: [2, 2],
  maxBytes: testVisionModel().byteLength,
};
