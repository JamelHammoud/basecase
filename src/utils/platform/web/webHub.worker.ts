import { serve } from '../../workerRpc';
import { WEB_HUB_HANDLERS } from './webHubJob';

serve(WEB_HUB_HANDLERS);
