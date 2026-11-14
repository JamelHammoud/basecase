import { serve } from '../utils/workerRpc';
import { modelCacheHandlers } from './modelCache';

serve(modelCacheHandlers);
