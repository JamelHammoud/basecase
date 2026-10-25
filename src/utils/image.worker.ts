/// <reference lib="webworker" />
import { imageHandlers } from './imageOps';
import { serve } from './workerRpc';

serve(imageHandlers);
