import { repo } from './github.mjs';
import { json } from './sh.mjs';

const QUERY = `query($owner:String!,$name:String!,$endCursor:String){repository(owner:$owner,name:$name){pullRequests(first:100,after:$endCursor,states:CLOSED,labels:["loop:repair"]){nodes{number body mergedAt}pageInfo{hasNextPage endCursor}}}}`;

export function releaseAbandonedRepair(run, saved) {
  if (saved.jobs.length === 0) return saved;

  const [owner, name] = repo().split('/');
  const pages = json('gh', [
    'api',
    'graphql',
    '--paginate',
    '--slurp',
    '-f',
    `query=${QUERY}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
  ]);
  const pulls = pages.flatMap((page) => page.data.repository.pullRequests.nodes);
  const released = saved.releasedPulls ?? [];
  const link = new RegExp(`/actions/runs/${run.databaseId}(?:\\D|$)`, 'u');
  const abandoned = pulls.filter(
    (pull) => pull.mergedAt === null && link.test(pull.body) && !released.includes(pull.number),
  );

  if (abandoned.length === 0) return saved;

  return { ...saved, jobs: [], releasedPulls: [...released, ...abandoned.map((pull) => pull.number)] };
}
