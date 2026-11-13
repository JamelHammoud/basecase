/// <reference lib="webworker" />
import { linkageHandlers } from './linkageOps';
import { serve } from '../utils/workerRpc';

serve(linkageHandlers);
