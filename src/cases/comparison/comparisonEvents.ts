import type { Recording } from '../../sim/recorder';
import type { ComparisonChannel, ComparisonEvent } from './comparison';
import { channelValue, COMPARISON_LIMITS } from './comparison';

export function comparisonEvents(recording: Recording, channels: readonly ComparisonChannel[]) {
  const events: ComparisonEvent[] = [];

  for (const [i, event] of (recording.inputs ?? []).entries()) {
    if (events.length >= COMPARISON_LIMITS.events) return { events, eventsClipped: true, stateEventsClipped: true };

    events.push({
      id: `input:${i}`,
      name: event.name.slice(0, COMPARISON_LIMITS.text),
      at: event.at,
      clipped: event.name.length > COMPARISON_LIMITS.text,
    });
  }

  for (const channel of channels.filter((candidate) => candidate.kind === 'state')) {
    let previous: string | number | undefined;

    for (let i = 0; i < channel.t.length; i++) {
      const value = channelValue(channel, i);

      if (value === undefined || value === previous) continue;

      if (events.length >= COMPARISON_LIMITS.events) return { events, eventsClipped: true, stateEventsClipped: true };

      const text = String(value);

      events.push({
        id: `${channel.id}:${i}`,
        name: `${channel.id}: ${text.slice(0, COMPARISON_LIMITS.text)}`,
        at: channel.t[i],
        signal: channel.id,
        value: text.slice(0, COMPARISON_LIMITS.text),
        clipped: text.length > COMPARISON_LIMITS.text,
      });
      previous = value;
    }
  }

  for (const [i, command] of (recording.commands ?? []).entries()) {
    if (events.length >= COMPARISON_LIMITS.events) return { events, eventsClipped: true, stateEventsClipped: false };

    events.push({ id: `command:${i}`, name: `Command ${i + 1}`, at: command.at });
  }

  return { events, eventsClipped: false, stateEventsClipped: false };
}
