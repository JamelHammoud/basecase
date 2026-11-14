import { claudeDriver } from './claudeDriver.mjs';
import { PERSONA_SYSTEM, personaPrompt } from './prompt.mjs';
import fs from 'node:fs';
import { createSession } from './session.mjs';

export async function runPersona({ screen, goals, minutes, driver = claudeDriver, devicePixelRatio }) {
  const session = createSession({ screen, minutes, devicePixelRatio: devicePixelRatio ?? process.env.PERSONA_DPR });

  const trace = process.env.PERSONA_TRACE;

  if (trace) traced(session, trace);

  await driver({ session, system: PERSONA_SYSTEM, prompt: personaPrompt(goals, minutes) });

  return { findings: session.findings.map((f) => ({ ...f })) };
}

function traced(session, file) {
  const started = Date.now();

  for (const [name, handler] of Object.entries(session.handlers)) {
    session.handlers[name] = (args) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(0);

      fs.appendFileSync(file, `${seconds}s ${name} ${JSON.stringify(args ?? {})}\n`);

      return handler(args);
    };
  }
}
