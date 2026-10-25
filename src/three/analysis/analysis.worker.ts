/// <reference lib="webworker" />
import { serve } from '../../utils/workerRpc';
import { analysisHandlers } from './analysisOps';

serve(analysisHandlers);
