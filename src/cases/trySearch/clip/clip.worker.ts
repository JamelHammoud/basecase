import { serve } from '../../../utils/workerRpc';
import { clipHandlers } from './clipHandlers';

serve(clipHandlers);
