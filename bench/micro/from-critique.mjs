#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { argOption, openStudio } from '../harness.mjs';
import { replayInStudio } from '../replayCore.mjs';
import { messageAt, stepsFromConversation, userMessages } from '../replaySteps.mjs';
import { MICRO_DATA } from './tasks/index.mjs';

const args = process.argv.slice(2);
const chatFile = argOption(args, 'chat', null);
const index = Number(argOption(args, 'message', NaN));

if (!chatFile) {
  console.error(
    'Usage: node bench/micro/from-critique.mjs --chat <conversation.json> --message <index> [--id K5] [--scene <start scene.json>] [--category craft]',
  );
  process.exit(1);
}

const conversation = JSON.parse(fs.readFileSync(path.resolve(chatFile), 'utf8'));

if (!Number.isInteger(index)) {
  for (const m of userMessages(conversation)) console.log(`${String(m.index).padStart(3)}  ${m.text.slice(0, 110)}`);

  process.exit(0);
}

const message = messageAt(conversation, index);

if (message.role !== 'user') {
  console.error(
    `Message ${index} is from the ${message.role}; pick a user message (run without --message to list them).`,
  );
  process.exit(1);
}

const id = argOption(args, 'id', `${conversation.id}-${index}`);
const dir = path.join(argOption(args, 'data', MICRO_DATA), 'stubs', id);
const startFile = argOption(args, 'scene', null);
const steps = stepsFromConversation(conversation, { stopAt: index });
const studio = await openStudio({
  label: 'stub',
  port: Number(argOption(args, 'port', 5198)),
  agent: false,
  log: () => {},
});
const { replayed, scene } = await replayInStudio(studio, steps, {
  startScene: startFile ? JSON.parse(fs.readFileSync(path.resolve(startFile), 'utf8')) : null,
});

await studio.close();
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'start.json'), JSON.stringify(scene));
fs.writeFileSync(
  path.join(dir, 'task.json'),
  JSON.stringify(
    {
      id,
      category: argOption(args, 'category', 'critique'),
      instruction: message.text,
      heldOut: args.includes('--held-out'),
      startScene: 'start.json',
      source: {
        chat: conversation.id,
        title: conversation.title,
        message: index,
        at: message.timestamp,
        replayed,
        steps: steps.length,
      },
      grader: 'TODO: write a code grader and move this task into bench/micro/tasks/',
    },
    null,
    1,
  ),
);
console.log(`Stub ${id}: replayed ${replayed} of ${steps.length} steps → ${dir}`);
process.exit(0);
