/// <reference lib="webworker" />
import { serve } from '../../utils/workerRpc';
import { usdzHandlers } from './usdzOps';

serve(usdzHandlers);
