// Core loan business logic

import { db } from '@/lib/db';
import { appraisePlexValue } from '@/lib/esi';
import { appraiseItems } from '@/lib/janice';
import { recalculateAndSave } from '@/lib/credit-score';
import {
  calculateInsurancePremium,
  poolAddPremium,
  poolDeductClaim,
  type CoverageTier,
} from '@/lib/insurance';

const DEFAULT_INTEREST_RATE = parseFloat(process.env.BASE_INTEREST_RATE ?? '0.08');
const DEFAULT_TERM_DAYS = parseInt(process.env.LOAN_TERM_DAYS ?? '30');
const MAX_LTV = parseFloat(process.env.MAX_LTV_RATIO ?? '0.70');
const GRACE_PERIOD_DAYS = parseInt(process.env.GRACE_PERIOD_DAYS ?? '7');

export interface LoanApplicationInput {
  characterId: string; // db Character.id
  principalAmount: number;
  plexQty?: number;
  collateralItems?: { typeName: string; qty: number }[];
  termDays?: number;
  wantsInsurance?: boolean;
  coverageTier?: CoverageTier;
}

export interface LoanApplicationResult {
  success: boolean;
  loanId?: string;
  error?: string;
  ltv?: number;
  collateralValue?: number;
}

export async function applyForLoan(input: LoanApplicationInput): Promise<LoanApplicationResult> {
  const { characterId, principalAmount, plexQty, collateralItems, termDays, wantsInsurance, coverageTier } = input;
  const term = termDays ?? DEFAULT_TERM_DAYS;
  const tier: CoverageTier = coverageTier ?? 'STANDARD';

  if (!plexQty && (!collateralItems || collateralItems.length === 0)) {
    return { success: false, error: 'Collateral required — provide PLEX quantity or item list' };
  }

  // ── Appraise collateral ──────────────────────────────────────
  let collateralValue: number;
  let collateralType: 'PLEX' | 'MIXED' = 'PLEX';
  let appraisedItems: { typeName: string; typeId: number; qty: number; unitValue: number; totalValue: number }[] = [];

  if (plexQty) {
    // PLEX-only path — fast, single price lookup
    try {
      collateralValue = await appraisePlexValue(plexQty);
    } catch {
      const cached = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });
      if (!cached) return { success: false, error: 'Unable to appraise PLEX — no price data available' };
      collateralValue = cached.price * plexQty;
    }
  } else {
    // Multi-asset path — Janice appraisal
    collateralType = 'MIXED';
    try {
      const appraisal = await appraiseItems(collateralItems!);
      if (appraisal.items.length === 0) {
        return { success: false, error: 'None of the provided items could be appraised — check item names' };
      }
      const unknownCount = collateralItems!.length - appraisal.items.length;
      if (unknownCount > 0) {
        // Partial appraisal — still allow but warn via audit log later
      }
      collateralValue = appraisal.totalValue;
      appraisedItems = appraisal.items.map((i) => ({
        typeName: i.name,
        typeId: i.typeId,
        qty: i.qty,
        unitValue: i.unitPrice,
        totalValue: i.totalValue,
      }));
    } catch (err) {
      return { success: false, error: `Appraisal failed: ${String(err)}` };
    }
  }

  if (collateralValue <= 0) {
    return { success: false, error: 'Collateral has no appraised value' };
  }

  const ltv = principalAmount / collateralValue;
  if (ltv > MAX_LTV) {
    return {
      success: false,
      error: `Loan-to-value ratio ${(ltv * 100).toFixed(1)}% exceeds maximum ${(MAX_LTV * 100).toFixed(0)}%`,
      ltv,
      collateralValue,
    };
  }

  const character = await db.character.findUnique({ where: { id: characterId } });
  if (!character) return { success: false, error: 'Character not found' };

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + term);

  const autoApprovalEligible =
    character.creditScore >= 650 &&
    character.totalDefaulted === 0 &&
    ltv <= 0.6 &&
    collateralType === 'PLEX'; // Mixed collateral always requires manual review

  // Risk-adjusted insurance premium
  let insurancePremium = 0;
  let insuranceRate = 0;
  let coveragePercent = 0;
  if (wantsInsurance) {
    const calc = calculateInsurancePremium(principalAmount, ltv, character.creditScore, term, tier);
    insurancePremium = calc.premium;
    insuranceRate = calc.rate;
    coveragePercent = calc.coveragePercent;
  }

  const loan = await db.loan.create({
    data: {
      characterId,
      principalAmount,
      interestRate: DEFAULT_INTEREST_RATE,
      termDays: term,
      dueDate,
      status: autoApprovalEligible ? 'APPROVED' : 'PENDING',
      approvalReason: autoApprovalEligible ? 'Auto-approved: good credit standing' : null,
      autoApprovalEligible,
      collateralType,
      collateralPlexQty: plexQty ?? 0,
      collateralPlexValue: collateralValue,
      ltvRatio: ltv,
      hasInsurance: wantsInsurance ?? false,
      nextPaymentDue: dueDate,
      collateralItems: appraisedItems.length > 0
        ? { createMany: { data: appraisedItems } }
        : undefined,
      insurance: wantsInsurance
        ? {
            create: {
              coverageTier: tier,
              premiumAmount: insurancePremium,
              premiumRate: insuranceRate,
              coveragePercent,
            },
          }
        : undefined,
    },
  });

  if (wantsInsurance && insurancePremium > 0) {
    await poolAddPremium(insurancePremium);
  }

  const collateralDesc = plexQty
    ? `${plexQty} PLEX collateral`
    : `${appraisedItems.length} items, total ${collateralValue.toLocaleString()} ISK`;

  await db.auditLog.create({
    data: {
      loanId: loan.id,
      characterId,
      action: autoApprovalEligible ? 'LOAN_AUTO_APPROVED' : 'LOAN_APPLIED',
      description: `Loan application for ${principalAmount.toLocaleString()} ISK — ${collateralDesc}`,
      metadata: JSON.stringify({ ltv, collateralValue, collateralType, autoApprovalEligible }),
    },
  });

  return { success: true, loanId: loan.id, ltv, collateralValue };
}

