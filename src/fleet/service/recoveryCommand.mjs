import os from 'node:os';
import { recover, readRecoveryAudit, setupRecovery } from './recovery.mjs';
import { recoveryAudit } from './recoveryProtection.mjs';
import { identifier, insist } from './validation.mjs';

async function secretInput(input) {
  insist(!input.isTTY);

  const chunks = [];
  let size = 0;

  for await (const chunk of input) {
    size += chunk.length;
    insist(size <= 8192);
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function localRecoveryCommand(pool, args) {
  const [command, org, after] = args;

  if (command === 'recovery-audit') {
    insist(args.length === 2 || args.length === 3);

    return readRecoveryAudit(pool, org, after);
  }

  insist(args.length === 2 && ['recover', 'recovery-setup'].includes(command));

  const databaseActor = await pool.query('SELECT current_user AS name');
  const actor = `local:${databaseActor.rows[0].name}:${os.hostname()}:${os.userInfo().username}`;

  identifier(org);

  try {
    const input = await secretInput(process.stdin);
    const options = { org, actor, email: input.email, password: input.password };

    return await (command === 'recover' ? recover(pool, options) : setupRecovery(pool, options));
  } catch (error) {
    if (!error.auditRecorded) await recordRefusal(pool, { org, actor, command });

    throw error;
  }
}

async function recordRefusal(pool, { org, actor, command }) {
  const result = await pool.query(
    'SELECT o.id AS org,r.id FROM fleet_organizations o LEFT JOIN fleet_recovery r ON r.org=o.id WHERE o.id=$1',
    [org],
  );
  const found = result.rows[0];

  if (!found) return;

  await recoveryAudit(pool, {
    org,
    actor,
    action: command === 'recover' ? 'recovery.use' : 'recovery.setup',
    affected: found.id ?? org,
    outcome: 'refused',
  });
}
