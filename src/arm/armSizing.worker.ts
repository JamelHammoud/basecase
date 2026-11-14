/// <reference lib="webworker" />
import { armSizingHandlers } from './armSizingOps';
import { serve } from '../utils/workerRpc';

serve(armSizingHandlers);
