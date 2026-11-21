import { Refused, identifier, insist } from './validation.mjs';
import { transaction } from './database.mjs';

export async function lockIdentity(client, org) {
  const result = await client.query('SELECT id FROM fleet_organizations WHERE id=$1 FOR UPDATE', [identifier(org)]);

  insist(result.rowCount === 1, 403);
}

export async function recoveryAudit(client, record) {
  await client.query('INSERT INTO fleet_recovery_audit(org,actor,action,affected,outcome) VALUES ($1,$2,$3,$4,$5)', [
    record.org,
    record.actor,
    record.action,
    record.affected,
    record.outcome,
  ]);
}

export async function protectRecovery(client, actor, mutation) {
  await lockIdentity(client, actor.org);

  const result = await client.query('SELECT id,role FROM fleet_recovery WHERE org=$1', [actor.org]);
  const local = result.rows[0];

  if (!local) return;

  const protectedIds = [local.id, local.role];
  const references = [...(mutation.data?.members ?? []), ...(mutation.data?.roles ?? [])];
  const affected = protectedIds.find((id) => mutation.id === id || references.includes(id));

  if (!affected) return;

  const error = new Refused(403);

  error.recoveryAudit = {
    org: actor.org,
    actor: `account:${actor.account}`,
    action: mutation.action,
    affected,
    outcome: 'refused',
  };

  throw error;
}

export async function auditedIdentityTransaction(pool, run) {
  try {
    return await transaction(pool, run);
  } catch (error) {
    if (error.recoveryAudit) await recoveryAudit(pool, error.recoveryAudit);

    throw error;
  }
}
