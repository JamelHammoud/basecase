import { serve } from '../utils/workerRpc';
import { buildRepairHandlers } from './buildRepairOps';

serve(buildRepairHandlers);
