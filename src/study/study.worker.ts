import { serve } from '../utils/workerRpc';
import { createStudyHandlers } from './studyHandlers';

serve(createStudyHandlers());
