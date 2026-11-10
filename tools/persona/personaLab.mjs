import { claudeDriver } from './claudeDriver.mjs';
import { PERSONA_SYSTEM, personaPrompt } from './prompt.mjs';
import { createSession } from './session.mjs';

export async function runPersona({ screen, goals, minutes, driver = claudeDriver, devicePixelRatio }) {
  const session = createSession({ screen, minutes, devicePixelRatio: devicePixelRatio ?? process.env.PERSONA_DPR });

  await driver({ session, system: PERSONA_SYSTEM, prompt: personaPrompt(goals, minutes) });

  return { findings: session.findings.map((f) => ({ ...f })) };
}
