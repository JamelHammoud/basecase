import { demand, readResource, readResources } from './registry.mjs';
import { identifier, insist, text } from './validation.mjs';
import { checkedPose, checkedWork } from './pose.mjs';

export async function generation(client, actor, robot) {
  const resource = await readResource(client, actor.org, identifier(robot));

  insist(resource.kind === 'robot');
  demand(actor, 'status.publish', resource);

  const result = await client.query(
    'INSERT INTO fleet_status(org,robot,generation) VALUES ($1,$2,1) ON CONFLICT (org,robot) DO UPDATE SET generation=fleet_status.generation+1 RETURNING generation',
    [actor.org, robot],
  );

  return { generation: Number(result.rows[0].generation) };
}

function checkedUpdate(update) {
  insist(Number.isSafeInteger(update.generation) && update.generation > 0);
  insist(['online', 'offline', 'fault', 'unknown'].includes(update.status));
  text(update.event, 128);

  const observed = Date.parse(update.observedAt);

  insist(Number.isFinite(observed) && observed <= Date.now() + 30000);

  return {
    robot: identifier(update.robot),
    event: update.event,
    generation: update.generation,
    observed_at: new Date(observed).toISOString(),
    status: update.status,
    pose: checkedPose(update.pose, new Date(observed).toISOString()),
    work: checkedWork(update.work),
  };
}

const ingestSql = `WITH incoming AS (
  SELECT * FROM jsonb_to_recordset($2::jsonb) AS u(robot uuid,event text,generation bigint,observed_at timestamptz,status text,pose jsonb,work jsonb)
), inserted AS (
  INSERT INTO fleet_ingest_events(org,robot,event,generation)
  SELECT $1,u.robot,u.event,u.generation FROM incoming u JOIN fleet_status s ON s.org=$1 AND s.robot=u.robot AND s.generation=u.generation
  ON CONFLICT DO NOTHING RETURNING robot,event,generation
) UPDATE fleet_status s SET status=u.status,observed_at=u.observed_at,observed_generation=u.generation,received_at=now(),pose=u.pose,work=u.work
  FROM incoming u JOIN inserted i ON i.robot=u.robot AND i.event=u.event AND i.generation=u.generation
  WHERE s.org=$1 AND s.robot=u.robot AND s.generation=u.generation AND (s.observed_at IS NULL OR s.observed_generation<>u.generation OR s.observed_at<=u.observed_at)`;

export async function ingest(client, actor, body) {
  insist(Array.isArray(body) && body.length > 0 && body.length <= 100);

  const updates = body.map(checkedUpdate);
  const ids = [...new Set(updates.map((item) => item.robot))];

  insist(ids.length === updates.length);

  const resources = await readResources(client, actor.org, ids);

  insist(resources.length === ids.length, 403);

  for (const resource of resources) {
    insist(resource.kind === 'robot');
    demand(actor, 'status.publish', resource);
  }

  for (const update of updates) await checkFacilityPose(client, actor, update);

  const result = await client.query(ingestSql, [actor.org, JSON.stringify(updates)]);

  return { accepted: result.rowCount };
}

async function checkFacilityPose(client, actor, update) {
  if (update.pose?.frame !== 'facility') return;

  const robot = await readResource(client, actor.org, update.robot);

  insist(robot.ancestors.includes(update.pose.site), 403);

  const result = await client.query('SELECT summary,registration FROM fleet_facilities WHERE org=$1 AND site=$2', [
    actor.org,
    update.pose.site,
  ]);
  const facility = result.rows[0];

  insist(facility?.registration && facility.summary.hash === update.pose.facility);
  insist(!update.pose.floor || facility.summary.floors.includes(update.pose.floor));
}
