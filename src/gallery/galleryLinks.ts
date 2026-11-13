import { WEB_APP_URL } from '../utils/platform/webDemo';

export const HUB_ORIGIN = 'https://huggingface.co';

export const SHARED_ROBOT_FILE = 'basecase-robot.json';

const HUB_NAME = /^(?!.*(?:--|\.\.))[A-Za-z0-9](?:[A-Za-z0-9._-]{0,94}[A-Za-z0-9])?$/;
const SHARED_PATH = /^\/r\/([^/]+)\/([^/]+)\/?$/;

export interface SharedRepo {
  account: string;
  repo: string;
}

export const gallerySlug = (path: string): string | null => {
  const m = /^\/c\/([\w-]{1,80})\/?$/.exec(path);

  return m ? m[1] : null;
};

const isHubName = (name: string) => HUB_NAME.test(name);

export function sharedRepo(id: string): SharedRepo | null {
  const [account, repo, ...rest] = id.split('/');

  return !rest.length && isHubName(account ?? '') && isHubName(repo ?? '') ? { account, repo } : null;
}

export function sharedRobotPath(path: string): SharedRepo | null {
  const m = SHARED_PATH.exec(path);

  return m ? sharedRepo(`${m[1]}/${m[2]}`) : null;
}

export function sharedBundleUrl({ account, repo }: SharedRepo): string {
  if (!isHubName(account) || !isHubName(repo)) throw new Error('That isn’t a Hugging Face repo.');

  const url = new URL(`/datasets/${account}/${repo}/resolve/main/${SHARED_ROBOT_FILE}`, HUB_ORIGIN);

  if (url.origin !== HUB_ORIGIN) throw new Error('That isn’t a Hugging Face repo.');

  return url.href;
}

export function sharedRobotLink(id: string): string {
  const shared = sharedRepo(id);

  if (!shared) throw new Error('That isn’t a Hugging Face repo.');

  return `${WEB_APP_URL}/r/${shared.account}/${shared.repo}`;
}

export function galleryBundleSource(path: string): string | null {
  const slug = gallerySlug(path);

  if (slug) return `/gallery/${slug}.json`;

  const shared = sharedRobotPath(path);

  return shared ? sharedBundleUrl(shared) : null;
}
