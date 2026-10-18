import { fetchWithTimeout } from './shared.mjs';

const IGNORED_REPO_WORDS = ['description', 'urdf', 'model', 'robot', 'ros', 'mjcf', 'assets'];

async function gh(url) {
  const res = await fetchWithTimeout(url, 20000, { headers: { Accept: 'application/vnd.github+json' } });

  if (!res.ok)
    throw new Error(
      `GitHub returned ${res.status}${res.status === 403 ? ' (rate limit; try again in a minute or use WebSearch)' : ''}`,
    );

  return res.json();
}

const tokens = (t) =>
  String(t)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function nameScore(words, r) {
  const toks = tokens(r.name);
  const hit = words.filter((w) => toks.includes(w) || r.name.toLowerCase().includes(w)).length;
  const extra = toks.filter((t) => !words.includes(t) && !IGNORED_REPO_WORDS.includes(t)).length;

  return hit * 2 - extra;
}

async function searchRepos(name) {
  const repos = [];

  for (const q of [`${name} urdf`, name]) {
    const found = await gh(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=5`,
    );

    for (const r of found.items ?? []) if (!repos.some((x) => x.full_name === r.full_name)) repos.push(r);

    if (repos.length >= 4) break;
  }

  return repos;
}

const isDescriptionFile = (p) =>
  /\.(urdf|xacro)$/i.test(p) || (/\.xml$/i.test(p) && /(mjcf|mujoco|robot|scene|model)/i.test(p));

async function repoLines(repo, words) {
  let tree;

  try {
    tree = await gh(`https://api.github.com/repos/${repo.full_name}/git/trees/${repo.default_branch}?recursive=1`);
  } catch {
    return null;
  }

  const files = (tree.tree ?? [])
    .map((t) => t.path)
    .filter(isDescriptionFile)
    .filter((p) => !/(test|example|gazebo|collision|_backup)/i.test(p));

  if (!files.length) return null;

  const score = (p) =>
    words.filter((w) => p.toLowerCase().includes(w)).length * 2 +
    (/\.urdf$/i.test(p) ? 1 : 0) -
    p.split('/').length * 0.05;

  files.sort((x, y) => score(y) - score(x));

  return [
    `${repo.full_name} (★${repo.stargazers_count}): ${repo.description ?? ''}`.slice(0, 200),
    ...files
      .slice(0, 6)
      .map((f) => `  https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/${f}`),
  ];
}

export async function findRobotDescriptionText(name) {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const repos = await searchRepos(name);

  repos.sort((a, b) => nameScore(words, b) - nameScore(words, a) || b.stargazers_count - a.stargazers_count);

  const lines = [];
  let withFiles = 0;

  for (const repo of repos.slice(0, 4)) {
    if (withFiles >= 3) break;

    const found = await repoLines(repo, words);

    if (!found) continue;

    withFiles++;
    lines.push(...found);
  }

  return lines.length
    ? lines.join('\n')
    : `No URDF/MJCF files found for "${name}". Try another name or WebSearch for the project.`;
}
