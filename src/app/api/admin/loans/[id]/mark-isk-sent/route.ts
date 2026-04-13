import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-customer';
import { db } from '@/lib/db';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const loan = await db.loan.findUnique({ where: { id } });
  if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
  if (loan.status !== 'ACTIVE') return NextResponse.json({ error: 'Loan must be ACTIVE' }, { status: 422 });
  if (loan.iskSentAt) return NextResponse.json({ error: 'ISK already marked as sent' }, { status: 409 });

  await db.loan.update({ where: { id }, data: { iskSentAt: new Date() } });
  await db.auditLog.create({
    data: {
      loanId: id,
      characterId: loan.characterId,
      action: 'LOAN_ISK_SENT',
      description: `Admin marked ${loan.principalAmount.toLocaleString()} ISK as sent to borrower`,
    },
  });

  return NextResponse.json({ success: true });
}
