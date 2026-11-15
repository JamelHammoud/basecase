import { serve } from '../../utils/workerRpc';
import { evaluationJobs } from './evaluationJobs';

serve(evaluationJobs);
