import { serve } from '../utils/workerRpc';
import { prelabelsJobs } from './prelabelsJobs';

serve(prelabelsJobs);
