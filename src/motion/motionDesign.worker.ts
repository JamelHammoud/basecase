/// <reference lib="webworker" />
import { motionDesignHandlers } from './motionDesignOps';
import { serve } from '../utils/workerRpc';

serve(motionDesignHandlers);
