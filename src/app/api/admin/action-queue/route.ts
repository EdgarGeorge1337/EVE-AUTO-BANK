import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';

export type ActionType =
  | 'ACCEPT_COLLATERAL_CONTRACT'
  | 'SEND_ISK'
  | 'RETURN_COLLATERAL';

export interface AdminAction {
  type: ActionType;
  loanId: string;
  characterName: string;
  characterId: number;
  amount: number;       // ISK for SEND_ISK, PLEX qty for collateral actions
  description: string;
  createdAt: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [approvedLoans, activeNoIsk, completedNoReturn] = await Promise.all([
    // APPROVED + no collateralContractId → admin needs to accept PLEX contract in-game
    db.loan.findMany({
      where: { status: 'APPROVED', collateralContractId: null },
      include: { character: true },
      orderBy: { updatedAt: 'asc' },
    }),
    // ACTIVE + no iskSentAt → admin needs to send ISK to borrower
    db.loan.findMany({
      where: { status: 'ACTIVE', iskSentAt: null },
      include: { character: true },
      orderBy: { updatedAt: 'asc' },
    }),
    // COMPLETED + no returnContractId → admin needs to return PLEX collateral
    db.loan.findMany({
      where: { status: 'COMPLETED', returnContractId: null },
      include: { character: true },
      orderBy: { completedAt: 'asc' },
    }),
  ]);

  const actions: AdminAction[] = [
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
