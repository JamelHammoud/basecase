import { liveCameraFeeds } from '../../../cameras/liveFeed';
import { loadVisionBytes, visionCameras, visionError } from '../../../vision/client';
import { visionResults } from '../../../vision/resultStore';
import { TEST_VISION_MANIFEST, testVisionModel } from '../../../vision/testModel';
import { DEFAULT_VISION_MODEL } from '../../../vision/useCameraVision';

export default function visionStudio() {
  return {
    visionTestModel: (label = 'person') => {
      const bytes = testVisionModel();

      return loadVisionBytes(
        { ...TEST_VISION_MANIFEST, id: DEFAULT_VISION_MODEL, classes: [label] },
        bytes.buffer as ArrayBuffer,
      );
    },
    visionState: () => ({
      feeds: liveCameraFeeds(),
      cameras: visionCameras(),
      results: visionResults(),
      error: visionError(),
    }),
  };
}
