/// <reference lib="webworker" />
import { serve } from '../utils/workerRpc';
import { geometryHandlers } from './geometryOps';

serve(geometryHandlers);
