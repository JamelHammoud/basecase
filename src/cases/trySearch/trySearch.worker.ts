import { serve } from '../../utils/workerRpc';
import { trySearchJobs } from './trySearchJobs';

serve(trySearchJobs());