export function calculateTotalRepayment(principal: number, rate: number): number {
  return principal * (1 + rate);
}

export function calculateCancellationFee(loan: {
  principalAmount: number;
  interestRate: number;
  amountRepaid: number;
}): number {
  const total = calculateTotalRepayment(loan.principalAmount, loan.interestRate);
  const remaining = total - loan.amountRepaid;
  return remaining * 0.05; // 5% cancellation fee on remaining balance
}

export async function cancelLoan(loanId: string, characterId: string): Promise<{ success: boolean; error?: string }> {
  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: { insurance: true },
  });

  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.characterId !== characterId) return { success: false, error: 'Unauthorized' };
  if (!['PENDING', 'APPROVED', 'ACTIVE'].includes(loan.status)) {
    return { success: false, error: `Cannot cancel loan in status ${loan.status}` };
  }

  const cancellationFee = loan.status === 'PENDING' ? 0 : calculateCancellationFee(loan);
  const insurancePremium = loan.insurance?.premiumAmount ?? 0;
  const totalCost = cancellationFee + insurancePremium;

  await db.loan.update({
    where: { id: loanId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      loanId,
      characterId,
      action: 'LOAN_CANCELLED',
      description: `Loan cancelled. Fee: ${cancellationFee.toLocaleString()} ISK, Insurance premium lost: ${insurancePremium.toLocaleString()} ISK`,
      metadata: JSON.stringify({ cancellationFee, insurancePremium, totalCost }),
    },
  });

  return { success: true };
}

export async function approveLoan(loanId: string, adminReason?: string): Promise<{ success: boolean; error?: string }> {
  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.status !== 'PENDING') return { success: false, error: `Loan is not pending (${loan.status})` };

  await db.loan.update({
    where: { id: loanId },
    data: {
      status: 'APPROVED',
      approvalReason: adminReason ?? 'Manually approved by admin',
    },
  });

  await db.auditLog.create({
    data: {
      loanId,
      characterId: loan.characterId,
      action: 'LOAN_APPROVED',
      description: adminReason ?? 'Loan approved by admin',
    },
  });

  return { success: true };
}

export async function activateLoan(loanId: string, contractId: string): Promise<{ success: boolean; error?: string }> {
  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.status !== 'APPROVED') return { success: false, error: 'Loan must be approved first' };

  await db.loan.update({
    where: { id: loanId },
    data: {
      status: 'ACTIVE',
      collateralContractId: contractId,
    },
  });

  // Update character stats
  await db.character.update({
    where: { id: loan.characterId },
    data: { totalLoans: { increment: 1 } },
  });

  await db.auditLog.create({
    data: {
      loanId,
      characterId: loan.characterId,
      action: 'LOAN_ACTIVATED',
      description: `Loan activated. PLEX contract: ${contractId}`,
      metadata: JSON.stringify({ contractId }),
    },
  });

  return { success: true };
}

