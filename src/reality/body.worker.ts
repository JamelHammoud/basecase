/// <reference lib="webworker" />
import { reply, serve } from '../utils/workerRpc';
import { fitBody } from './fitBody';
import type { BodyFitRequest } from './bodyClient';

serve({ fit: async (request: BodyFitRequest) => reply(await fitBody(request)) });
