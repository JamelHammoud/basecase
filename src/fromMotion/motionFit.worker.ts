/// <reference lib="webworker" />
import { motionFitHandlers } from './motionFitOps';
import { serve } from '../utils/workerRpc';

serve(motionFitHandlers);
