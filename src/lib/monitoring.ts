// Background monitoring service
// Handles: payment detection, PLEX price updates, overdue loan detection
// Uses bank admin token (App 2) — NOT customer tokens

import { db } from '@/lib/db';
import {
  getPlexMarketPrice,
  getCharacterWalletJournal,
  getCharacterContracts,
  verifyPlexContract,
  getPlexAssetBalance,
} from '@/lib/esi';
import { getBankAccessToken } from '@/lib/auth-admin';
import { processPayment, activateLoan } from '@/lib/loans';

const ADMIN_CHARACTER_ID = parseInt(process.env.ADMIN_CHARACTER_ID ?? '0');

// ── Payment Detection ─────────────────────────────────────────
// Scans the bank character's wallet journal for ISK matching active loans

export async function detectPayments(): Promise<{ detected: number; errors: string[] }> {
  let accessToken: string;
  try {
    accessToken = await getBankAccessToken();
  } catch (err) {
    return { detected: 0, errors: [String(err)] };
  }

  const activeLoans = await db.loan.findMany({
    where: { status: { in: ['ACTIVE', 'OVERDUE'] } },
    include: { character: true },
  });

  if (!activeLoans.length) return { detected: 0, errors: [] };

  let journal: Awaited<ReturnType<typeof getCharacterWalletJournal>>;
  try {
    journal = await getCharacterWalletJournal(ADMIN_CHARACTER_ID, accessToken);
  } catch (err) {
    return { detected: 0, errors: [`Wallet journal fetch failed: ${String(err)}`] };
  }

  // ISK transfers received by the bank character in the last 24h
  // ref_type: 'player_donation' = direct ISK transfer between characters
  // second_party_id = recipient (our bank character)
  // amount > 0 = incoming (positive to our wallet)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const transfers = journal.filter(
    (e) =>
      e.ref_type === 'player_donation' &&
      new Date(e.date) > cutoff &&
      (e.amount ?? 0) > 0 &&
      e.second_party_id === ADMIN_CHARACTER_ID
  );

  let detected = 0;
  const errors: string[] = [];

  for (const loan of activeLoans) {
    // first_party_id = sender of the ISK (borrower's character ID)
    const loanTransfers = transfers.filter(
      (t) => t.first_party_id === loan.character.characterId
    );

    for (const transfer of loanTransfers) {
      const existing = await db.payment.findFirst({
        where: { loanId: loan.id, esiTransactionId: String(transfer.id) },
      });
      if (existing) continue;

      try {
        await processPayment(loan.id, Math.abs(transfer.amount ?? 0), String(transfer.id));
        detected++;
      } catch (err) {
        errors.push(`Loan ${loan.id}: ${String(err)}`);
      }
    }
  }

  return { detected, errors };
}

// ── Contract Detection ────────────────────────────────────────
// Scans bank character's contracts for PLEX collateral from approved loans

export async function detectContracts(): Promise<{ matched: number; errors: string[] }> {
  let accessToken: string;
  try {
    accessToken = await getBankAccessToken();
  } catch (err) {
    return { matched: 0, errors: [String(err)] };
  }

  const pendingLoans = await db.loan.findMany({
    where: { status: 'APPROVED', collateralContractId: null },
    include: { character: true },
  });

  if (!pendingLoans.length) return { matched: 0, errors: [] };

  let contracts: Awaited<ReturnType<typeof getCharacterContracts>>;
  try {
    contracts = await getCharacterContracts(ADMIN_CHARACTER_ID, accessToken);
  } catch (err) {
    return { matched: 0, errors: [`Contract fetch failed: ${String(err)}`] };
  }

  const itemExchangeContracts = contracts.filter(
    (c) => c.type === 'item_exchange' && c.status === 'outstanding'
  );

  let matched = 0;
  const errors: string[] = [];

  for (const loan of pendingLoans) {
    const match = itemExchangeContracts.find(
      (c) => c.issuer_id === loan.character.characterId && c.assignee_id === ADMIN_CHARACTER_ID
    );

    if (!match) continue;

    // Verify the contract actually contains the correct PLEX quantity
    const verification = await verifyPlexContract(
      ADMIN_CHARACTER_ID,
      match.contract_id,
      loan.collateralPlexQty,
      accessToken
    );

    if (!verification.valid) {
      errors.push(
        `Loan ${loan.id}: Contract ${match.contract_id} verification failed — ${verification.error}`
      );
      await db.auditLog.create({
        data: {
          loanId: loan.id,
          characterId: loan.characterId,
          action: 'CONTRACT_VERIFICATION_FAILED',
          description: verification.error ?? 'PLEX quantity mismatch',
          metadata: JSON.stringify({ contractId: match.contract_id, actualQty: verification.actualQty, expectedQty: loan.collateralPlexQty }),
        },
      });
      continue;
    }

    try {
      await activateLoan(loan.id, String(match.contract_id));
      matched++;
    } catch (err) {
      errors.push(`Loan ${loan.id}: ${String(err)}`);
    }
  }

  return { matched, errors };
}

