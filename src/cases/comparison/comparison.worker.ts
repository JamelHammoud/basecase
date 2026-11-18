import { serve } from '../../utils/workerRpc';
import { comparisonJobs } from './comparisonJobs';

serve(comparisonJobs());
