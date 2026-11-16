import { randomUUID } from 'node:crypto';
import { ACTIONS } from './authorization.mjs';
import { transaction } from './database.mjs';
import { matchesPassword, passwordHash } from './identity.mjs';
import { lockIdentity, recoveryAudit } from './recoveryProtection.mjs';
import { Refused, identifier, insist, text } from './validation.mjs';

export async function setupRecovery(pool, options) {
  const org = identifier(options.org);
  const account = randomUUID();
  const role = randomUUID();
  const password = await passwordHash(options.password);
  const email = text(options.email).toLowerCase();
  const actor = text(options.actor, 1024);

  return transaction(pool, async (client) => {
    await lockIdentity(client, org);

    const existing = await client.query('SELECT id FROM fleet_recovery WHERE org=$1', [org]);

    if (existing.rowCount) {
      await recoveryAudit(client, {
        org,
        actor,
        action: 'recovery.setup',
        affected: existing.rows[0].id,
        outcome: 'refused',
      });

      return { refused: true };
    }

    await client.query('INSERT INTO fleet_resources(org,id,kind,ancestors,data) VALUES ($1,$2,$3,$4,$5)', [
      org,
      role,
      'role',
      [org],
      { name: 'Recovery administrator', rules: [{ effect: 'allow', scope: '*', actions: ACTIONS, conditions: {} }] },
    ]);
    await client.query('INSERT INTO fleet_resources(org,id,kind,ancestors,data) VALUES ($1,$2,$3,$4,$5)', [
      org,
      account,
      'account',
      [org],
      { name: email, roles: [role] },
    ]);
    await client.query('INSERT INTO fleet_passwords(org,account,email,password) VALUES ($1,$2,$3,$4)', [
      org,
      account,
      email,
      password,
    ]);
    await client.query('INSERT INTO fleet_recovery(org,id,role) VALUES ($1,$2,$3)', [org, account, role]);
    await recoveryAudit(client, { org, actor, action: 'recovery.setup', affected: account, outcome: 'success' });

    return { org, account, role };
  }).then(requireSuccess);
}

function requireSuccess(result) {
  if (result.refused) {
    const error = new Refused(403);

    error.auditRecorded = true;

    throw error;
  }

  return result;
}

export async function recover(pool, options) {
  const org = identifier(options.org);
  const password = await passwordHash(options.password);
  const actor = text(options.actor, 1024);

  return transaction(pool, async (client) => {
    await lockIdentity(client, org);

    const result = await client.query(
      'SELECT r.id,p.password FROM fleet_recovery r JOIN fleet_passwords p ON p.org=r.org AND p.account=r.id WHERE r.org=$1',
      [org],
    );
    const account = result.rows[0]?.id;

    if (!account || (await matchesPassword(options.password, result.rows[0].password))) {
      await recoveryAudit(client, { org, actor, action: 'recovery.use', affected: account ?? org, outcome: 'refused' });

      return { refused: true };
    }

    await client.query('UPDATE fleet_passwords SET password=$3 WHERE org=$1 AND account=$2', [org, account, password]);
    await client.query('DELETE FROM fleet_credentials WHERE org=$1', [org]);
    await recoveryAudit(client, { org, actor, action: 'recovery.use', affected: account, outcome: 'success' });

    return { org, account };
  }).then(requireSuccess);
}

export async function readRecoveryAudit(pool, org, after = '0') {
  identifier(org);
  insist(/^\d{1,19}$/.test(after) && BigInt(after) <= 9223372036854775807n);

  const result = await pool.query(
    'SELECT sequence,org,actor,action,affected,occurred_at,outcome FROM fleet_recovery_audit WHERE org=$1 AND sequence>$2 ORDER BY sequence LIMIT 100',
    [org, after],
  );

  return { items: result.rows, next: result.rowCount === 100 ? result.rows.at(-1).sequence : null };
}