// ── Bank Vault Audit ──────────────────────────────────────────
// Verifies actual PLEX held matches sum of active loan collateral

export async function auditVault(): Promise<{ held: number; expected: number; discrepancy: number; mixedLoans: number; error?: string }> {
  let accessToken: string;
  try {
    accessToken = await getBankAccessToken();
  } catch (err) {
    return { held: 0, expected: 0, discrepancy: 0, mixedLoans: 0, error: String(err) };
  }

  const [held, activeLoans] = await Promise.all([
    getPlexAssetBalance(ADMIN_CHARACTER_ID, accessToken),
    db.loan.findMany({
      where: { status: { in: ['ACTIVE', 'OVERDUE'] } },
      select: { collateralPlexQty: true, collateralType: true },
    }),
  ]);

  // Only count PLEX loans — mixed collateral is tracked separately
  const plexLoans = activeLoans.filter((l) => l.collateralType !== 'MIXED');
  const mixedLoans = activeLoans.length - plexLoans.length;
  const expected = plexLoans.reduce((sum, l) => sum + l.collateralPlexQty, 0);
  const discrepancy = held - expected;

  if (discrepancy !== 0) {
    await db.auditLog.create({
      data: {
        action: 'VAULT_DISCREPANCY',
        description: `PLEX vault audit: holding ${held}, expected ${expected}, discrepancy ${discrepancy}${mixedLoans > 0 ? ` (${mixedLoans} mixed-collateral loan(s) excluded)` : ''}`,
        metadata: JSON.stringify({ held, expected, discrepancy, mixedLoans }),
      },
    });
  }

  return { held, expected, discrepancy, mixedLoans };
}

// ── PLEX Price Update ─────────────────────────────────────────

export async function updatePlexPrice(): Promise<{ price?: number; error?: string }> {
  try {
    const price = await getPlexMarketPrice();
    await db.plexPriceCache.create({ data: { price } });
    return { price };
  } catch (err) {
    return { error: String(err) };
  }
}

// ── Overdue Loan Detection ────────────────────────────────────

export async function checkOverdueLoans(): Promise<{ marked: number }> {
  const now = new Date();

  const result = await db.loan.updateMany({
    where: { status: 'ACTIVE', dueDate: { lt: now } },
    data: { status: 'OVERDUE', overdueAt: now },
  });

  if (result.count > 0) {
    await db.auditLog.create({
      data: {
        action: 'LOANS_MARKED_OVERDUE',
        description: `${result.count} loan(s) marked overdue`,
        metadata: JSON.stringify({ count: result.count, checkedAt: now }),
      },
    });
  }

  return { marked: result.count };
}

// ── Grace Period + Liquidation Eligibility ───────────────────
// Flags overdue loans that have passed the grace period as eligible
// for admin liquidation. Does NOT auto-liquidate — admin must confirm.

export async function checkLiquidationEligible(): Promise<{ eligible: number }> {
  const gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? '7');
  const cutoff = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000);

  const eligible = await db.loan.count({
    where: {
      status: 'OVERDUE',
      overdueAt: { lt: cutoff },
    },
  });

  if (eligible > 0) {
    await db.auditLog.create({
      data: {
        action: 'LIQUIDATION_ELIGIBLE',
        description: `${eligible} overdue loan(s) past grace period — admin action required to liquidate`,
        metadata: JSON.stringify({ eligible, gracePeriodDays, checkedAt: new Date() }),
      },
    });
  }

  return { eligible };
}

// ── Full Monitoring Cycle ─────────────────────────────────────

export async function runMonitoringCycle() {
  const [payments, contracts, overdue, liquidation, plexPrice, vault] = await Promise.allSettled([
    detectPayments(),
    detectContracts(),
    checkOverdueLoans(),
    checkLiquidationEligible(),
    updatePlexPrice(),
    auditVault(),
  ]);

  return {
    payments: payments.status === 'fulfilled' ? payments.value : { detected: 0, errors: [String(payments.reason)] },
    contracts: contracts.status === 'fulfilled' ? contracts.value : { matched: 0, errors: [String(contracts.reason)] },
    overdue: overdue.status === 'fulfilled' ? overdue.value : { marked: 0 },
    liquidation: liquidation.status === 'fulfilled' ? liquidation.value : { eligible: 0 },
    plexPrice: plexPrice.status === 'fulfilled' ? plexPrice.value : { error: String(plexPrice.reason) },
    vault: vault.status === 'fulfilled' ? vault.value : { held: 0, expected: 0, discrepancy: 0, error: String(vault.reason) },
    runAt: new Date().toISOString(),
  };
}
