import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';

export type ActionType =
  | 'ACCEPT_COLLATERAL_CONTRACT'
  | 'SEND_ISK'
  | 'RETURN_COLLATERAL'
  | 'LIQUIDATE_COLLATERAL'
  | 'PROCESS_INSURANCE_CLAIM';

export interface AdminAction {
  type: ActionType;
  loanId: string;
  characterName: string;
  characterId: number;
  amount: number;       // ISK for SEND_ISK, PLEX qty for collateral actions
  description: string;
  createdAt: string;
  urgent?: boolean;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const gracePeriodDays = parseInt(process.env.GRACE_PERIOD_DAYS ?? '7');
  const graceCutoff = new Date(Date.now() - gracePeriodDays * 24 * 60 * 60 * 1000);

  const [approvedLoans, activeNoIsk, completedNoReturn, liquidationEligible, insuranceClaims] = await Promise.all([
    db.loan.findMany({
      where: { status: 'APPROVED', collateralContractId: null },
      include: { character: true },
      orderBy: { updatedAt: 'asc' },
    }),
    db.loan.findMany({
      where: { status: 'ACTIVE', iskSentAt: null },
      include: { character: true },
      orderBy: { updatedAt: 'asc' },
    }),
    db.loan.findMany({
      where: { status: 'COMPLETED', returnContractId: null },
      include: { character: true },
      orderBy: { completedAt: 'asc' },
    }),
    db.loan.findMany({
      where: { status: 'OVERDUE', overdueAt: { lt: graceCutoff } },
      include: { character: true },
      orderBy: { overdueAt: 'asc' },
    }),
    db.loan.findMany({
      where: { status: 'DEFAULTED', hasInsurance: true, insurance: { claimable: true } },
      include: { character: true, insurance: true },
      orderBy: { defaultedAt: 'asc' },
    }),
  ]);

  const actions: AdminAction[] = [
    // Urgent: liquidations first, then insurance claims
    ...insuranceClaims.map((loan) => ({
      type: 'PROCESS_INSURANCE_CLAIM' as ActionType,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.principalAmount * (loan.insurance?.coveragePercent ?? 0.8),
      description: `Process insurance claim for ${loan.character.characterName} — ${((loan.insurance?.coveragePercent ?? 0.8) * 100).toFixed(0)}% of ${loan.principalAmount.toLocaleString()} ISK`,
      createdAt: loan.defaultedAt?.toISOString() ?? loan.updatedAt.toISOString(),
      urgent: true,
    })),
    ...liquidationEligible.map((loan) => ({
      type: 'LIQUIDATE_COLLATERAL' as ActionType,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.collateralPlexQty,
      description: `Liquidate ${loan.collateralPlexQty} PLEX from ${loan.character.characterName} — grace period expired`,
      createdAt: loan.overdueAt?.toISOString() ?? loan.updatedAt.toISOString(),
      urgent: true,
    })),
    ...approvedLoans.map((loan) => ({
      type: 'ACCEPT_COLLATERAL_CONTRACT' as ActionType,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.collateralPlexQty,
      description: `Accept contract from ${loan.character.characterName} for ${loan.collateralPlexQty} PLEX`,
      createdAt: loan.updatedAt.toISOString(),
    })),
    ...activeNoIsk.map((loan) => ({
      type: 'SEND_ISK' as ActionType,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.principalAmount,
      description: `Send ${loan.principalAmount.toLocaleString()} ISK to ${loan.character.characterName}`,
      createdAt: loan.updatedAt.toISOString(),
    })),
    ...completedNoReturn.map((loan) => ({
      type: 'RETURN_COLLATERAL' as ActionType,
      loanId: loan.id,
      characterName: loan.character.characterName,
      characterId: loan.character.characterId,
      amount: loan.collateralPlexQty,
      description: `Return ${loan.collateralPlexQty} PLEX to ${loan.character.characterName}`,
      createdAt: loan.completedAt?.toISOString() ?? loan.updatedAt.toISOString(),
    })),
  ];

  return NextResponse.json({ actions, count: actions.length });
}
