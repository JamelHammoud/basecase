import { serve } from '../utils/workerRpc';
import { frameCameraJobs } from './frameCameraJobs';

serve(frameCameraJobs);
