import { serve } from '../utils/workerRpc';
import { versionHandlers } from './versionOperations';

serve(versionHandlers);
