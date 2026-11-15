import { z } from 'zod';
import { bridge, fail, text } from './shared.mjs';

export const fitBody = {
  name: 'fit_body',
  config: {
    title: 'Fit body',
    description:
      'Fits link masses, terminal payload and floor friction from the robot’s latest Operate run using the active servo calibrations. ' +
      'Activates a body calibration only when held-out motion improves. Replies with preset and fitted replay errors or Can’t tell.',
    inputSchema: {
      robot: z
        .string()
        .min(1)
        .max(100)
        .regex(/^[\w -]+$/)
        .optional()
        .describe('Robot key or name from get_rig'),
    },
  },
  handler: async (args) => {
    try {
      const payload = z.object(fitBody.config.inputSchema).strict().parse(args);
      const result = await bridge('fit_body', payload, 600000);

      return text(result?.text ?? result);
    } catch (error) {
      return fail(error);
    }
  },
};
