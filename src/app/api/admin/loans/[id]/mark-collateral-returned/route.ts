import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({ contractId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'contractId required' }, { status: 400 });

  const loan = await db.loan.findUnique({ where: { id } });
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  if (loan.status !== 'COMPLETED') return NextResponse.json({ error: 'Loan must be COMPLETED' }, { status: 422 });
  if (loan.returnContractId) return NextResponse.json({ error: 'Collateral already marked as returned' }, { status: 409 });

  await db.loan.update({ where: { id }, data: { returnContractId: parsed.data.contractId } });
  await db.auditLog.create({
    data: {
      loanId: id,
      characterId: loan.characterId,
      action: 'COLLATERAL_RETURNED',
      description: `Admin returned ${loan.collateralPlexQty} PLEX collateral. Contract: ${parsed.data.contractId}`,
      metadata: JSON.stringify({ contractId: parsed.data.contractId }),
    },
  });

  return NextResponse.json({ success: true });
}
