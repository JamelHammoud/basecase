/// <reference lib="webworker" />
import { armSizingHandlers } from './armSizingOps';
import { serve } from './workerRpc';

serve(armSizingHandlers);
