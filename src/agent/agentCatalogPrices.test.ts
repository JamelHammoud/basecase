import { describe, expect, it } from 'vitest';
import { agentCatalog } from './agentCatalog';

describe('find_parts prices', () => {
  const ctx = {
    purchases: {
      'component:feetech-sts3215|c018': { packQty: 1, priceUsd: 24.5, checkedAt: '2026-10-20' },
    },
    budget: { budgetUsd: 800, estimatedUsd: 412 },
    stance: { nm: 1.86, joint: 'Left knee', crouchDeg: 40 },
    volts: 12,
  };

  it('shows the remaining budget, the hardest joint and each actuator’s price and margin', () => {
    const text = agentCatalog('feetech', ctx);

    expect(text).toContain('Budget $800; this scene ≈ $412 so far ($388 left).');
    expect(text).toContain('Hardest joints in this scene: 1.86 N·m in stance at Left knee (40° crouch).');
    expect(text).toContain(
      'component:feetech-sts3215|c018 = 12 V (C018), stall 2.94 N·m, rated 0.98 N·m at 12 V (input 4–14 V), 45 rpm, stall 2.7 A · $24.50 checked 2026-10-20, 0.120 N·m/$; at 12 V: Left knee stance 0.63 of stall FAIL',
    );
    expect(text).toMatch(
      /Actuator: stall 4\.90 N·m, .* · ≈ \$73\.99 list at OpenELAB .*, 2026-10-29, 0\.066 N·m\/\$; at 12 V: Left knee stance 0\.38 of stall PASS/,
    );
  });

  it('prices hardware packs and plain components', () => {
    expect(agentCatalog('heat-set')).toContain('M3 ≈ $14.99 per 100 list at West3D (CNC Kitchen M3 × 5.7), 2026-10-29');
    expect(agentCatalog('zero 2')).toContain('≈ $17.25 list at PiShop.us, 2026-10-29');
  });
});
