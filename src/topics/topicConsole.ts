import { MAX_PANELS, type CaseConsole } from '../cases/console/format';
import type { PanelSpec } from '../cases/console/panelKinds';
import { isDiagnosticTopic } from './diagnostics';
import { isLogTopic } from './logs';
import {
  DATA_LAYER_SCHEMAS,
  JOINT_SCHEMAS,
  schemaKey,
  IMAGE_SCHEMAS,
  IMU_SCHEMAS,
  isSchema,
  ODOMETRY_SCHEMAS,
  STATE_SCHEMAS,
} from './schemas';
import { topicRef, type TopicIndex } from './topicIndex';
import type { RecordedTopic } from './topicLog';

export const RECORDING_AREA_SIZE = 360;

const STATE_PANELS = 2;

const ofSchema = (index: TopicIndex, schemas: ReadonlySet<string>) =>
  index.topics.filter((t) => isSchema(schemas, t.schema));

const isPlain = (topic: RecordedTopic) =>
  !isLogTopic(topic) && !isDiagnosticTopic(topic) && !isSchema(IMAGE_SCHEMAS, topic.schema);

const KNOWN_SCHEMAS = new Set([
  ...IMAGE_SCHEMAS,
  ...IMU_SCHEMAS,
  ...ODOMETRY_SCHEMAS,
  ...STATE_SCHEMAS,
  ...JOINT_SCHEMAS,
]);

const columnCount = (t: RecordedTopic) => t.numbers.size + t.labels.size + t.lists.size + t.blobs.size;

function customMessage(index: TopicIndex) {
  const topics = index.topics.filter(
    (t) => isPlain(t) && !isSchema(KNOWN_SCHEMAS, t.schema) && !DATA_LAYER_SCHEMAS.has(schemaKey(t.schema)),
  );

  return topics.toSorted((a, b) => columnCount(b) - columnCount(a))[0];
}

function customStates(topic: RecordedTopic | undefined): PanelSpec[] {
  const labels = [...(topic?.labels.keys() ?? [])];
  const path = labels.find((p) => /(^|\.)(mode|state|status)$/u.test(p)) ?? labels[0];

  return topic && path ? [{ id: 'states', kind: 'states', signal: topicRef(topic.topic, path) }] : [];
}

function customPlot(topic: RecordedTopic | undefined): PanelSpec[] {
  const field = topic && [...topic.numbers.keys()].find((path) => !path.includes('[') && !topic.labels.has(path));

  return topic && field ? [{ id: 'plot', kind: 'plot', signals: [topicRef(topic.topic, field)] }] : [];
}

function recordingPanels(index: TopicIndex): PanelSpec[] {
  const states = ofSchema(index, STATE_SCHEMAS).slice(0, STATE_PANELS);
  const [imu] = ofSchema(index, IMU_SCHEMAS);
  const [odometry] = ofSchema(index, ODOMETRY_SCHEMAS);
  const used = new Set([...states, imu, odometry]);
  const custom = customMessage(index);
  const message = custom ?? index.topics.find((t) => isPlain(t) && !used.has(t));
  const panels: PanelSpec[] = [];

  if (index.topics.some(isLogTopic)) panels.push({ id: 'log', kind: 'log' });

  if (index.topics.some(isDiagnosticTopic)) panels.push({ id: 'diagnostics', kind: 'diagnostics' });

  for (const t of states) panels.push({ id: 'states', kind: 'states', signal: topicRef(t.topic, 'data') });

  if (!states.length) panels.push(...customStates(custom));

  if (imu) panels.push({ id: 'imu', kind: 'plot', signals: [topicRef(imu.topic, 'angular_velocity.*')] });

  if (odometry) {
    const position = (axis: string) => topicRef(odometry.topic, `pose.pose.position.${axis}`);

    panels.push({ id: 'odometry', kind: 'plot', signals: [position('y')], x: position('x') });
  }

  if (!imu && !odometry) panels.push(...customPlot(custom));

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
