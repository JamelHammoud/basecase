import { serve } from '../utils/workerRpc';
import { motionSkeletonHandlers } from './motionSkeletonOps';

serve(motionSkeletonHandlers);
