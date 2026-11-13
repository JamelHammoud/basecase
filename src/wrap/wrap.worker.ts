/// <reference lib="webworker" />
import { serve } from '../utils/workerRpc';
import { wrapHandlers } from './wrapOps';

serve(wrapHandlers);
