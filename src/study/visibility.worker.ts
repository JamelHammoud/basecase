import { serve } from '../utils/workerRpc';
import { createVisibilityHandlers } from './visibilityHandlers';

serve(createVisibilityHandlers());
