import type { CheckContext, CheckRow } from '../utils/engineeringTypes';
import { errorMessage } from '../utils/errorMessage';
import { validateFingerAssembly } from './validation';

export function fingerRows(context: CheckContext): CheckRow[] {
  if (!context.parts.some((part) => part.gripperFinger)) return [];

  try {
    validateFingerAssembly(context.parts, context.joints);

    return [{ check: 'Finger mounts', status: 'pass', detail: 'M3 × 16 screws' }];
  } catch (error) {
    return [
      {
        check: 'Finger mounts',
        status: 'fail',
        detail: errorMessage(error),
        ids: context.parts.filter((part) => part.gripperFinger?.role === 'finger').map((part) => part.id),
      },
    ];
  }
}
