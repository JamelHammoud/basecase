import { serve } from '../utils/workerRpc';
import { mapJobs } from './mapJobs';

serve(mapJobs());
