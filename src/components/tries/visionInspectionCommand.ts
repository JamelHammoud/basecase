export const VISION_INSPECTION_EVENT = 'vision-inspection-request';
export interface VisionInspectionRequest {
  id: string;
  context: string;
}

export function requestVisionInspection(request: VisionInspectionRequest) {
  window.dispatchEvent(new CustomEvent(VISION_INSPECTION_EVENT, { detail: request }));
}