export async function processPayment(
  loanId: string,
  amount: number,
  esiTransactionId?: string
): Promise<{ success: boolean; completed?: boolean; error?: string }> {
  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (!['ACTIVE', 'OVERDUE'].includes(loan.status)) {
    return { success: false, error: `Cannot process payment for loan in status ${loan.status}` };
  }

  const totalDue = calculateTotalRepayment(loan.principalAmount, loan.interestRate);
  const newRepaid = loan.amountRepaid + amount;
  const isComplete = newRepaid >= totalDue;

  await db.$transaction([
    db.payment.create({
      data: {
        loanId,
        characterId: loan.characterId,
        amount,
        esiTransactionId,
        verified: !!esiTransactionId,
      },
    }),
    db.loan.update({
      where: { id: loanId },
      data: {
        amountRepaid: newRepaid,
        status: isComplete ? 'COMPLETED' : loan.status,
        completedAt: isComplete ? new Date() : undefined,
      },
    }),
    db.auditLog.create({
      data: {
        loanId,
        characterId: loan.characterId,
        action: isComplete ? 'LOAN_COMPLETED' : 'PAYMENT_RECEIVED',
        description: `Payment of ${amount.toLocaleString()} ISK received. Total repaid: ${newRepaid.toLocaleString()} / ${totalDue.toLocaleString()} ISK`,
        metadata: JSON.stringify({ amount, newRepaid, totalDue, isComplete }),
      },
    }),
  ]);

  if (isComplete) {
    await db.character.update({
      where: { id: loan.characterId },
      data: { totalRepaid: { increment: 1 } },
    });
    await recalculateAndSave(loan.characterId);
  }

  return { success: true, completed: isComplete };
}


/** Borrower requests an insurance claim — moves to PENDING_REVIEW for admin. */
export async function requestInsuranceClaim(
  loanId: string,
  characterId: string
): Promise<{ success: boolean; error?: string }> {
  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: { insurance: true },
  });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.characterId !== characterId) return { success: false, error: 'Unauthorized' };
  if (loan.status !== 'DEFAULTED') return { success: false, error: 'Claims can only be filed on defaulted loans' };
  if (!loan.insurance) return { success: false, error: 'This loan has no insurance' };
  if (loan.insurance.claimStatus !== 'NONE') return { success: false, error: 'A claim has already been filed' };

  await db.$transaction([
    db.loanInsurance.update({
      where: { loanId },
      data: {
        claimStatus: 'PENDING_REVIEW',
        claimRequestedAt: new Date(),
      },
    }),
    db.auditLog.create({
      data: {
        loanId,
        characterId,
        action: 'INSURANCE_CLAIM_REQUESTED',
        description: `Borrower filed insurance claim (${(loan.insurance.coveragePercent * 100).toFixed(0)}% coverage, ${loan.insurance.coverageTier} tier)`,
      },
    }),
  ]);

  return { success: true };
}

/** Admin approves an insurance claim — records payout and deducts from pool. */
export async function processInsuranceClaim(
  loanId: string
): Promise<{ success: boolean; claimAmount?: number; error?: string }> {
  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: { insurance: true },
  });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.status !== 'DEFAULTED') return { success: false, error: 'Insurance claims can only be approved on defaulted loans' };
  if (!loan.insurance) return { success: false, error: 'This loan has no insurance' };
  if (loan.insurance.claimStatus === 'APPROVED') return { success: false, error: 'Insurance claim already approved' };
  if (loan.insurance.claimStatus === 'DENIED') return { success: false, error: 'Cannot approve a denied claim' };

  const claimAmount = Math.round(loan.principalAmount * loan.insurance.coveragePercent);
  const now = new Date();

  await db.$transaction([
    db.loanInsurance.update({
      where: { loanId },
      data: {
        claimStatus: 'APPROVED',
        claimable: false,
        claimedAt: now,
        claimAmount,
      },
    }),
    db.auditLog.create({
      data: {
        loanId,
        characterId: loan.characterId,
        action: 'INSURANCE_CLAIM_APPROVED',
        description: `Insurance claim approved: ${claimAmount.toLocaleString()} ISK (${(loan.insurance.coveragePercent * 100).toFixed(0)}% of ${loan.principalAmount.toLocaleString()} ISK principal)`,
        metadata: JSON.stringify({ claimAmount, coveragePercent: loan.insurance.coveragePercent, principalAmount: loan.principalAmount }),
      },
    }),
  ]);

  await poolDeductClaim(claimAmount);

  return { success: true, claimAmount };
}

