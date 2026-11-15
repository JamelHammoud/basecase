import { serve } from '../utils/workerRpc';
import { repairHandlers } from './repairOps';

serve(repairHandlers);
