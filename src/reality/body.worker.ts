/// <reference lib="webworker" />
import { serve } from '../utils/workerRpc';
import { bodyWorkerHandlers } from './bodyWorkerHandlers';

serve(bodyWorkerHandlers);
