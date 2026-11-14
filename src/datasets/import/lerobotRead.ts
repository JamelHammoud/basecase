import { plural } from '../../../electron/plural.mjs';
import { episodePlans, type EpisodePlan } from './lerobotEpisodes';
import { ACTION_KEY, lerobotInfo, readInfo, STATE_KEY, type LeRobotInfo } from './lerobotMeta';
import { filesUnder, mismatched, readParquet, refuse, toNumber, type DatasetFiles, type Row } from './lerobotSource';
import { isLeRobotFolder } from './sourceKind';
import { finiteOrRefuse, IMPORT_LIMITS, type SourceData, type SourceEpisode, type SourceFolder } from './types';

const TIME_KEY = 'timestamp';
const EPISODE_KEY = 'episode_index';

const tooLong = (index: number) =>
  refuse(`Episode ${index} runs longer than ${plural(IMPORT_LIMITS.seconds / 60, 'minute')}.`);

interface DataFile {
  path: string;
  rows: Row[];
  byEpisode: Map<number, Row[]> | null;
}

function groupByEpisode(rows: Row[]): Map<number, Row[]> {
  const groups = new Map<number, Row[]>();

  for (const row of rows) {
    const index = toNumber(row[EPISODE_KEY]);
    const group = groups.get(index);

    if (group) group.push(row);
    else groups.set(index, [row]);
  }

  return groups;
}

async function readDataFile(files: DatasetFiles, info: LeRobotInfo, path: string): Promise<DataFile> {
  const { columns, rows } = await readParquet(files, path, [STATE_KEY, ACTION_KEY, TIME_KEY, EPISODE_KEY]);
  const needed = info.withAction ? [STATE_KEY, ACTION_KEY, TIME_KEY] : [STATE_KEY, TIME_KEY];

  if (!needed.every((name) => columns.has(name))) mismatched(path);

  return { path, rows, byEpisode: columns.has(EPISODE_KEY) ? groupByEpisode(rows) : null };
}

function rowsOf(file: DataFile, plan: EpisodePlan, shared: boolean): Row[] {
  if (!file.byEpisode && shared) mismatched(file.path);

  const rows = file.byEpisode ? (file.byEpisode.get(plan.index) ?? []) : file.rows;

  return rows.length === plan.length ? rows : mismatched(file.path);
}

const cellsOf = (value: unknown): ArrayLike<unknown> => {
  if (Array.isArray(value)) return value;

  return ArrayBuffer.isView(value) ? (value as unknown as ArrayLike<number>) : [value];
};

interface Columns {
  rows: Row[];
  path: string;
}

function matrixOf({ rows, path }: Columns, key: string, width: number): Float64Array {
  const values = new Float64Array(rows.length * width);

  rows.forEach((row, r) => {
    const cells = cellsOf(row[key]);

    if (cells.length !== width) mismatched(path);

    for (let c = 0; c < width; c++) values[r * width + c] = toNumber(cells[c]);
  });
  finiteOrRefuse(values, `The dataset’s ${path}`);

  return values;
}

function timesOf({ rows, path }: Columns, index: number): Float64Array {
  const raw = Float64Array.from(rows, (row) => toNumber(row[TIME_KEY]));

  finiteOrRefuse(raw, `The dataset’s ${path}`);

  const t = raw.map((v) => v - raw[0]);

  if (t.some((v, i) => i > 0 && v < t[i - 1])) refuse(`The dataset’s ${path} has timestamps that go backwards.`);

  if (t.length && t[t.length - 1] > IMPORT_LIMITS.seconds) tooLong(index);

  return t;
}

function episodeOf(file: DataFile, plan: EpisodePlan, info: LeRobotInfo, shared: boolean): SourceEpisode {
  const columns = { rows: rowsOf(file, plan, shared), path: file.path };
  const width = info.names.length;

  return {
    index: plan.index,
    task: plan.task,
    t: timesOf(columns, plan.index),
    state: matrixOf(columns, STATE_KEY, width),
    action: info.withAction ? matrixOf(columns, ACTION_KEY, width) : null,
    videos: plan.videos,
  };
}

function byDataFile(plans: EpisodePlan[]): Map<string, EpisodePlan[]> {
  const groups = new Map<string, EpisodePlan[]>();

  for (const plan of plans) {
    const group = groups.get(plan.dataPath);

    if (group) group.push(plan);
    else groups.set(plan.dataPath, [plan]);
  }

  return groups;
}

async function readEpisodes(files: DatasetFiles, info: LeRobotInfo, plans: EpisodePlan[]): Promise<SourceEpisode[]> {
  const episodes: SourceEpisode[] = [];

  for (const plan of plans) {
    if ((plan.length - 1) / info.fps > IMPORT_LIMITS.seconds) tooLong(plan.index);
  }

  for (const [path, group] of byDataFile(plans)) {
    const file = await readDataFile(files, info, path);

    episodes.push(...group.map((plan) => episodeOf(file, plan, info, group.length > 1)));
  }

  return episodes.sort((a, b) => a.index - b.index);
}

const withRoot = (episode: SourceEpisode, root: string): SourceEpisode =>
  root ? { ...episode, videos: episode.videos.map((v) => ({ ...v, path: `${root}/${v.path}` })) } : episode;

export async function readLeRobot(folder: SourceFolder): Promise<SourceData | null> {
  const root = isLeRobotFolder(folder.files.map((f) => f.path)) ?? refuse('This folder isn’t a LeRobot dataset.');
  const files = filesUnder(folder.files, root);
  const raw = await lerobotInfo(files);

  if (!raw) return null;

  const info = readInfo(raw);
  const episodes = await readEpisodes(files, info, await episodePlans(files, info));

  return {
    format: info.format,
    robotType: info.robotType,
    names: info.names,
    episodes: episodes.map((e) => withRoot(e, root)),
  };
}
