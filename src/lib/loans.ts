// Core loan business logic

import { db } from '@/lib/db';
import { appraisePlexValue } from '@/lib/esi';
import { appraiseItems } from '@/lib/janice';
import { recalculateAndSave } from '@/lib/credit-score';

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
}

export interface LoanApplicationResult {
  success: boolean;
  loanId?: string;
  error?: string;
  ltv?: number;
  collateralValue?: number;
}

export async function applyForLoan(input: LoanApplicationInput): Promise<LoanApplicationResult> {
  const { characterId, principalAmount, plexQty, termDays, wantsInsurance } = input;
  const term = termDays ?? DEFAULT_TERM_DAYS;

  // Appraise collateral
  let collateralValue: number;
  if (!plexQty) {
    return { success: false, error: 'PLEX collateral required (multi-asset collateral not yet supported)' };
  }
  try {
    collateralValue = await appraisePlexValue(plexQty);
  } catch {
    // Fall back to cached price
    const cached = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });
    if (!cached) return { success: false, error: 'Unable to appraise PLEX - no price data available' };
    collateralValue = cached.price * plexQty;
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
    ltv <= 0.6;

  const insurancePremium = wantsInsurance ? principalAmount * 0.02 : 0;

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
      collateralPlexQty: plexQty,
      collateralPlexValue: collateralValue,
      ltvRatio: ltv,
      hasInsurance: wantsInsurance ?? false,
      nextPaymentDue: dueDate,
      insurance: wantsInsurance
        ? {
            create: {
              premiumAmount: insurancePremium,
              coveragePercent: 0.8,
            },
          }
        : undefined,
    },
  });

  await db.auditLog.create({
    data: {
      loanId: loan.id,
      characterId,
      action: autoApprovalEligible ? 'LOAN_AUTO_APPROVED' : 'LOAN_APPLIED',
      description: `Loan application for ${principalAmount.toLocaleString()} ISK, ${plexQty} PLEX collateral`,
      metadata: JSON.stringify({ ltv, collateralValue, autoApprovalEligible }),
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


export async function processInsuranceClaim(
  loanId: string
): Promise<{ success: boolean; claimAmount?: number; error?: string }> {
  const loan = await db.loan.findUnique({
    where: { id: loanId },
    include: { insurance: true },
  });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.status !== 'DEFAULTED') return { success: false, error: 'Insurance claims can only be filed on defaulted loans' };
  if (!loan.insurance) return { success: false, error: 'This loan has no insurance' };
  if (!loan.insurance.claimable) return { success: false, error: 'Insurance claim already processed' };

  const claimAmount = loan.principalAmount * loan.insurance.coveragePercent;

  await db.$transaction([
    db.loanInsurance.update({
      where: { loanId },
      data: {
        claimable: false,
        claimedAt: new Date(),
        claimAmount,
      },
    }),
    db.auditLog.create({
      data: {
        loanId,
        characterId: loan.characterId,
        action: 'INSURANCE_CLAIM_PROCESSED',
        description: `Insurance claim processed: ${claimAmount.toLocaleString()} ISK (${(loan.insurance.coveragePercent * 100).toFixed(0)}% of ${loan.principalAmount.toLocaleString()} ISK principal)`,
        metadata: JSON.stringify({ claimAmount, coveragePercent: loan.insurance.coveragePercent, principalAmount: loan.principalAmount }),
      },
    }),
  ]);

  return { success: true, claimAmount };
}

export async function liquidateCollateral(
  loanId: string
): Promise<{ success: boolean; liquidatedValue?: number; error?: string }> {
  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan) return { success: false, error: 'Loan not found' };
  if (loan.status !== 'OVERDUE') return { success: false, error: `Loan must be OVERDUE to liquidate (status: ${loan.status})` };

  // Get current PLEX value via Janice
  let liquidatedValue: number;
  try {
    const appraisal = await appraiseItems([{ typeName: 'PLEX', qty: loan.collateralPlexQty }]);
    liquidatedValue = appraisal.totalValue;
  } catch {
    // Fall back to cached price
    const cached = await db.plexPriceCache.findFirst({ orderBy: { fetchedAt: 'desc' } });
    if (!cached) return { success: false, error: 'Cannot determine PLEX value — no price data available' };
    liquidatedValue = cached.price * loan.collateralPlexQty;
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
