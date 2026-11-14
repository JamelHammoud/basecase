import { MAX_PANELS, type CaseConsole } from '../cases/console/format';
import type { PanelSpec } from '../cases/console/panelKinds';
import { isDiagnosticTopic } from './diagnostics';
import { isLogTopic } from './logs';
import { IMAGE_SCHEMAS, IMU_SCHEMAS, isSchema, ODOMETRY_SCHEMAS, STATE_SCHEMAS } from './schemas';
import { topicRef, type TopicIndex } from './topicIndex';
import type { RecordedTopic } from './topicLog';

export const RECORDING_AREA_SIZE = 360;

const STATE_PANELS = 2;

const ofSchema = (index: TopicIndex, schemas: ReadonlySet<string>) =>
  index.topics.filter((t) => isSchema(schemas, t.schema));

const isPlain = (topic: RecordedTopic) =>
  !isLogTopic(topic) && !isDiagnosticTopic(topic) && !isSchema(IMAGE_SCHEMAS, topic.schema);

function recordingPanels(index: TopicIndex): PanelSpec[] {
  const states = ofSchema(index, STATE_SCHEMAS).slice(0, STATE_PANELS);
  const [imu] = ofSchema(index, IMU_SCHEMAS);
  const [odometry] = ofSchema(index, ODOMETRY_SCHEMAS);
  const used = new Set([...states, imu, odometry]);
  const message = index.topics.find((t) => isPlain(t) && !used.has(t));
  const panels: PanelSpec[] = [];

  if (index.topics.some(isLogTopic)) panels.push({ id: 'log', kind: 'log' });

  if (index.topics.some(isDiagnosticTopic)) panels.push({ id: 'diagnostics', kind: 'diagnostics' });

  for (const t of states) panels.push({ id: 'states', kind: 'states', signal: topicRef(t.topic, 'data') });

  if (imu) panels.push({ id: 'imu', kind: 'plot', signals: [topicRef(imu.topic, 'angular_velocity.*')] });

  if (odometry) {
    const position = (axis: string) => topicRef(odometry.topic, `pose.pose.position.${axis}`);

    panels.push({ id: 'odometry', kind: 'plot', signals: [position('y')], x: position('x') });
  }

  if (message) panels.push({ id: 'message', kind: 'message', topic: topicRef(message.topic) });

  return panels;
}

function freshIds(panels: PanelSpec[], taken: Set<string>): PanelSpec[] {
  return panels.map((panel) => {
    let n = 1;

    while (taken.has(n === 1 ? panel.id : `${panel.id}-${n}`)) n++;

    const id = n === 1 ? panel.id : `${panel.id}-${n}`;

    taken.add(id);

    return { ...panel, id };
  });
}

export function recordingConsole(base: CaseConsole, index: TopicIndex): CaseConsole {
  const room = Math.max(0, MAX_PANELS - base.panels.length);
  const added = freshIds(recordingPanels(index), new Set(base.panels.map((p) => p.id))).slice(0, room);

  if (!added.length) return base;

  return {
    ...base,
    panels: [...base.panels, ...added],
    layout: { areas: [...base.layout.areas, { size: RECORDING_AREA_SIZE, panels: added.map((p) => p.id) }] },
  };
}