/** Admin denies an insurance claim with a reason. */
export async function denyInsuranceClaim(
  loanId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: { insurance: true },
  });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (!loan.insurance) return { success: false, error: 'This loan has no insurance' };
  if (loan.insurance.claimStatus === 'APPROVED') return { success: false, error: 'Cannot deny an approved claim' };
  if (loan.insurance.claimStatus === 'DENIED') return { success: false, error: 'Claim already denied' };

  await db.$transaction([
    db.loanInsurance.update({
      where: { loanId },
      data: {
        claimStatus: 'DENIED',
        claimable: false,
        claimDenialReason: reason,
      },
    }),
    db.auditLog.create({
      data: {
        loanId,
        characterId: loan.characterId,
        action: 'INSURANCE_CLAIM_DENIED',
        description: `Insurance claim denied: ${reason}`,
        metadata: JSON.stringify({ reason }),
      },
    }),
  ]);

  return { success: true };
}

export async function liquidateCollateral(
  loanId: string
): Promise<{ success: boolean; liquidatedValue?: number; error?: string }> {
  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: { collateralItems: true },
  });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.status !== 'OVERDUE') return { success: false, error: `Loan must be OVERDUE to liquidate (status: ${loan.status})` };

  // Re-appraise collateral at current Janice prices
  let liquidatedValue: number;
  try {
    if (loan.collateralType === 'MIXED' && loan.collateralItems.length > 0) {
      const appraisal = await appraiseItems(
        loan.collateralItems.map((i) => ({ typeName: i.typeName, qty: i.qty }))
      );
      liquidatedValue = appraisal.totalValue > 0 ? appraisal.totalValue : loan.collateralPlexValue;
    } else {
      const appraisal = await appraiseItems([{ typeName: 'PLEX', qty: loan.collateralPlexQty }]);
      liquidatedValue = appraisal.totalValue;
    }
  } catch {
    // Fall back to stored collateral value at loan origination
    const cached = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });
    if (loan.collateralType === 'PLEX' && cached) {
      liquidatedValue = cached.price * loan.collateralPlexQty;
    } else {
      liquidatedValue = loan.collateralPlexValue;
    }
  }

  const now = new Date();

  await db.$transaction([
    db.loan.update({
      where: { id: loanId },
      data: {
        status: 'DEFAULTED',
        defaultedAt: now,
        collateralLiquidatedAt: now,
        collateralLiquidatedValue: liquidatedValue,
      },
    }),
    db.character.update({
      where: { id: loan.characterId },
      data: { totalDefaulted: { increment: 1 } },
    }),
    db.auditLog.create({
      data: {
        loanId,
        characterId: loan.characterId,
        action: 'COLLATERAL_LIQUIDATED',
        description: `Collateral liquidated: ${loan.collateralPlexQty} PLEX at ${liquidatedValue.toLocaleString()} ISK. Loan marked DEFAULTED.`,
        metadata: JSON.stringify({ plexQty: loan.collateralPlexQty, liquidatedValue, principalAmount: loan.principalAmount }),
      },
    }),
  ]);

  // Recalculate credit score — default will hit -150
  await recalculateAndSave(loan.characterId);

  return { success: true, liquidatedValue };
}

export async function getBankStats() {
  const [totalLoans, activeLoans, totalVolume, defaulted] = await Promise.all([
    db.loan.count(),
    db.loan.count({ where: { status: 'ACTIVE' } }),
    db.loan.aggregate({ _sum: { principalAmount: true } }),
    db.loan.count({ where: { status: 'DEFAULTED' } }),
  ]);

  const plexPrice = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });

  return {
    totalLoans,
    activeLoans,
    totalVolume: totalVolume._sum.principalAmount ?? 0,
    defaulted,
    defaultRate: totalLoans ? (defaulted / totalLoans) * 100 : 0,
    plexPrice: plexPrice?.price ?? null,
    plexPriceUpdatedAt: plexPrice?.fetchedAt ?? null,
  };
}
