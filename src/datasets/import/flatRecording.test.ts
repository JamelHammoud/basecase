import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSOLE } from '../../cases/console/layout';
import { messageAt } from '../../topics/messageTree';
import { recordingTopics } from '../../topics/recordingTopics';
import { recordingConsole } from '../../topics/topicConsole';
import { flatRecording } from './flatRecordingFixtures';
import { readSource } from './readSource';

describe('FlatBuffers on the existing recording timeline', () => {
  it('imports mixed ROS, JSON and two reflection roots with exact fields and repeatable identity', async () => {
    const bytes = await flatRecording();
    const source = { kind: 'bytes' as const, name: 'flat.mcap', files: { 'flat.mcap': bytes } };
    const first = (await readSource(source))!;
    const again = (await readSource(source))!;
    const index = recordingTopics(first.data.episodes[0])!;

    expect(again.hash).toBe(first.hash);
    expect(again.data.episodes[0].topics).toEqual(first.data.episodes[0].topics);
    expect(first.data.episodes).toHaveLength(1);
    expect(first.data.names).toEqual(['arm0', 'arm1', 'arm2']);
    expect(index.topics.map((t) => t.topic)).toEqual(['/joint_states', '/json', '/nested', '/telemetry']);
    expect(index.series('topic./telemetry.volts')).toEqual({ t: [0, 1, 2], v: [12.5, 11.5, 10.5] });
    expect(index.series('topic./json.temperature')).toEqual({ t: [1], v: [31.5] });
    expect(index.labels('topic./telemetry.mode')?.v).toEqual(['Idle', 'Moving', 'Idle']);
    expect(messageAt(index.topic('topic./nested')!, 0)).toEqual({ name: 'another root' });
    expect(messageAt(index.topic('topic./telemetry')!, 2)).toMatchObject({
      nested: { name: 'wrist-2' },
      unsigned: '18446744073709551615',
      points: [
        { x: 2, y: 2.5 },
        { x: 3, y: 3.5 },
      ],
    });

    const panels = recordingConsole(DEFAULT_CONSOLE, index).panels;

    expect(panels).toContainEqual({ id: 'states', kind: 'states', signal: 'topic./telemetry.mode' });
    expect(panels).toContainEqual({ id: 'plot', kind: 'plot', signals: ['topic./telemetry.volts'] });
    expect(panels).toContainEqual({ id: 'message', kind: 'message', topic: 'topic./telemetry' });
  });
});
