import { overflowAvailable, policyFor } from './lib/agentPolicy.mjs';
import { quotaSnapshot } from './lib/quota.mjs';
import { codexPause, isActive, pause, resume, resumeCodex } from './lib/usage.mjs';
import { usageReport } from './lib/usageReport.mjs';

function showBurn(burn) {
  if (burn.pointsPerHour === undefined) {
    console.log(`Recent account usage (${burn.bucket}): ${burn.status}.`);

    return;
  }

  console.log(
    `Recent account usage (${burn.bucket}): ${burn.pointsPerHour.toFixed(2)} points/hour over ${burn.minutes.toFixed(0)} min. Remaining weekly budget: ${burn.remainingBudgetPerHour.toFixed(2)} points/hour. Status: ${burn.status}.`,
  );
  console.log('Account readings include manual work. Token totals are not subscription usage.');
}

function status() {
  quotaSnapshot('codex');
  quotaSnapshot('claude');

  const report = usageReport();
  const policy = policyFor('build');

  console.log(`Default: ${policy.provider} (${policy.model}, ${policy.effort}). Claude is protected overflow.`);
  console.log(
    `Weekly target: ${report.weeklyTarget}%, emergency reserve: ${report.emergencyReserve}%. No scheduled slow periods.`,
  );
  console.log(`Codex limited: ${isActive(codexPause())}. Claude limited: ${isActive(pause())}.`);

  const claude = report.quota.claude;

  console.log(
    `Claude quota permits overflow: ${!isActive(pause()) && overflowAvailable({ used: claude, baseline: claude.baseline })}.`,
  );
  console.log(`Recorded sessions in 24 h: ${report.sessions}.`);

  for (const burn of report.accountBurn) showBurn(burn);

  for (const window of report.quota.codex.windows)
    console.log(
      `Codex ${window.minutes} min window: ${window.used}% used, resets ${new Date(window.reset).toISOString()}.`,
    );
}

const [command = 'status'] = process.argv.slice(2);

if (command === 'resume') {
  resume();
  resumeCodex();
  console.log('Provider limit holds cleared. Codex remains the default.');
} else if (command === 'status') status();
else if (command === 'json') {
  quotaSnapshot('codex');
  console.log(JSON.stringify(usageReport(), null, 2));
} else console.log('Usage: node tools/loop/usage.mjs <status|json|resume>');
