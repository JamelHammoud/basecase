export interface MotionRecording {
  version: 1;
  recommendation: string;
  sourceKey: string;
  connection: string;
  revision: number;
  completion: 'completed' | 'cancelled' | 'stale' | 'fault' | 'disconnect';
  backend: 'servo-independent-1';
}

export function checkedMotionRecording(value: unknown): MotionRecording | null;
export function recordedMotionMatches(text: string, expected: MotionRecording): boolean;
export function motionRecordingDeclaration(
  value: unknown,
): Pick<MotionRecording, 'recommendation' | 'sourceKey'> | null;
