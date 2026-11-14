import { CODE_PANEL_TOKENS } from '../../design-system/codeTokens';
import { WORLD_CALLS_PER_SECOND } from '../worldSet';
import { REPORT_LIMITS } from './codeBridge';
import { STORE_CALLS_PER_SECOND, STORE_MAX_BYTES } from './codeStore';
import { HELLO_MS, MAX_NAMES, MESSAGES_PER_SECOND, SIGNAL_INTERVAL_MS, SILENT_MS } from './codeProtocol';
import { MAX_SUBSCRIPTIONS } from './codeSignals';
import { FRAME_FPS, FRAME_WIDTH, MAX_STREAMS } from './codeStreams';
import { MAX_CODE_PANELS } from './format';
import { CASE_ACTIONS, CODE_SOURCE_MAX_BYTES } from './panelKinds';
import { GOAL_FIELDS, INPUT_AXES, JOINT_FIELDS, ROBOT_FIELDS } from './signalNames';

const or = (list: readonly string[]) => list.join(' | ');

export function codeBridgeReference(): string {
  const perSecond = 1000 / SIGNAL_INTERVAL_MS;

  return [
    '## Code panel reference',
    `A code panel is one HTML document, script and style inline, at most ${CODE_SOURCE_MAX_BYTES / 1024} KB, at most ${MAX_CODE_PANELS} per Case. It runs in a sandboxed frame with no network, storage, parent page or navigation; window.basecase is its only way out.`,
    `- basecase.signals(names, (values, time) => …) → unsubscribe. names: one name or up to ${MAX_NAMES}, * for one segment. Calls back with { name: number | string[] } at most ${perSecond} times a second, at most ${MAX_SUBSCRIPTIONS} subscriptions.`,
    `  Signals: time; joint.<id>.${or(JOINT_FIELDS)} (degrees or mm, effort in N·m); robot.${or(ROBOT_FIELDS)}; probe.<name>; input.<source>.${or(INPUT_AXES)}; goal.${or(GOAL_FIELDS)} (failed is a list); the console’s own signals.`,
    '- basecase.drive({ v: [forward, left, turn], aux?: [lift, grip], target?: [x, y, z] }) drives the robot: v and aux each −1 to 1; target is a point for an arm’s hand in scene mm, y up. drive(null) lets go. Needs code in the console’s input.',
    '- basecase.event(name, value = true) sends a named event to the Case’s logic: name a plain word, value a boolean, a number or up to 200 characters.',
    `- basecase.action(name) → Promise<{ ok, problem? }>. name: ${or(CASE_ACTIONS)}; refused when it can’t run now.`,
    `- basecase.world.set(name, { pose?: { position?: [x, y, z], rotation?: [x, y, z] }, visible?, color? }) moves, shows, hides or recolors a world object the Case marks movable: position in the Case’s scene mm, y up, as drive’s target, not create_case’s z-up frame; rotation in degrees, color #rrggbb. At most ${WORLD_CALLS_PER_SECOND} calls a second; the try records each change.`,
    `- basecase.frames(camera, { width?, fps? }, (bitmap) => …) → stop. Sends a camera view as ImageBitmaps: width ${FRAME_WIDTH.min} to ${FRAME_WIDTH.max} px (default ${FRAME_WIDTH.initial}), height three quarters of it, fps ${FRAME_FPS.min} to ${FRAME_FPS.max} (default ${FRAME_FPS.initial}), at most ${MAX_STREAMS} streams.`,
    `- basecase.store.get() → Promise<value | null> and basecase.store.set(value) → Promise<{ ok, problem? }> keep one JSON value for the Case on this computer, such as a high score: at most ${STORE_MAX_BYTES / 1024} KB, kept through reloads and Reset, never in the Case file or a shared link. set(null) clears it. At most ${STORE_CALLS_PER_SECOND} store calls a second.`,
    `- CSS variables: ${Object.keys(CODE_PANEL_TOKENS).join(', ')}. The body starts transparent in the studio’s font, size and ink.`,
    `- The studio keeps the first ${REPORT_LIMITS.errors} uncaught errors with their lines, the first ${REPORT_LIMITS.logs} console lines and the calls it refused. More than ${MESSAGES_PER_SECOND} messages a second are dropped. A panel that throws while it loads, says nothing for ${HELLO_MS / 1000} s or stops answering for ${SILENT_MS / 1000} s is unloaded.`,
    '- Esc and ⌘K reach the studio; every other key stays in the panel while it has focus.',
  ].join('\n');
}
