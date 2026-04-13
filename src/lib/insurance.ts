// Insurance premium calculation engine and pool helpers

import { db } from '@/lib/db';

export type CoverageTier = 'BASIC' | 'STANDARD' | 'PREMIUM';

export interface TierConfig {
  coverage: number;        // fraction of principal covered
  basePremiumRate: number; // base rate before risk adjustment
  label: string;
  description: string;
  color: string;
}

export const TIER_CONFIG: Record<CoverageTier, TierConfig> = {
  BASIC: {
    coverage: 0.50,
    basePremiumRate: 0.010,
    label: 'Basic',
    description: '50% of principal — covers half your loss if you default.',
    color: 'border-slate-500/50 bg-slate-500/5',
  },
  STANDARD: {
    coverage: 0.80,
    basePremiumRate: 0.020,
    label: 'Standard',
    description: '80% of principal — most popular. Strong protection at moderate cost.',
    color: 'border-blue-500/50 bg-blue-500/5',
  },
  PREMIUM: {
    coverage: 1.00,
    basePremiumRate: 0.035,
    label: 'Premium',
    description: '100% of principal — full coverage. Best for high-value loans.',
    color: 'border-amber-500/50 bg-amber-500/5',
  },
};

/**
 * Calculate risk-adjusted insurance premium.
 *
 * Adjustments:
 *   LTV multiplier  — higher LTV = more risk (base at 60% LTV)
 *   Score multiplier — better credit = lower premium (base at 500)
 *   Term multiplier  — longer term = more exposure (base at 30d)
 */
export function calculateInsurancePremium(
  principal: number,
  ltv: number,
  creditScore: number,
  termDays: number,
  tier: CoverageTier
): { premium: number; rate: number; coveragePercent: number } {
  const config = TIER_CONFIG[tier];

  // LTV multiplier: at 50% LTV = 0.80x, 60% = 1.00x, 70% = 1.20x
  const ltvMultiplier = Math.max(0.60, 1 + (ltv - 0.60) * 2.0);

  // Score multiplier: at 300 = 1.20x, 500 = 1.09x, 700 = 0.97x, 1000 = 0.80x
  const clampedScore = Math.max(300, Math.min(1000, creditScore));
  const scoreMultiplier = 1.2 - ((clampedScore - 300) / 700) * 0.4;

  // Term multiplier: at 7d = 0.82x, 30d = 0.93x, 60d = 1.07x, 90d = 1.20x
  const termMultiplier = 0.75 + (termDays / 90) * 0.50;

  const rate = config.basePremiumRate * ltvMultiplier * scoreMultiplier * termMultiplier;
  const premium = principal * rate;

  return {
    premium: Math.round(premium),
    rate: Math.round(rate * 10000) / 10000, // 4 decimal places
    coveragePercent: config.coverage,
  };
}

// -------------------------------------------------------
// Insurance pool helpers
// -------------------------------------------------------

/** Get or create the single insurance pool row. */
async function getPool() {
  const pool = await db.insurancePool.findFirst();
  if (pool) return pool;
  return db.insurancePool.create({ data: {} });
}

/** Add a collected premium to the pool. */
export async function poolAddPremium(amount: number): Promise<void> {
  await getPool(); // ensure exists
  await db.insurancePool.updateMany({
    data: { premiumsCollected: { increment: amount } },
  });
}

/** Deduct a paid claim from the pool. */
export async function poolDeductClaim(amount: number): Promise<void> {
  await getPool();
  await db.insurancePool.updateMany({
    data: { claimsPaid: { increment: amount } },
  });
}

/** Return pool stats: collected, paid, net reserve, reserve ratio. */
export async function getPoolStats() {
  const pool = await getPool();
  const netReserve = pool.premiumsCollected - pool.claimsPaid;
  const reserveRatio =
    pool.premiumsCollected > 0 ? netReserve / pool.premiumsCollected : 1;
  return {
    premiumsCollected: pool.premiumsCollected,
    claimsPaid: pool.claimsPaid,
    netReserve,
    reserveRatio,
    updatedAt: pool.updatedAt,
  };
}
